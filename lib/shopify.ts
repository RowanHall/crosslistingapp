export interface ShopifyAuth {
    storeUrl: string;   // bare domain, e.g. "my-store.myshopify.com"
    accessToken: string;
}

export interface ShopifyListingInput {
    title: string;
    descriptionHtml: string;
    vendor: string;
    price: string;         // e.g. "49.99"
    images: string[];      // public HTTPS URLs
    condition: string;     // app condition enum
    size: string | null;
    tags: string[];
}

export interface ShopifyProduct {
    id: number;
    title: string;
    body_html: string;
    vendor: string;
    tags: string;          // comma-separated
    variants: Array<{ price: string; option1: string | null }>;
    images: Array<{ src: string }>;
    handle: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getShopifyHeaders(accessToken: string) {
    return {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
    };
}

export function shopifyApiUrl(storeUrl: string, path: string): string {
    return `https://${storeUrl}/admin/api/2024-01/${path}`;
}

export function mapConditionToShopifyTag(condition: string): string {
    switch (condition) {
        case "NEW":           return "condition:new";
        case "USED_EXCELLENT": return "condition:used_excellent";
        case "USED_GOOD":     return "condition:used_good";
        case "USED_FAIR":     return "condition:used_fair";
        default:              return "condition:used_good";
    }
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function verifyShopifyCredentials(
    auth: ShopifyAuth
): Promise<{ storeName: string } | null> {
    try {
        const res = await fetch(shopifyApiUrl(auth.storeUrl, "shop.json"), {
            headers: getShopifyHeaders(auth.accessToken),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return { storeName: json.shop?.name ?? auth.storeUrl };
    } catch {
        return null;
    }
}

export async function listShopifyProducts(
    auth: ShopifyAuth,
    limit = 250
): Promise<ShopifyProduct[]> {
    const products: ShopifyProduct[] = [];
    let url: string | null = shopifyApiUrl(
        auth.storeUrl,
        `products.json?limit=${limit}&status=active&fields=id,title,body_html,vendor,tags,variants,images,handle`
    );

    while (url) {
        const res = await fetch(url, { headers: getShopifyHeaders(auth.accessToken) });
        if (!res.ok) {
            throw new Error(`Shopify products fetch failed: ${res.status} ${await res.text()}`);
        }
        const json = await res.json();
        products.push(...(json.products ?? []));

        // Follow pagination via Link header
        const linkHeader = res.headers.get("Link") ?? "";
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        url = nextMatch ? nextMatch[1] : null;
    }

    return products;
}

export async function createShopifyProduct(
    auth: ShopifyAuth,
    input: ShopifyListingInput
): Promise<{ id: number; url: string }> {
    const tags = [
        ...input.tags,
        mapConditionToShopifyTag(input.condition),
    ].join(", ");

    const body = {
        product: {
            title: input.title,
            body_html: input.descriptionHtml,
            vendor: input.vendor || "Unknown",
            tags,
            images: input.images.map((src) => ({ src })),
            options: [{ name: "Size" }],
            variants: [
                {
                    option1: input.size ?? "One Size",
                    price: input.price,
                    inventory_management: null,
                },
            ],
        },
    };

    const res = await fetch(shopifyApiUrl(auth.storeUrl, "products.json"), {
        method: "POST",
        headers: getShopifyHeaders(auth.accessToken),
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        throw new Error(`Shopify create product failed: ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    const product = json.product;
    const url = `https://${auth.storeUrl}/products/${product.handle}`;
    return { id: product.id, url };
}
