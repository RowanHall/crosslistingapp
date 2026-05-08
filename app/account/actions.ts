"use server";

import { getEbayAuthUrl } from "@/utils/ebay/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { verifyShopifyCredentials } from "@/lib/shopify";

export async function connectEbay() {
    const url = getEbayAuthUrl();
    redirect(url);
}

export async function saveDepopToken(formData: FormData) {
    const token = formData.get("token") as string;
    const cookie = formData.get("cookie") as string;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error("User not authenticated");

    // Fetch existing integration to merge data
    const { data: existing } = await supabase
        .from("user_integrations")
        .select("access_token, metadata")
        .eq("user_id", user.id)
        .eq("platform", "depop")
        .single();

    // Merge Token: Use new one if provided, else keep old
    const newToken = token && token.trim() !== "" ? token : existing?.access_token;

    // Merge Cookie: Use new one if provided, else keep old
    const currentMetadata = (existing?.metadata as any) || {};
    const newCookie = cookie && cookie.trim() !== "" ? cookie : currentMetadata.cookie;

    const newMetadata = { ...currentMetadata, cookie: newCookie };

    if (!newToken) {
        // If we still don't have a token (neither new nor existing), we can't save valid state
        // But maybe we just want to save the cookie? 
        // Let's assume we need at least a token to be considered "connected" initially, 
        // but if we are updating, we might already have it.
        if (!existing) return; // Can't create new without token
    }

    const { error } = await supabase
        .from("user_integrations")
        .upsert({
            user_id: user.id,
            platform: "depop",
            access_token: newToken,
            metadata: newMetadata,
            created_at: existing ? undefined : new Date().toISOString(), // Keep original created_at if exists
        }, { onConflict: "user_id, platform" });

    if (error) {
        console.error("Depop Token Save Error:", error);
        throw new Error("Failed to save Depop token");
    }

    revalidatePath("/account");
}

export async function saveShopifyCredentials(formData: FormData) {
    const rawStoreUrl = (formData.get("store_url") as string ?? "").trim();
    const rawAccessToken = (formData.get("access_token") as string ?? "").trim();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    // Fetch existing to allow partial updates (blank field = keep existing)
    const { data: existing } = await supabase
        .from("user_integrations")
        .select("access_token")
        .eq("user_id", user.id)
        .eq("platform", "shopify")
        .single();

    const existingParsed = existing
        ? (() => { try { return JSON.parse(existing.access_token); } catch { return {}; } })()
        : {};

    // Strip https:// prefix
    const storeUrl = (rawStoreUrl || (existingParsed.store_url ?? "")).replace(/^https?:\/\//, "").replace(/\/$/, "");
    const accessToken = rawAccessToken || (existingParsed.access_token ?? "");

    if (!storeUrl || !accessToken) {
        throw new Error("Store URL and access token are required");
    }

    // Verify credentials before saving
    const verified = await verifyShopifyCredentials({ storeUrl, accessToken });
    if (!verified) {
        throw new Error("Could not connect to Shopify — check your store URL and access token");
    }

    const { error } = await supabase
        .from("user_integrations")
        .upsert(
            {
                user_id: user.id,
                platform: "shopify",
                access_token: JSON.stringify({ store_url: storeUrl, access_token: accessToken }),
                metadata: { store_name: verified.storeName },
            },
            { onConflict: "user_id, platform" }
        );

    if (error) {
        console.error("Shopify credential save error:", error);
        throw new Error("Failed to save Shopify credentials");
    }

    revalidatePath("/account");
}
