import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import {
    getGrailedReturnAddressId,
    searchGrailedDesigner,
    presignGrailedPhoto,
    uploadPhotoToGrailed,
    createGrailedListing,
    type GrailedAuth,
    type GrailedListingInput,
} from "@/lib/grailed";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            ...corsHeaders,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    });
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }

        const body = await request.json();
        const { listingId } = body;

        if (!listingId) {
            return NextResponse.json({ error: "listingId is required" }, { status: 400, headers: corsHeaders });
        }

        // Fetch the listing
        const { data: listing, error: listingError } = await supabase
            .from("listings")
            .select("*")
            .eq("id", listingId)
            .eq("user_id", user.id)
            .single();

        if (listingError || !listing) {
            return NextResponse.json({ error: "Listing not found" }, { status: 404, headers: corsHeaders });
        }

        // Fetch Grailed credentials from DB
        const { data: integrations } = await supabase
            .from("user_integrations")
            .select("access_token, refresh_token")
            .eq("user_id", user.id)
            .eq("platform", "grailed")
            .order("created_at", { ascending: false })
            .limit(1);

        const integration = integrations?.[0] ?? null;

        if (!integration) {
            return NextResponse.json(
                { error: "Grailed account not connected. Visit grailed.com while the extension is active to capture your session." },
                { status: 400, headers: corsHeaders }
            );
        }

        const { user_id, device_id, csrf_token } = JSON.parse(integration.access_token);
        const cookies: string = integration.refresh_token;

        if (!csrf_token) {
            return NextResponse.json(
                { error: "No Grailed CSRF token captured yet. Make any action on grailed.com (e.g. click a listing) to capture it, then try again." },
                { status: 400, headers: corsHeaders }
            );
        }

        const csrfToken: string = csrf_token;

        const auth: GrailedAuth = {
            cookies,
            userId: String(user_id),
            deviceId: device_id ?? crypto.randomUUID(),
        };

        // Get the user's return address
        const returnAddressId = await getGrailedReturnAddressId(auth.userId, cookies, csrfToken);
        if (!returnAddressId) {
            return NextResponse.json(
                { error: "No return address found on your Grailed account. Add one at grailed.com/settings/shipping." },
                { status: 400, headers: corsHeaders }
            );
        }

        // Upload photos to Grailed's S3
        const imageUrls: string[] = Array.isArray(listing.images) ? listing.images : [];
        const photos: Array<{ cdnUrl: string }> = [];

        for (const imageUrl of imageUrls.slice(0, 8)) {
            try {
                const presign = await presignGrailedPhoto(cookies, csrfToken, auth.deviceId);
                const uploaded = await uploadPhotoToGrailed(imageUrl, presign);
                photos.push(uploaded);
                console.log(`[Grailed Crosslist] Uploaded photo ${photos.length}/${imageUrls.length}`);
            } catch (err: any) {
                console.error(`[Grailed Crosslist] Photo upload failed for ${imageUrl}:`, err.message);
            }
        }

        if (photos.length === 0) {
            return NextResponse.json(
                {
                    error: imageUrls.length === 0
                        ? "This listing has no images. Add at least one photo before cross-listing to Grailed."
                        : "All photo uploads to Grailed failed. Your session may have expired.",
                },
                { status: 400, headers: corsHeaders }
            );
        }

        // Normalize brand — treat null-string from DB as empty
        const brand = (listing.brand && listing.brand !== 'null') ? listing.brand : null;

        // Look up designer — fall back through generic options if brand not found
        let designer = brand ? await searchGrailedDesigner(brand, cookies, csrfToken) : null;

        if (designer) {
            console.log(`[Grailed Crosslist] Matched designer: ${designer.name} (id=${designer.id})`);
        } else {
            // Try generic fallbacks — Grailed requires a real designer ID
            for (const fallback of ['Vintage', 'Other', 'Handmade']) {
                designer = await searchGrailedDesigner(fallback, cookies, csrfToken);
                if (designer) {
                    console.log(`[Grailed Crosslist] Using fallback designer: ${designer.name} (id=${designer.id}) for brand "${brand}"`);
                    break;
                }
            }
            if (!designer) {
                return NextResponse.json(
                    { error: `Brand "${brand ?? '(none)'}" not found on Grailed and no fallback designer available. Add a recognizable brand to this listing.` },
                    { status: 400, headers: corsHeaders }
                );
            }
        }

        const input: GrailedListingInput = {
            title: listing.title,
            description: listing.description || "",
            price: listing.price,
            condition: listing.condition,
            size: listing.size || "m",
            brand: brand || "",
            images: imageUrls,
        };

        // Create the listing
        const result = await createGrailedListing(auth, input, csrfToken, returnAddressId, photos, designer);

        // Update DB
        await supabase
            .from("listings")
            .update({
                grailed_listing_url: result.url,
                platforms_status: {
                    ...(listing.platforms_status ?? {}),
                    grailed: "listed",
                },
            })
            .eq("id", listingId);

        return NextResponse.json({ success: true, listingUrl: result.url }, { headers: corsHeaders });

    } catch (error: any) {
        console.error("[Grailed Crosslist] Unexpected error:", error);
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
}
