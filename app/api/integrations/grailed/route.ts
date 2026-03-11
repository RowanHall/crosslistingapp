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

        const { cookies, user_id, device_id, csrf_token } = await request.json();

        if (!cookies || !user_id) {
            return NextResponse.json(
                { error: "cookies and user_id are required" },
                { status: 400, headers: corsHeaders }
            );
        }

        const { error: dbError } = await supabase
            .from("user_integrations")
            .upsert(
                {
                    user_id: user.id,
                    platform: "grailed",
                    access_token: JSON.stringify({ user_id, device_id, csrf_token: csrf_token ?? null }),
                    refresh_token: cookies,
                    expires_at: null,
                    created_at: new Date().toISOString(),
                },
                { onConflict: "user_id,platform" }
            );

        if (dbError) {
            console.error("Grailed Integration: DB error:", dbError);
            return NextResponse.json(
                { error: "Failed to save credentials" },
                { status: 500, headers: corsHeaders }
            );
        }

        console.log("Grailed Integration: Credentials saved for user", user.id);
        return NextResponse.json({ success: true }, { headers: corsHeaders });

    } catch (error) {
        console.error("Grailed Integration: Unexpected error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500, headers: corsHeaders }
        );
    }
}
