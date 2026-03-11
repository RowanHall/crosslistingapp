import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

        const { fb_dtsg, lsd, cookies, user_id } = await request.json();

        if (!fb_dtsg || !lsd) {
            return NextResponse.json(
                { error: "fb_dtsg and lsd are required" },
                { status: 400, headers: corsHeaders }
            );
        }

        const { error: dbError } = await supabase
            .from("user_integrations")
            .upsert(
                {
                    user_id: user.id,
                    platform: "facebook",
                    access_token: JSON.stringify({ fb_dtsg, lsd, user_id }),
                    refresh_token: cookies ?? null,
                    expires_at: null,
                    created_at: new Date().toISOString(),
                },
                { onConflict: "user_id,platform" }
            );

        if (dbError) {
            console.error("Facebook Integration: DB error:", dbError);
            return NextResponse.json(
                { error: "Failed to save credentials" },
                { status: 500, headers: corsHeaders }
            );
        }

        console.log("Facebook Integration: Credentials saved for user", user.id);
        return NextResponse.json({ success: true }, { headers: corsHeaders });

    } catch (error) {
        console.error("Facebook Integration: Unexpected error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500, headers: corsHeaders }
        );
    }
}
