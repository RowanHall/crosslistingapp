import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { uploadImageFromUrl } from "@/lib/storage";
import { UniversalListing } from "@/lib/universal-listing";
import { saveUniversalListings } from "@/actions/listing";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        const body = await request.json();
        const products: any[] = body.products ?? [];

        if (products.length === 0) {
            return NextResponse.json(
                { success: true, count: 0, message: "No products to sync" },
                { headers: corsHeaders }
            );
        }

        console.log(`[fb/sync] Starting sync for ${products.length} products`);

        // Process products sequentially to avoid memory spikes from parallel fetches.
        // Within each product, upload all images concurrently.
        const enrichedProducts: any[] = [];
        let crosslistUpdates = 0;

        for (const product of products) {
            // --- Duplicate interception -----------------------------------
            // Items that originated on Grailed/Depop and were cross-listed
            // to Facebook will already have a row in our DB with
            // facebook_listing_url pointing at this FB listing ID.
            // If we find one, update its live/sold status and skip the rest
            // of the loop — we must not create a duplicate row.
            const fbUrl = `https://www.facebook.com/marketplace/item/${product.id}/`;
            const { data: crosslisted } = await supabase
                .from("listings")
                .select("id, platforms_status")
                .eq("user_id", user.id)
                .ilike("facebook_listing_url", `%${product.id}%`)
                .maybeSingle();

            if (crosslisted) {
                // Derive the new Facebook status from the incoming sync data
                const fbStatus = product.isSold
                    ? "sold"
                    : product.isLive
                    ? "listed"
                    : "unlisted";

                const merged = {
                    ...(crosslisted.platforms_status ?? {}),
                    facebook: fbStatus,
                };

                await supabase
                    .from("listings")
                    .update({ platforms_status: merged })
                    .eq("id", crosslisted.id);

                console.log(
                    `[fb/sync] Product ${product.id} is a cross-listed item (row ${crosslisted.id}) — updated facebook status to "${fbStatus}", skipping upsert`
                );
                crosslistUpdates++;
                continue;
            }

            // --- Normal flow: new FB-native listing -----------------------
            const rawImages: string[] = Array.isArray(product.images) ? product.images : [];

            // Upload all images for this product in parallel
            const uploadedUrls = await Promise.all(
                rawImages.map((url) => uploadImageFromUrl(supabase, url, String(product.id)))
            );

            // Filter out any failed uploads — don't let one bad image block the row
            const permanentImages = uploadedUrls.filter((url): url is string => url !== null);

            if (permanentImages.length < rawImages.length) {
                console.warn(
                    `[fb/sync] Product ${product.id}: uploaded ${permanentImages.length}/${rawImages.length} images`
                );
            }

            enrichedProducts.push({ ...product, images: permanentImages });
        }

        console.log(
            `[fb/sync] Image upload complete. ${crosslistUpdates} cross-listed items updated, saving ${enrichedProducts.length} new listings to DB`
        );

        // Map raw FB data → UniversalListing and persist
        const universalListings = enrichedProducts.map((p) =>
            UniversalListing.fromFacebook(p).toPlainObject()
        );

        const result = await saveUniversalListings(universalListings);
        let ghostsArchived = 0;

        // --- Reconciliation pass: soft-archive listings deleted on Facebook --
        //
        // SAFETY RULE: never hard-delete based on missing sync data.
        // A partial API response, rate-limit, or pagination gap could make
        // live listings appear to vanish. We only ever mark them as "unlisted".
        //
        // Ghost = a row in our DB with an active FB connection whose FB listing
        // ID did not appear in the current sync payload.

        const syncedFbIds = new Set(products.map((p: any) => String(p.id)));

        // Fetch every row for this user that currently has an active FB connection.
        // We filter client-side so we can handle both connection types in one query.
        const { data: fbConnectedRows, error: ghostQueryError } = await supabase
            .from("listings")
            .select("id, source, external_id, platforms_status, grailed_listing_url, facebook_listing_url")
            .eq("user_id", user.id)
            .or("source.eq.facebook,facebook_listing_url.not.is.null");

        if (ghostQueryError) {
            // Non-fatal — log and skip reconciliation rather than failing the whole sync
            console.error("[fb/sync] Reconciliation query failed, skipping ghost pass:", ghostQueryError.message);
        } else {
            const ghosts = (fbConnectedRows ?? []).filter((row) => {
                if (row.source === "facebook") {
                    // FB-native: only consider rows that are currently active on FB
                    const currentStatus = row.platforms_status?.facebook;
                    if (currentStatus === "unlisted" || currentStatus === "deleted") return false;
                    return !syncedFbIds.has(String(row.external_id));
                } else {
                    // Cross-listed: extract the FB listing ID from the stored URL
                    // e.g. https://www.facebook.com/marketplace/item/1545306466555706/
                    const idFromUrl = row.facebook_listing_url?.match(/marketplace\/item\/(\d+)/)?.[1];
                    if (!idFromUrl) return false;
                    return !syncedFbIds.has(idFromUrl);
                }
            });

            if (ghosts.length === 0) {
                console.log("[fb/sync] Reconciliation: no ghost listings found");
            } else {
                console.log(`[fb/sync] Reconciliation: found ${ghosts.length} ghost listing(s) — soft-archiving`);

                // Split into the two update shapes so we can batch the URL clear
                const crosslistedGhostIds = ghosts
                    .filter((r) => r.source !== "facebook" && r.facebook_listing_url)
                    .map((r) => r.id);

                // Batch-clear facebook_listing_url for cross-listed ghosts (single query)
                if (crosslistedGhostIds.length > 0) {
                    const { error } = await supabase
                        .from("listings")
                        .update({ facebook_listing_url: null })
                        .in("id", crosslistedGhostIds);
                    if (error) console.error("[fb/sync] Reconciliation: failed to clear facebook_listing_url:", error.message);
                }

                // Update platforms_status per-row (JSONB merge requires individual writes)
                for (const ghost of ghosts) {
                    const merged = {
                        ...(ghost.platforms_status ?? {}),
                        facebook: "unlisted",
                    };
                    const { error } = await supabase
                        .from("listings")
                        .update({ platforms_status: merged })
                        .eq("id", ghost.id);

                    if (error) {
                        console.error(`[fb/sync] Reconciliation: failed to archive row ${ghost.id}:`, error.message);
                    } else {
                        ghostsArchived++;
                    }
                }

                console.log(`[fb/sync] Reconciliation: archived ${ghostsArchived}/${ghosts.length} ghost listings`);
            }
        }

        console.log(`[fb/sync] Done — saved ${result.count} listings, archived ${ghostsArchived} ghosts for user ${user.id}`);
        return NextResponse.json({ ...result, ghostsArchived }, { headers: corsHeaders });

    } catch (error: any) {
        console.error("[fb/sync] Unexpected error:", error);
        return NextResponse.json(
            { error: "Internal server error", detail: error.message },
            { status: 500, headers: corsHeaders }
        );
    }
}
