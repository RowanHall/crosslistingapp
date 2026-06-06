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

    // Fetch existing platforms_status for any listings already in the DB so we
    // can merge rather than overwrite. Without this, a re-sync from Facebook
    // would clobber a { grailed: "listed" } status set by a crosslist.
    const externalIds = listings.map((item) => item.id);
    const { data: existingRows } = await supabase
        .from("listings")
        .select("external_id, platforms_status")
        .eq("user_id", user.id)
        .in("external_id", externalIds);

    const existingStatusMap = new Map<string, Record<string, string>>(
        (existingRows ?? []).map((row) => [row.external_id, row.platforms_status ?? {}])
    );

    // Map UniversalListing to Supabase DB Insert Type
    const records = listings.map((item) => {
        const existing = existingStatusMap.get(item.id) ?? {};
        // An item imported from a marketplace sync is, by definition, live on
        // its source platform — default to "listed" rather than "draft".
        // Preserve any prior status (e.g. "unlisted"/"sold" set by reconciliation)
        // so we don't accidentally revive a closed listing.
        const platforms_status = {
            ...existing,
            [item.source]: existing[item.source] ?? "listed",
        };

        return {
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
            platforms_status,
        };
    });

    const { data, error } = await supabase
        .from("listings")
        .upsert(records, {
            onConflict: "external_id",
            ignoreDuplicates: false // Update content fields on re-sync
        })
        .select();

    if (error) {
        console.error("Error saving listings to Supabase:", error);
        throw new Error(`Failed to save listings: ${error.message}`);
    }

    return { success: true, count: data?.length || 0 };
}
