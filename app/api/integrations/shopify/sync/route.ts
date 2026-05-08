import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { uploadImageFromUrl } from "@/lib/storage";
import { UniversalListing } from "@/lib/universal-listing";
import { saveUniversalListings } from "@/actions/listing";
import { listShopifyProducts, type ShopifyAuth, type ShopifyProduct } from "@/lib/shopify";

export async function POST() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Fetch Shopify credentials
        const { data: integrations } = await supabase
            .from("user_integrations")
            .select("access_token")
            .eq("user_id", user.id)
            .eq("platform", "shopify")
            .limit(1);

        const integration = integrations?.[0] ?? null;
        if (!integration) {
            return NextResponse.json(
                { error: "Shopify account not connected. Visit /account to add your credentials." },
                { status: 400 }
            );
        }

        const { store_url, access_token } = JSON.parse(integration.access_token);
        const auth: ShopifyAuth = { storeUrl: store_url, accessToken: access_token };

        console.log(`[shopify/sync] Fetching products from ${store_url}`);
        const products = await listShopifyProducts(auth);
        console.log(`[shopify/sync] Got ${products.length} products`);

        // Batch lookup: find all existing listings by shopify_product_id in one query
        const allProductIds = products.map((p) => String(p.id));
        const { data: existingRows } = await supabase
            .from("listings")
            .select("id, platforms_status, shopify_product_id")
            .eq("user_id", user.id)
            .in("shopify_product_id", allProductIds);

        const existingMap = new Map(
            (existingRows ?? []).map((row) => [row.shopify_product_id, row])
        );

        const enrichedProducts: (ShopifyProduct & { _hostedImages: string[] })[] = [];

        for (const product of products) {
            const existing = existingMap.get(String(product.id));

            if (existing) {
                // Merge status without overwriting other platforms
                const merged = { ...(existing.platforms_status ?? {}), shopify: "listed" };
                await supabase
                    .from("listings")
                    .update({ platforms_status: merged })
                    .eq("id", existing.id);
                continue;
            }

            // Re-host images into Supabase Storage
            const rawImages = product.images.map((img) => img.src);
            const uploadedUrls = await Promise.all(
                rawImages.map((url) => uploadImageFromUrl(supabase, url, `shopify-${product.id}`))
            );
            const permanentImages = uploadedUrls.filter((url): url is string => url !== null);

            enrichedProducts.push({ ...product, _hostedImages: permanentImages });
        }

        const universalListings = enrichedProducts.map((p) =>
            UniversalListing.fromShopify(p).toPlainObject()
        );

        const result = await saveUniversalListings(universalListings);

        console.log(`[shopify/sync] Done — saved ${result.count} listings for user ${user.id}`);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error("[shopify/sync] Unexpected error:", error);
        return NextResponse.json(
            { error: "Internal server error", detail: error.message },
            { status: 500 }
        );
    }
}
