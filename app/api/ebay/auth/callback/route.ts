import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");

    console.log("eBay Callback: Started", { code: code ? "Present" : "Missing" });

    if (!code) {
        return NextResponse.redirect(`${origin}/account?error=No code provided`);
    }

    const cookieStore = await cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        console.error("eBay Callback: No user session found", authError);
        return NextResponse.redirect(`${origin}/login?message=Please login to connect eBay`);
    }

    console.log("eBay Callback: User ID identified:", user.id);

    // Exchange code for tokens
    const clientId = process.env.EBAY_APP_ID!;
    const certId = process.env.EBAY_CERT_ID!;
    const redirectUri = process.env.EBAY_REDIRECT_URI!;
    const credentials = Buffer.from(`${clientId}:${certId}`).toString("base64");

    try {
        console.log("eBay Callback: Exchanging code for tokens...");
        const tokenResponse = await fetch("https://api.sandbox.ebay.com/identity/v1/oauth2/token", {
            method: "POST",
            headers: {
                "Authorization": `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code: code,
                redirect_uri: redirectUri,
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error("eBay Token Error:", errorText);
            return NextResponse.redirect(`${origin}/account?error=Failed to exchange token`);
        }

        const tokens = await tokenResponse.json();
        console.log("eBay Callback: Exchange successful, token received");

        const { access_token, refresh_token, expires_in } = tokens;

        // Calculate expiry
        const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

        // Store in Supabase
        console.log("eBay Callback: Upserting tokens for user:", user.id);
        const { error: dbError } = await supabase
            .from("user_integrations")
            .upsert({
                user_id: user.id,
                platform: "ebay",
                access_token,
                refresh_token,
                expires_at: expiresAt,
                created_at: new Date().toISOString(),
            }, { onConflict: "user_id,platform" });

        if (dbError) {
            console.error("eBay Callback: Database Error:", dbError);
            return NextResponse.redirect(`${origin}/account?error=Failed to save connection`);
        }

        console.log("eBay Callback: Connection saved successfully");
        return NextResponse.redirect(`${origin}/account?success=eBay connected`);

    } catch (error) {
        console.error("Callback Error:", error);
        return NextResponse.redirect(`${origin}/account?error=Internal server error`);
    }
}
