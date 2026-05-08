import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import {
    createShopifyProduct,
    type ShopifyAuth,
    type ShopifyListingInput,
} from "@/lib/shopify";

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

        // Fetch listing
        const { data: listing, error: listingError } = await supabase
            .from("listings")
            .select("*")
            .eq("id", listingId)
            .eq("user_id", user.id)
            .single();

        if (listingError || !listing) {
            return NextResponse.json({ error: "Listing not found" }, { status: 404, headers: corsHeaders });
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
                { status: 400, headers: corsHeaders }
            );
        }

        const { store_url, access_token } = JSON.parse(integration.access_token);
        const auth: ShopifyAuth = { storeUrl: store_url, accessToken: access_token };

        const imageUrls: string[] = Array.isArray(listing.images) ? listing.images : [];

        const input: ShopifyListingInput = {
            title: listing.title,
            descriptionHtml: listing.description
                ? listing.description.replace(/\n/g, "<br>")
                : "",
            vendor: listing.brand || "Unknown",
            price: String(listing.price ?? 0),
            images: imageUrls,
            condition: listing.condition ?? "USED_GOOD",
            size: listing.size ?? null,
            tags: [],
        };

        const result = await createShopifyProduct(auth, input);

        // Update DB
        await supabase
            .from("listings")
            .update({
                shopify_listing_url: result.url,
                shopify_product_id: String(result.id),
                platforms_status: {
                    ...(listing.platforms_status ?? {}),
                    shopify: "listed",
                },
            })
            .eq("id", listingId);

        return NextResponse.json({ success: true, listingUrl: result.url }, { headers: corsHeaders });
    } catch (error: any) {
        console.error("[Shopify Crosslist] Unexpected error:", error);
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
}
