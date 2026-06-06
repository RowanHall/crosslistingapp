import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import {
    createFBMarketplaceListing,
    uploadFBPhoto,
    mapConditionToFB,
    type FBMPAuth,
    type FBMPListingInput,
} from "@/lib/facebook-marketplace";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
};

// Handle OPTIONS request for CORS
export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    });
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            console.error('[FB Crosslist] No authenticated user found');
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401, headers: corsHeaders }
            );
        }

        console.log('[FB Crosslist] Authenticated user:', user.id);

        const body = await request.json();
        console.log('[FB Crosslist] Request body:', JSON.stringify(body));
        const { listingId, force } = body as { listingId?: string; force?: boolean };

        if (!listingId) {
            console.error('[FB Crosslist] Missing listingId. Body keys:', Object.keys(body));
            return NextResponse.json(
                { error: "listingId is required" },
                { status: 400, headers: corsHeaders }
            );
        }

        console.log('[FB Crosslist] listingId:', listingId);

        // Fetch the listing (scoped to authenticated user)
        const { data: listing, error: listingError } = await supabase
            .from("listings")
            .select("*")
            .eq("id", listingId)
            .eq("user_id", user.id)
            .single();

        if (listingError || !listing) {
            console.error('[FB Crosslist] Listing not found. Error:', listingError?.message, 'listingId:', listingId, 'userId:', user.id);
            return NextResponse.json(
                { error: "Listing not found" },
                { status: 404, headers: corsHeaders }
            );
        }

        console.log('[FB Crosslist] Found listing:', listing.id, listing.title);

        // Idempotency guard: refuse to re-post a listing already live on Facebook Marketplace
        // unless caller explicitly passes force=true.
        const alreadyListed =
            listing.platforms_status?.facebook === "listed" || !!listing.facebook_listing_url;
        if (alreadyListed && !force) {
            return NextResponse.json(
                {
                    error: "Already listed on Facebook Marketplace",
                    code: "ALREADY_LISTED",
                    listingUrl: listing.facebook_listing_url ?? null,
                },
                { status: 409, headers: corsHeaders }
            );
        }

        // Fetch Facebook credentials — fetch as array to avoid .single() failing on
        // duplicate rows; order by created_at desc so we always get the freshest tokens
        const { data: integrations, error: integrationError } = await supabase
            .from("user_integrations")
            .select("access_token, refresh_token")
            .eq("user_id", user.id)
            .eq("platform", "facebook")
            .order("created_at", { ascending: false })
            .limit(1);
        const integration = integrations?.[0] ?? null;

        if (integrationError || !integration) {
            console.error('[FB Crosslist] No Facebook integration found. Error:', integrationError?.message, 'userId:', user.id);
            return NextResponse.json(
                {
                    error:
                        "Facebook account not connected. Visit facebook.com while the extension is active to capture your session.",
                },
                { status: 400, headers: corsHeaders }
            );
        }

        console.log('[FB Crosslist] Found Facebook integration, parsing credentials...');

        // Parse stored credentials
        const {
            fb_dtsg,
            lsd,
            user_id: fbUserId,
        } = JSON.parse(integration.access_token);
        const cookies = integration.refresh_token;

        const auth: FBMPAuth = {
            cookies,
            fbDtsg: fb_dtsg,
            lsd,
            userId: fbUserId,
        };

        // Upload listing images to Facebook and collect photo IDs
        const imageUrls: string[] = Array.isArray(listing.images) ? listing.images : [];
        console.log(`[FB Crosslist] Uploading ${imageUrls.length} photo(s) to Facebook...`);

        const photoIds: string[] = [];
        for (const imageUrl of imageUrls) {
            try {
                const photoId = await uploadFBPhoto(imageUrl, auth);
                photoIds.push(photoId);
                console.log(`[FB Crosslist] Uploaded photo ${photoIds.length}/${imageUrls.length}: ${photoId}`);
            } catch (err: any) {
                console.error(`[FB Crosslist] Failed to upload photo ${imageUrl}:`, err.message);
                // Continue — list with whatever photos did succeed
            }
        }

        if (photoIds.length === 0) {
            return NextResponse.json(
                {
                    error: imageUrls.length === 0
                        ? "This listing has no images. Add at least one photo before cross-listing to Facebook Marketplace."
                        : "All photo uploads to Facebook failed. Check that your session cookies are still valid.",
                },
                { status: 400, headers: corsHeaders }
            );
        }

        console.log(`[FB Crosslist] ${photoIds.length}/${imageUrls.length} photos uploaded successfully.`);

        const fbListing: FBMPListingInput = {
            title: listing.title,
            description: listing.description || "",
            price: String(listing.price),
            currency: listing.currency || "CAD",
            photoIds,
            // Use the same category as the working test ("Jackets & Coats" under Apparel)
            // 848524915221613 ("Clothing") was triggering field_exception 1675030
            categoryId: "931157863635831",
            condition: mapConditionToFB(listing.condition),
            latitude: Number(process.env.FACEBOOK_DEFAULT_LAT ?? "48.4284"),
            longitude: Number(process.env.FACEBOOK_DEFAULT_LNG ?? "-123.3656"),
            deliveryTypes: ["IN_PERSON"],
        };

        // Call Facebook Marketplace API
        let result: unknown;
        try {
            result = await createFBMarketplaceListing(auth, fbListing);
        } catch (err: any) {
            const msg = err?.message ?? String(err);

            // Session expired or missing sec-fetch headers
            if (msg.includes("1357054") || msg.includes("error")) {
                return NextResponse.json(
                    {
                        error:
                            "Facebook session expired. Re-visit facebook.com to refresh your credentials, then try again.",
                    },
                    { status: 401, headers: corsHeaders }
                );
            }

            return NextResponse.json(
                { error: msg },
                { status: 500, headers: corsHeaders }
            );
        }

        // Extract listing ID and URL from the response
        const res = result as any;
        const fbListingId =
            res?.data?.marketplace_listing_create?.listing?.id;
        const fbListingUrl =
            res?.data?.marketplace_listing_create?.listing?.story?.url ??
            (fbListingId
                ? `https://www.facebook.com/marketplace/item/${fbListingId}`
                : null);

        // Update the listing in the DB
        await supabase
            .from("listings")
            .update({
                facebook_listing_url: fbListingUrl,
                platforms_status: {
                    ...(listing.platforms_status ?? {}),
                    facebook: "listed",
                },
            })
            .eq("id", listingId);

        return NextResponse.json(
            { success: true, listingUrl: fbListingUrl },
            { headers: corsHeaders }
        );
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message },
            { status: 500, headers: corsHeaders }
        );
    }
}
