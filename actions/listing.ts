"use server";

import { createClient } from "@/utils/supabase/server";
import { UniversalListingData } from "@/lib/universal-listing";

export async function saveUniversalListings(listings: UniversalListingData[]) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        throw new Error("User not authenticated");
    }

    if (!listings || listings.length === 0) {
        return { success: true, count: 0 };
    }

    // Map UniversalListing to Supabase DB Insert Type
    const records = listings.map((item) => ({
        user_id: user.id,
        title: item.title,
        description: item.description,
        price: item.price || 0,
        images: item.images,
        currency: item.currency,
        condition: item.condition,
        brand: item.brand,
        size: item.size,
        source: item.source,
        external_id: item.id, // The ID from the platform becomes our external_id
        platform_data: item.originalData, // Raw data blob
        // Initialize platform status for the source platform
        platforms_status: { [item.source]: "draft" },
    }));

    const { data, error } = await supabase
        .from("listings")
        .upsert(records, {
            onConflict: "external_id",
            ignoreDuplicates: false // We want to update if it exists
        })
        .select();

    if (error) {
        console.error("Error saving listings to Supabase:", error);
        throw new Error(`Failed to save listings: ${error.message}`);
    }

    return { success: true, count: data?.length || 0 };
}
