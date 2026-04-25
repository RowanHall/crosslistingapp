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

        console.log(`[grailed/sync] Starting sync for ${products.length} products`);

        const enrichedProducts: any[] = [];
        let crosslistUpdates = 0;

        for (const product of products) {
            // --- Cross-list interception ------------------------------------
            // If this Grailed listing was originally created on another platform
            // (e.g. Facebook) and cross-listed to Grailed, a row already exists
            // with grailed_listing_url pointing at this Grailed listing ID.
            // Update its status and skip — do not re-download images or duplicate.
            const { data: crosslisted } = await supabase
                .from("listings")
                .select("id, platforms_status")
                .eq("user_id", user.id)
                .ilike("grailed_listing_url", `%${product.id}%`)
                .maybeSingle();

            if (crosslisted) {
                const grailedStatus = product.sold_at ? "sold" : "listed";
                const merged = {
                    ...(crosslisted.platforms_status ?? {}),
                    grailed: grailedStatus,
                };
                await supabase
                    .from("listings")
                    .update({ platforms_status: merged })
                    .eq("id", crosslisted.id);

                console.log(
                    `[grailed/sync] Product ${product.id} is a cross-listed item (row ${crosslisted.id}) — updated grailed status to "${grailedStatus}", skipping upsert`
                );
                crosslistUpdates++;
                continue;
            }

            // --- Normal flow: re-host images then upsert --------------------
            const rawImages: string[] = Array.isArray(product.allPhotos) && product.allPhotos.length > 0
                ? product.allPhotos
                : Array.isArray(product.images) ? product.images : [];

            // Upload all images for this product concurrently
            const uploadedUrls = await Promise.all(
                rawImages.map((url) => uploadImageFromUrl(supabase, url, `grailed-${product.id}`))
            );

            const permanentImages = uploadedUrls.filter((url): url is string => url !== null);

            if (permanentImages.length < rawImages.length) {
                console.warn(
                    `[grailed/sync] Product ${product.id}: uploaded ${permanentImages.length}/${rawImages.length} images`
                );
            }

            // Merge permanent URLs back onto the product so fromGrailed picks them up
            enrichedProducts.push({
                ...product,
                allPhotos: permanentImages,
                images: permanentImages,
            });
        }

        console.log(
            `[grailed/sync] Image upload complete. ${crosslistUpdates} cross-listed items updated, saving ${enrichedProducts.length} new listings to DB`
        );

        const universalListings = enrichedProducts.map((p) =>
            UniversalListing.fromGrailed(p).toPlainObject()
        );

        const result = await saveUniversalListings(universalListings);

        console.log(`[grailed/sync] Done — saved ${result.count} listings for user ${user.id}`);
        return NextResponse.json(result, { headers: corsHeaders });

    } catch (error: any) {
        console.error("[grailed/sync] Unexpected error:", error);
        return NextResponse.json(
            { error: "Internal server error", detail: error.message },
            { status: 500, headers: corsHeaders }
        );
    }
}
