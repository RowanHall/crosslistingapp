import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

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

        const { platformId } = await request.json();
        if (!platformId) {
            return NextResponse.json(
                { error: "platformId is required" },
                { status: 400, headers: corsHeaders }
            );
        }

        // --- Find the affected row -------------------------------------------
        // Case 1: item originated on Facebook (external_id = platformId)
        // Case 2: item originated elsewhere and was cross-listed to Facebook
        //         (facebook_listing_url contains the platformId)

        const { data: originRow } = await supabase
            .from("listings")
            .select("id, source, platforms_status, grailed_listing_url, facebook_listing_url")
            .eq("user_id", user.id)
            .eq("external_id", platformId)
            .maybeSingle();

        const { data: crosslistRow } = !originRow
            ? await supabase
                .from("listings")
                .select("id, source, platforms_status, grailed_listing_url, facebook_listing_url")
                .eq("user_id", user.id)
                .ilike("facebook_listing_url", `%${platformId}%`)
                .maybeSingle()
            : { data: null };

        const row = originRow ?? crosslistRow;

        if (!row) {
            // Nothing to clean up — FB listing wasn't tracked in our DB
            console.log(`[fb/delete] No DB row found for platformId ${platformId} — nothing to clean up`);
            return NextResponse.json({ success: true, action: "noop" }, { headers: corsHeaders });
        }

        // --- Decide: hard delete vs soft update ------------------------------

        if (row.source === "facebook") {
            // This listing originated on Facebook. Check whether it has been
            // successfully cross-listed somewhere else before destroying the row.
            const hasActiveCrosslist = !!row.grailed_listing_url
                || Object.entries(row.platforms_status ?? {}).some(
                    ([platform, status]) => platform !== "facebook" && status === "listed"
                );

            if (!hasActiveCrosslist) {
                // Safe to delete — it only ever existed on Facebook
                const { error } = await supabase
                    .from("listings")
                    .delete()
                    .eq("id", row.id);

                if (error) throw new Error(`DB delete failed: ${error.message}`);

                console.log(`[fb/delete] Hard-deleted row ${row.id} (FB-native, no cross-lists)`);
                return NextResponse.json({ success: true, action: "deleted" }, { headers: corsHeaders });
            }

            // Cross-listed to other platforms — keep the row but mark FB as deleted
            const merged = {
                ...(row.platforms_status ?? {}),
                facebook: "deleted",
            };
            const { error } = await supabase
                .from("listings")
                .update({ platforms_status: merged })
                .eq("id", row.id);

            if (error) throw new Error(`DB update failed: ${error.message}`);

            console.log(`[fb/delete] Marked FB status as deleted on row ${row.id} (has active cross-lists)`);
            return NextResponse.json({ success: true, action: "status_updated" }, { headers: corsHeaders });
        }

        // Item originated on another platform and was cross-listed to FB.
        // Clear the facebook_listing_url and remove the FB entry from platforms_status.
        const { facebook: _removed, ...statusWithoutFB } = row.platforms_status ?? {};
        const { error } = await supabase
            .from("listings")
            .update({
                facebook_listing_url: null,
                platforms_status: statusWithoutFB,
            })
            .eq("id", row.id);

        if (error) throw new Error(`DB update failed: ${error.message}`);

        console.log(`[fb/delete] Cleared facebook_listing_url on cross-listed row ${row.id} (source: ${row.source})`);
        return NextResponse.json({ success: true, action: "crosslist_cleared" }, { headers: corsHeaders });

    } catch (error: any) {
        console.error("[fb/delete] Unexpected error:", error);
        return NextResponse.json(
            { error: "Internal server error", detail: error.message },
            { status: 500, headers: corsHeaders }
        );
    }
}
