"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

// Helper to create Supabase client with cookies
async function createClient() {
    const cookieStore = await cookies();
    return createServerClient(
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
                        // Ignored
                    }
                },
            },
        }
    );
}

export async function disconnectEbayAccount() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error("User not authenticated");

    await supabase.from("user_integrations").delete().match({ user_id: user.id, platform: "ebay" });
    revalidatePath("/account");
    return { success: true };
}

export async function getEbayConnectionStatus() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return false;

    const { data } = await supabase
        .from("user_integrations")
        .select("id")
        .eq("user_id", user.id)
        .eq("platform", "ebay")
        .single();

    return !!data;
}

// --- REAL EBAY PUBLISHING LOGIC ---

async function getFirstPolicy(accessToken: string, type: 'fulfillment' | 'payment' | 'return') {
    console.log(`[eBay] Fetching ${type} policies...`);
    const response = await fetch(`https://api.sandbox.ebay.com/sell/account/v1/${type}_policy`, {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        }
    });

    const data = await response.json();
    console.log(`[eBay] ${type} policy response:`, JSON.stringify(data, null, 2));

    if (!response.ok) {
        throw new Error(`Failed to fetch ${type} policies: ${data.errors?.[0]?.message || response.statusText}`);
    }

    const policies = data[`${type}Policies`];
    if (!policies || policies.length === 0) {
        throw new Error(`No ${type} Policy found in eBay Sandbox. Please create one in the Seller Hub.`);
    }

    return policies[0][`${type}PolicyId`];
}

export async function publishToEbay(listingId: string) {
    console.log(`[eBay] Starting publish flow for listing ${listingId}`);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        throw new Error("User not authenticated");
    }

    // 1. Fetch Listing Data
    const { data: listing, error: listingError } = await supabase
        .from("listings")
        .select("*")
        .eq("id", listingId)
        .single();

    if (listingError || !listing) {
        console.error("[eBay] Listing fetch error:", listingError);
        throw new Error("Listing not found");
    }

    // 2. Fetch eBay Access Token
    const { data: integration, error: tokenError } = await supabase
        .from("user_integrations")
        .select("access_token")
        .eq("user_id", user.id)
        .eq("platform", "ebay")
        .single();

    if (tokenError || !integration) {
        console.error("[eBay] Token fetch error:", tokenError);
        throw new Error("Not connected to eBay");
    }

    const accessToken = integration.access_token;
    const sku = listing.sku || `listing-${Date.now()}`; // Use listing SKU or generate one

    try {
        // 3. Fetch Policy IDs
        const fulfillmentPolicyId = await getFirstPolicy(accessToken, 'fulfillment');
        const paymentPolicyId = await getFirstPolicy(accessToken, 'payment');
        const returnPolicyId = await getFirstPolicy(accessToken, 'return');

        console.log(`[eBay] Policies found: Fulfillment=${fulfillmentPolicyId}, Payment=${paymentPolicyId}, Return=${returnPolicyId}`);

        // 4. STEP A: CREATE INVENTORY ITEM
        console.log(`[eBay] Creating Inventory Item (SKU: ${sku})...`);
        const createItemUrl = `https://api.sandbox.ebay.com/sell/inventory/v1/inventory_item/${sku}`;
        const itemBody = {
            availability: { shipToLocationAvailability: { quantity: 1 } },
            condition: "NEW",
            product: {
                title: listing.title,
                description: listing.description || "No description",
                imageUrls: listing.images && listing.images.length > 0 ? listing.images : ["https://via.placeholder.com/300"], // Fallback image
                aspects: { "Brand": ["Unbranded"] }
            }
        };

        const createItemResponse = await fetch(createItemUrl, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "Content-Language": "en-US"
            },
            body: JSON.stringify(itemBody)
        });

        if (!createItemResponse.ok) {
            // PUT returns 204 on success (no content), so !ok is real error
            // But sometimes it returns 200/201? eBay usually 204 for PUT.
            // Let's check status.
            const text = await createItemResponse.text();
            console.error(`[eBay] Create Item Failed: ${createItemResponse.status}`, text);
            throw new Error(`Failed to create inventory item: ${text}`);
        }
        console.log("[eBay] Inventory Item Created Successfully");


        // 5. STEP B: CREATE OFFER
        console.log("[eBay] Creating Offer...");
        const createOfferUrl = "https://api.sandbox.ebay.com/sell/inventory/v1/offer";
        const offerBody = {
            sku: sku,
            marketplaceId: "EBAY_US",
            format: "FIXED_PRICE",
            availableQuantity: 1,
            categoryId: "9355", // Cell Phones & Smartphones (Generic test ID)
            listingDescription: listing.description || "No description",
            pricingSummary: { price: { currency: "USD", value: listing.price.toString() } },
            listingPolicies: {
                fulfillmentPolicyId,
                paymentPolicyId,
                returnPolicyId
            }
        };

        const createOfferResponse = await fetch(createOfferUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "Content-Language": "en-US"
            },
            body: JSON.stringify(offerBody)
        });

        const offerData = await createOfferResponse.json();
        console.log("[eBay] Create Offer Response:", JSON.stringify(offerData, null, 2));

        if (!createOfferResponse.ok) {
            throw new Error(`Failed to create offer: ${offerData.errors?.[0]?.message || JSON.stringify(offerData)}`);
        }

        const offerId = offerData.offerId;
        console.log(`[eBay] Offer Created. Offer ID: ${offerId}`);


        // 6. STEP C: PUBLISH OFFER
        console.log(`[eBay] Publishing Offer ${offerId}...`);
        const publishUrl = `https://api.sandbox.ebay.com/sell/inventory/v1/offer/${offerId}/publish`;

        const publishResponse = await fetch(publishUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            }
        });

        const publishData = await publishResponse.json();
        console.log("[eBay] Publish Response:", JSON.stringify(publishData, null, 2));

        if (!publishResponse.ok) {
            throw new Error(`Failed to publish offer: ${publishData.errors?.[0]?.message || JSON.stringify(publishData)}`);
        }

        const ebayItemId = publishData.listingId;
        console.log(`[eBay] Published Successfully! Item ID: ${ebayItemId}`);

        // 7. Update Database
        const newStatus = { ...listing.platforms_status, ebay: "listed" };
        await supabase.from("listings").update({ platforms_status: newStatus }).eq("id", listingId);

        return { success: true, ebay_item_id: ebayItemId };

    } catch (error: any) {
        console.error("[eBay] Publish Error:", error);
        // Return error so UI can show it
        throw new Error(error.message || "eBay publishing failed");
    }
}
