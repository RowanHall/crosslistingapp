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

        console.log(`[fb/sync] Starting image upload for ${products.length} products`);

        // Process products sequentially to avoid memory spikes from parallel fetches.
        // Within each product, upload all images concurrently.
        const enrichedProducts: any[] = [];

        for (const product of products) {
            const rawImages: string[] = Array.isArray(product.images) ? product.images : [];

            // Upload all images for this product in parallel
            const uploadedUrls = await Promise.all(
                rawImages.map((url) => uploadImageFromUrl(supabase, url, String(product.id)))
            );

            // Filter out any failed uploads (null returns) — don't let one bad image
            // block the listing from being saved
            const permanentImages = uploadedUrls.filter((url): url is string => url !== null);

            if (permanentImages.length < rawImages.length) {
                console.warn(
                    `[fb/sync] Product ${product.id}: uploaded ${permanentImages.length}/${rawImages.length} images`
                );
            }

            enrichedProducts.push({ ...product, images: permanentImages });
        }

        console.log(`[fb/sync] Image upload complete. Saving ${enrichedProducts.length} listings to DB`);

        // Map raw FB data → UniversalListing and persist
        const universalListings = enrichedProducts.map((p) =>
            UniversalListing.fromFacebook(p).toPlainObject()
        );

        const result = await saveUniversalListings(universalListings);

        console.log(`[fb/sync] Done — saved ${result.count} listings for user ${user.id}`);
        return NextResponse.json(result, { headers: corsHeaders });

    } catch (error: any) {
        console.error("[fb/sync] Unexpected error:", error);
        return NextResponse.json(
            { error: "Internal server error", detail: error.message },
            { status: 500, headers: corsHeaders }
        );
    }
}
