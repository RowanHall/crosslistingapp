/**
 * Grailed - Create Listing
 * Reverse-engineered from intercepted browser requests.
 * Auth: session cookies (captured by extension) + x-csrf-token (fetched fresh from page).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GrailedAuth {
    cookies: string;  // Full cookie string from captured requests
    userId: string;   // Grailed user ID
    deviceId: string; // Stable UUID for the device
}

export interface GrailedListingInput {
    title: string;
    description: string;
    price: number;
    condition: string;
    size: string;
    brand: string;
    images: string[];
    categoryPath?: string;
}

export interface GrailedDesigner {
    id: string | number | null;
    name: string;
    slug: string | null;
    logo_url: string | null;
    departments: string[];
    collaborations: Array<{ name: string; designer_ids: number[] }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GRAILED_HEADERS = (cookies: string, csrfToken: string, deviceId?: string) => ({
    'Cookie': cookies,
    'x-csrf-token': csrfToken,
    'Accept': 'application/json',
    'accept-version': 'v1',
    'Origin': 'https://www.grailed.com',
    'Referer': 'https://www.grailed.com/sell',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    ...(deviceId ? { 'device-id': deviceId } : {}),
});

export function mapConditionToGrailed(condition: string | null | undefined): string {
    if (!condition) return 'is_used';
    const c = condition.toLowerCase();
    if (c === 'new' || c === 'new_with_tags' || c === 'nwt' || c === 'is_new') return 'is_new';
    if (c.includes('like_new') || c.includes('like new') || c === 'nwot' || c === 'new_without_tags' || c === 'is_gently_used' || c === 'excellent' || c === 'used_excellent') return 'is_gently_used';
    if (c === 'fair' || c === 'poor' || c === 'worn' || c === 'used_fair' || c === 'is_heavily_used') return 'is_heavily_used';
    return 'is_used';
}

export function mapCategoryPath(listing: { title?: string; description?: string; category?: string }): string {
    const text = `${listing.title || ''} ${listing.description || ''} ${listing.category || ''}`.toLowerCase();
    if (/(bomber)/.test(text)) return 'outerwear.bombers';
    if (/(leather.?jacket)/.test(text)) return 'outerwear.leather_jackets';
    if (/(parka)/.test(text)) return 'outerwear.parkas';
    if (/(raincoat|windbreaker)/.test(text)) return 'outerwear.raincoats';
    if (/(puffer|down.?jacket|heavy.?coat|overcoat|trench)/.test(text)) return 'outerwear.heavy_coats';
    if (/(jacket|coat)/.test(text)) return 'outerwear.light_jackets';
    if (/(vest)/.test(text)) return 'outerwear.vests';
    if (/(hoodie|hoody|sweatshirt|crewneck|crew.?neck)/.test(text)) return 'tops.sweatshirts_hoodies';
    if (/(sweater|cardigan|pullover|knitwear)/.test(text)) return 'tops.sweaters_knitwear';
    if (/(polo)/.test(text)) return 'tops.polos';
    if (/(button.?up|button.?down)/.test(text)) return 'tops.button_ups';
    if (/(jersey)/.test(text)) return 'tops.jerseys';
    if (/(jeans|denim)/.test(text)) return 'bottoms.denim';
    if (/(sweatpants|jogger)/.test(text)) return 'bottoms.sweatpants_joggers';
    if (/(pants|trousers|chinos|cords|slacks)/.test(text)) return 'bottoms.casual_pants';
    if (/(shorts)/.test(text)) return 'bottoms.shorts';
    if (/(boot)/.test(text)) return 'footwear.boots';
    if (/(sneaker|trainer|hitop|hi.?top)/.test(text)) return 'footwear.hitop_sneakers';
    if (/(loafer|slip.?on)/.test(text)) return 'footwear.slip_ons';
    if (/(shoe|footwear)/.test(text)) return 'footwear.lowtop_sneakers';
    if (/(hat|cap|beanie|snapback)/.test(text)) return 'accessories.hats';
    if (/(bag|backpack|tote|luggage)/.test(text)) return 'accessories.bags_luggage';
    if (/(wallet)/.test(text)) return 'accessories.wallets';
    if (/(belt)/.test(text)) return 'accessories.belts';
    if (/(watch|jewelry|ring|necklace|bracelet)/.test(text)) return 'accessories.jewelry_watches';
    if (/(sunglass|glasses)/.test(text)) return 'accessories.sunglasses';
    if (/(tee|t-shirt|tshirt|shirt)/.test(text)) return 'tops.short_sleeve_shirts';
    if (/(long.?sleeve)/.test(text)) return 'tops.long_sleeve_shirts';
    return 'tops.short_sleeve_shirts';
}

// ---------------------------------------------------------------------------
// CSRF token
// ---------------------------------------------------------------------------

export async function getGrailedCSRFToken(cookies: string): Promise<string> {
    const response = await fetch('https://www.grailed.com/sell', {
        method: 'GET',
        headers: {
            'Cookie': cookies,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Grailed sell page: ${response.status}`);
    }

    const html = await response.text();
    const match = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/)
        ?? html.match(/<meta\s+content="([^"]+)"\s+name="csrf-token"/);

    if (!match) throw new Error('CSRF token not found. Session may be expired.');
    return match[1];
}

// ---------------------------------------------------------------------------
// Return address
// ---------------------------------------------------------------------------

export async function getGrailedReturnAddressId(
    userId: string,
    cookies: string,
    csrfToken: string
): Promise<number | null> {
    const response = await fetch(
        `https://www.grailed.com/api/users/${userId}/postal_addresses?limit=50&default_return=true`,
        { method: 'GET', headers: GRAILED_HEADERS(cookies, csrfToken) }
    );
    if (!response.ok) return null;

    const data = await response.json() as any;
    const addresses = Array.isArray(data) ? data : (data?.data ?? []);
    return addresses.length > 0 ? addresses[0].id : null;
}

// ---------------------------------------------------------------------------
// Designer lookup
// ---------------------------------------------------------------------------

export async function searchGrailedDesigner(
    brandName: string,
    cookies: string,
    csrfToken: string
): Promise<GrailedDesigner | null> {
    if (!brandName) return null;

    try {
        // Try both known endpoint patterns
        for (const url of [
            `https://www.grailed.com/api/designers/search?search=${encodeURIComponent(brandName)}`,
            `https://www.grailed.com/api/designers?search=${encodeURIComponent(brandName)}`,
        ]) {
            const response = await fetch(url, {
                method: 'GET',
                headers: GRAILED_HEADERS(cookies, csrfToken),
            });
            if (!response.ok) continue;

            const data = await response.json() as any;
            const designers = Array.isArray(data) ? data : (data?.data ?? []);
            if (designers.length === 0) continue;

            const exact = designers.find((d: any) =>
                d.name?.toLowerCase() === brandName.toLowerCase()
            );
            return exact ?? designers[0];
        }
    } catch (err: any) {
        console.warn(`[Grailed] Designer search failed: ${err.message}`);
    }
    return null;
}

// ---------------------------------------------------------------------------
// Photo upload (presign → S3)
// ---------------------------------------------------------------------------

interface PresignData {
    url: string;
    fields: Record<string, string>;
}

export async function presignGrailedPhoto(
    cookies: string,
    csrfToken: string,
    deviceId: string
): Promise<PresignData> {
    const response = await fetch('https://www.grailed.com/api/photos/presign/listing', {
        method: 'GET',
        headers: { ...GRAILED_HEADERS(cookies, csrfToken, deviceId) },
    });

    if (!response.ok) {
        throw new Error(`Presign failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as any;
    const presign = data?.data ?? data;
    console.log('[Grailed] Presign response:', JSON.stringify(presign));
    return presign;
}

export async function uploadPhotoToGrailed(
    imageUrl: string,
    presign: PresignData
): Promise<{ cdnUrl: string }> {
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) throw new Error(`Failed to fetch image: ${imgResponse.status}`);
    const buffer = await imgResponse.arrayBuffer();
    const filename = imageUrl.split('/').pop()?.split('?')[0] ?? 'photo.jpg';

    // Use the Content-Type from the presign fields if provided (must match S3 policy exactly)
    const policyContentType = presign.fields?.['Content-Type'] ?? presign.fields?.['content-type'];
    const contentType = policyContentType ?? imgResponse.headers.get('content-type') ?? 'image/jpeg';

    const form = new FormData();
    for (const [k, v] of Object.entries(presign.fields ?? {})) {
        form.append(k, v);
    }
    // S3 policy requires Content-Type as an explicit form field (not just the blob type)
    form.append('Content-Type', contentType);
    // File must come last in S3 presigned POST
    form.append('file', new Blob([buffer], { type: contentType }), filename);

    console.log('[Grailed] S3 upload to:', presign.url, '| fields:', Object.keys(presign.fields ?? {}), '| contentType:', contentType);

    const s3Response = await fetch(presign.url, { method: 'POST', body: form });
    const s3Body = await s3Response.text();

    if (s3Response.status !== 200 && s3Response.status !== 204 && s3Response.status !== 201) {
        console.error('[Grailed] S3 error body:', s3Body);
        throw new Error(`S3 upload failed: ${s3Response.status}`);
    }

    // Build CDN URL from the S3 key
    const key = presign.fields?.key ?? '';
    const cdnUrl = `https://media-assets.grailed.com/${key}`;
    return { cdnUrl };
}

// ---------------------------------------------------------------------------
// Traits
// ---------------------------------------------------------------------------

// Valid Grailed color values (must match exactly)
function detectColor(text: string): string {
    const t = text.toLowerCase();
    if (/(black)/.test(t)) return 'Black';
    if (/(white)/.test(t)) return 'White';
    if (/(grey|gray)/.test(t)) return 'Gray';
    if (/(navy|blue)/.test(t)) return 'Blue';
    if (/(red)/.test(t)) return 'Red';
    if (/(green)/.test(t)) return 'Green';
    if (/(brown)/.test(t)) return 'Brown';
    if (/(beige|tan|khaki|cream)/.test(t)) return 'Beige';
    if (/(pink)/.test(t)) return 'Pink';
    if (/(purple)/.test(t)) return 'Purple';
    if (/(yellow)/.test(t)) return 'Yellow';
    if (/(orange)/.test(t)) return 'Orange';
    if (/(silver)/.test(t)) return 'Silver';
    if (/(gold)/.test(t)) return 'Gold';
    if (/(camo|camouflage|multi|plaid|stripe|pattern)/.test(t)) return 'Multi';
    return 'Black';
}

function defaultTraits(categoryPath: string, color: string): Array<{ name: string; value: string }> {
    return [
        { name: 'color', value: color },
        { name: 'country_of_origin', value: 'JP' },
    ];
}

// ---------------------------------------------------------------------------
// Size mapping
// ---------------------------------------------------------------------------

function mapSizeToGrailed(size: string | null | undefined, categoryPath: string): string {
    if (categoryPath.startsWith('accessories')) return 'one size';

    const s = (size || '').toLowerCase().trim();

    if (categoryPath.startsWith('bottoms')) {
        // Try to extract a waist number (26–44)
        const num = parseInt(s, 10);
        if (!isNaN(num) && num >= 26 && num <= 44) return String(num);
        // Fallback: letter sizes → common waist equivalents
        const map: Record<string, string> = { xs: '28', s: '30', m: '32', l: '34', xl: '36', xxl: '38' };
        return map[s] ?? '32';
    }

    if (categoryPath.startsWith('footwear')) {
        const num = parseFloat(s);
        if (!isNaN(num)) return String(num);
        return '10';
    }

    // Tops, outerwear, tailoring → letter sizes
    const valid = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl'];
    if (valid.includes(s)) return s;
    // Normalize common variants
    if (s === 'small') return 's';
    if (s === 'medium') return 'm';
    if (s === 'large') return 'l';
    if (s.startsWith('xx') && s.includes('l')) return 'xxl';
    if (s.startsWith('x') && s.includes('l')) return 'xl';
    if (s.startsWith('x') && s.includes('s')) return 'xs';
    return 'm';
}

// ---------------------------------------------------------------------------
// Create listing
// ---------------------------------------------------------------------------

export interface CreateGrailedListingResult {
    id: number;
    url: string;
}

export async function createGrailedListing(
    auth: GrailedAuth,
    input: GrailedListingInput,
    csrfToken: string,
    returnAddressId: number,
    photos: Array<{ cdnUrl: string }>,
    designer: GrailedDesigner | null
): Promise<CreateGrailedListingResult> {
    const categoryPath = input.categoryPath ?? mapCategoryPath({ title: input.title, description: input.description });
    const condition = mapConditionToGrailed(input.condition);

    const fallbackDesigner: GrailedDesigner = {
        id: null,
        name: input.brand || 'Vintage',
        slug: null,
        logo_url: null,
        departments: ['menswear'],
        collaborations: [],
    };
    const designersField: GrailedDesigner[] = designer ? [designer] : [fallbackDesigner];

    const photoPayload = photos.map(p => ({
        height: 0,
        id: null,
        rotate: 0,
        url: p.cdnUrl,
        width: 0,
    }));

    const color = detectColor(`${input.title} ${input.description}`);

    const body = {
        buynow: true,
        category_path: categoryPath,
        condition,
        description: input.description || input.title,
        designers: designersField,
        duplicate_listing: false,
        hidden_from_algolia: false,
        makeoffer: true,
        measurements: [],
        minimum_price: null,
        photos: photoPayload,
        price: String(Math.round(input.price)),
        return_address_id: returnAddressId,
        traits: defaultTraits(categoryPath, color),
        shipping: {
            us:    { amount: 20, enabled: true },
            ca:    { amount: 15, enabled: true },
            uk:    { amount: 45, enabled: true },
            eu:    { amount: 45, enabled: true },
            asia:  { amount: 55, enabled: true },
            au:    { amount: 55, enabled: true },
            other: { amount: 50, enabled: true },
        },
        shipping_label: { free_shipping: false },
        size: mapSizeToGrailed(input.size, categoryPath),
        styles: [],
        exact_size: null,
        title: input.title,
    };

    console.log('[Grailed] Creating listing:', JSON.stringify({ title: input.title, price: input.price, condition, categoryPath, color: [color], photos: photos.length }));

    const response = await fetch('https://www.grailed.com/api/listings', {
        method: 'POST',
        headers: {
            ...GRAILED_HEADERS(auth.cookies, csrfToken, auth.deviceId),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await response.json() as any;
    console.log('[Grailed] Response:', response.status, JSON.stringify(data).slice(0, 500));

    if (!response.ok) {
        const errObj = data?.error;
        const msg = typeof errObj === 'string' ? errObj
            : errObj?.message ?? data?.errors?.[0]?.message ?? `Grailed API error ${response.status}`;
        throw new Error(msg);
    }

    const listing = data?.data ?? data;
    if (!listing?.id) throw new Error('Listing created but no ID returned in response');

    return {
        id: listing.id,
        url: `https://www.grailed.com/listings/${listing.id}`,
    };
}
