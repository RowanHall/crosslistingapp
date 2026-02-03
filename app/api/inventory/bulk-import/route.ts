import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

// Handle OPTIONS request for CORS (Allow Chrome Extension)
export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*', // Allow all origins (specifically Chrome Extension)
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

export async function POST(request: Request) {
    // Helper to add CORS headers to response
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
    };

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        const body = await request.json();
        const { products } = body;

        if (!products || !Array.isArray(products)) {
            return new Response("Invalid body: 'products' array required", { status: 400, headers: corsHeaders });
        }

        const listingsToInsert = products.map((item: any) => {
            // Mapping Logic based on Depop API structure
            return {
                user_id: user.id,
                title: item.slug ? item.slug.replace(/-/g, ' ') : "Untitled", // Replace dashes with spaces
                description: item.description || "",
                price: item.price?.priceAmount || 0,
                // Map pictures array: access first element of each nested array if it exists
                images: item.pictures?.map((p: any) => Array.isArray(p) ? p[0]?.url : p?.url).filter(Boolean) || [],
                status: 'draft', // Default to draft
                external_id: item.id?.toString(), // Prevent duplicates
                platform_data: item, // Storing full JSON for reference
            };
        });

        const { data, error } = await supabase
            .from("listings")
            .upsert(listingsToInsert, { onConflict: 'external_id' }) // Upsert based on external_id
            .select();

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ message: "Import successful", count: data.length }), { status: 200, headers: corsHeaders });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
}
