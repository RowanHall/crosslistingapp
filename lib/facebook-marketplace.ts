/**
 * Facebook Marketplace - Create Listing
 * Reverse-engineered from intercepted browser request.
 *
 * Credentials below are scoped to the capturing user's own account.
 * Replace auth values (cookies, fb_dtsg, lsd, av) when rotating sessions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FBMPListingInput {
    title: string;
    description: string;
    price: string;
    currency: string;
    /** Photo IDs obtained from a prior FB upload call */
    photoIds: string[];
    categoryId: string;
    /** "used_like_new" | "used_good" | "used_fair" | "new" */
    condition: string;
    latitude: number;
    longitude: number;
    /** "IN_PERSON" | "SHIPPING" */
    deliveryTypes?: string[];
}

export interface FBMPAuth {
    /** Value of the `Cookie` header */
    cookies: string;
    /** fb_dtsg CSRF token extracted from page source or prior API call */
    fbDtsg: string;
    /** lsd token (same as x-fb-lsd header) */
    lsd: string;
    /** Facebook user ID (numeric string) */
    userId: string;
}

// ---------------------------------------------------------------------------
// Condition mapping helper
// ---------------------------------------------------------------------------

export function mapConditionToFB(condition: string | null | undefined): string {
    if (!condition) return 'used_good';
    const c = condition.toLowerCase();
    if (c.includes('new') && !c.includes('like')) return 'new';
    if (c.includes('like new') || c.includes('like_new') || c === 'is_new') return 'used_like_new';
    if (c.includes('fair') || c.includes('poor') || c.includes('worn')) return 'used_fair';
    return 'used_good'; // default fallback
}

// ---------------------------------------------------------------------------
// Photo upload
// ---------------------------------------------------------------------------

/**
 * Uploads a single image to Facebook and returns the resulting photo ID.
 *
 * Facebook requires photos to be uploaded separately before a listing can be
 * created. The returned ID is passed into `photoIds` in `FBMPListingInput`.
 *
 * Reverse-engineered from:
 *   POST https://upload.facebook.com/ajax/react_composer/attachments/photo/upload
 *
 * Key differences from the GraphQL endpoint:
 *   - Host is upload.facebook.com  →  sec-fetch-site must be "same-site"
 *   - Body is multipart/form-data, not URL-encoded
 *   - Auth tokens travel both in the query string AND in the form body
 */
export async function uploadFBPhoto(
    imageUrl: string,
    auth: FBMPAuth
): Promise<string> {
    // Fetch the source image (Supabase storage URL or any HTTPS URL)
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from ${imageUrl}: ${imageResponse.status}`);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') ?? 'image/jpeg';
    // Derive a clean filename from the URL, stripping query strings
    const filename = imageUrl.split('/').pop()?.split('?')[0] ?? 'photo.jpg';

    // Multipart form — field order mirrors the intercepted request
    const form = new FormData();
    form.append('fb_dtsg', auth.fbDtsg);
    form.append('qn', 'comet_marketplace_composer');
    form.append('target_id', '1759579680997030'); // FB Marketplace context ID (matches listing creation)
    form.append('source', '8');
    form.append('profile_id', auth.userId);
    form.append('waterfallxapp', 'comet');
    form.append('upload_id', '1024');
    form.append('farr', new Blob([imageBuffer], { type: contentType }), filename);

    // Auth tokens + minimal required tracking params in the query string
    const params = new URLSearchParams({
        av: auth.userId,
        __aaid: '0',
        __user: auth.userId,
        __a: '1',
        __req: '1s',
        __hs: '20511.HCSV2:comet_pkg.2.1...0',
        dpr: '2',
        __ccg: 'EXCELLENT',
        __rev: '1034213649',
        fb_dtsg: auth.fbDtsg,
        lsd: auth.lsd,
        __comet_req: '15',
        __spin_r: '1034213649',
        __spin_b: 'trunk',
        __crn: 'comet.fbweb.CometMarketplaceComposerRoute',
    });

    const response = await fetch(
        `https://upload.facebook.com/ajax/react_composer/attachments/photo/upload?${params}`,
        {
            method: 'POST',
            headers: {
                accept: '*/*',
                'accept-language': 'en-US,en;q=0.9',
                'cache-control': 'no-cache',
                cookie: auth.cookies,
                origin: 'https://www.facebook.com',
                pragma: 'no-cache',
                referer: 'https://www.facebook.com/marketplace/create/item?ref=marketplace_vendoo',
                // upload.facebook.com is a subdomain → same-site, NOT same-origin
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            },
            body: form,
        }
    );

    const text = await response.text();
    const jsonText = text.startsWith('for (;;);') ? text.slice(9) : text;

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
        throw new Error(
            `Photo upload: non-JSON response (status ${response.status}): ${text.slice(0, 500)}`
        );
    }

    if (parsed.error) {
        throw new Error(
            `Facebook photo upload error ${parsed.error}: ${parsed.errorSummary}`
        );
    }
    if (response.status >= 400) {
        throw new Error(`Photo upload failed with status ${response.status}`);
    }

    // Facebook returns the ID under payload.photoID or payload.fbid
    const payload = parsed.payload as Record<string, unknown> | undefined;
    const photoId =
        (payload?.photoID as string | undefined) ??
        (payload?.fbid as string | undefined) ??
        (parsed.photoID as string | undefined) ??
        (parsed.photo_id as string | undefined);

    if (!photoId) {
        throw new Error(
            `Photo upload succeeded but no photo ID found in response: ${JSON.stringify(parsed).slice(0, 500)}`
        );
    }

    return photoId;
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

export async function createFBMarketplaceListing(
    auth: FBMPAuth,
    listing: FBMPListingInput
): Promise<unknown> {
    // --- Sanitise dynamic values to match the working test baseline ---
    // Facebook expects price as a whole-number string ("25"), not "25.00"
    const sanitisedPrice = String(Math.round(Number(listing.price) || 0));
    // Facebook truncates titles at ~100 chars; trim to avoid rejection
    const sanitisedTitle = (listing.title || 'Untitled').slice(0, 100);
    // Guard empty description
    const sanitisedDescription = listing.description || '';

    const variables = {
        input: {
            client_mutation_id: "15",
            actor_id: auth.userId,
            attribution_id_v2:
                "CometMarketplaceComposerRoot.react,comet.marketplace.composer,unexpected,1772050453053,610399,1606854132932955,,;",
            audience: {
                marketplace: {
                    marketplace_id: "1759579680997030",
                },
            },
            data: {
                common: {
                    attribute_data_json: JSON.stringify({ condition: listing.condition }),
                    category_id: listing.categoryId,
                    commerce_shipping_carrier: null,
                    commerce_shipping_carriers: [],
                    comparable_price: "null",
                    cost_per_additional_item: null,
                    delivery_types: listing.deliveryTypes ?? ["IN_PERSON"],
                    description: { text: sanitisedDescription },
                    draft_type: null,
                    hidden_from_friends_visibility: "VISIBLE_TO_EVERYONE",
                    is_personalization_required: null,
                    is_photo_order_set_by_seller: false,
                    is_preview: false,
                    item_price: {
                        currency: listing.currency,
                        price: sanitisedPrice,
                    },
                    latitude: listing.latitude,
                    listing_email_id: null,
                    longitude: listing.longitude,
                    min_acceptable_checkout_offer_price: "null",
                    personalization_info: null,
                    product_hashtag_names: [],
                    quantity: null,
                    shipping_calculation_logic_version: null,
                    shipping_cost_option: "BUYER_PAID_SHIPPING",
                    shipping_cost_range_lower_cost: null,
                    shipping_cost_range_upper_cost: null,
                    shipping_label_price: "0",
                    shipping_label_rate_code: null,
                    shipping_label_rate_type: null,
                    shipping_offered: false,
                    shipping_options_data: [],
                    shipping_package_weight: null,
                    shipping_price: "null",
                    shipping_service_type: null,
                    sku: "",
                    source_type: "composer_listing_type_selector",
                    suggested_hashtag_names: [],
                    surface: "composer",
                    title: sanitisedTitle,
                    variants: [],
                    video_ids: [],
                    xpost_target_ids: [],
                    comments_disabled: true,
                    photo_ids: listing.photoIds,
                },
            },
        },
    };

    // --- Diagnostic: dump the exact payload so we can diff against the working test ---
    console.log('[FB Crosslist] OUTGOING PAYLOAD:', JSON.stringify({
        title: sanitisedTitle,
        description: sanitisedDescription.slice(0, 80),
        price: sanitisedPrice,
        currency: listing.currency,
        categoryId: listing.categoryId,
        condition: listing.condition,
        photoIds: listing.photoIds,
        lat: listing.latitude,
        lng: listing.longitude,
        deliveryTypes: listing.deliveryTypes,
    }, null, 2));
    console.log('[FB Crosslist] FULL VARIABLES:', JSON.stringify(variables, null, 2));

    const body = new URLSearchParams({
        av: auth.userId,
        __aaid: "0",
        __user: auth.userId,
        __a: "1",
        __req: "dl",
        __hs: "20509.HCSV2:comet_pkg.2.1...0",
        dpr: "2",
        __ccg: "EXCELLENT",
        __rev: "1034047270",
        __s: "5fekz9:fqtl6o:4lwhct",
        __hsi: "7610892456248368806",
        // Compressed state params — FB validates these server-side
        __dyn: "7xeUjGU9k9wxxt0koC8G6Ejh941twWwIxu13wFG3OubyQdwSAx-bwNw9G2Saxa1NwJwpUe8hw8u2a1sw9u0LVEtwMw6ywMwto88422y11wBz822wtU4a3a4oaEnxO0Bo4O2-2l2UtwxwhU5W1ywiE4u9x-3m1mzXw8W58jwGzEjxq1jxS6Fobrwh8lwUwOzEjUlDw-wSU8o4qum7-2K0-obUG2-azqwt8eo88cA0Lo4p1e4UK2K2WEjxK2B08-Utyo566k1FwgUjz89oeE-5oabDzUiBG2OUqwjVqwLwlE7m11wo83KwHwOyUqxG0HEC",
        __csr: "g9c6s6y5gF1Pb2a9fkY9gD6hcvvdklbOW48izhp0J5snsOOh6HJ8IQttl9ERrkAmykmWhOlBB8YyPqHnkxqQBkD95_dZSDXuG9jQlkBFGAykGAVvoHFfnaGlFXGQYyOdl8FbEyHlfcgOOid9P9eynFBGAOHQhpeiVbqZda8QjgK9_8KteQrHJlXFtTKF4mFGyARBn9AioDGl5LyuqLiEC_-AGiHhkhChUKAV8NmQy6AnyaV8GHCVHx196VJcx4Hy6GWza8JF4GGQFVqlmmVbDDiD_WKFqyaCmiqFqQ69oChi3oOEzGmqu8Wl7BDxbCKEW-uLAGKuBAAGHuaWHhppWy9URaUK5FuaypHBjDxaV8CBiRhuKcxfBGvKiiC8CF7BVFVV99UOq-UyAch8nBFKjV8TBLgWFpO2GggGibBx6fy9kfJ16EyEKjzFUzAUN1abKEGfxmeAho-uUO4UiwxBwDx2vDBzVkrxxei6UbaAUK8zpqg8EWiqZwIDDwiUOmq14xd16byXAAx68xl4yES7oK4UiAgzBUqw_zFU7i6E8GwhU25wQzocUbU-7VQ8xi2-awwwXg4K1tAwgo5qUO59ag9oSh0pEoxa3iUjxC4EgLnK8yUhz8O69Ed9ogKmEkAya-uU4mfBwm8Hm5E5Ou3i5k78O4UuxO9AxeeUoUfWxqbwh-58hxfwOxidy8884W9UbWGHF5GjG7bw6rw925U6e0DpKq5mU2nyk2Po0vpU23xcFkGjgx7wDgaAFdiHoxw0yGxRwj8ig2kw44wXwnTQ3SUUzyVV9O0qU23g1Npknpk5U4SFA0dqohydfnw6hgyfhUgFw3VE4LVEO6o044zg0Cm5E0cFo04YUHwfG6o0KQjg0Da05aUdm4US1Cw9etwet0RwYwazxm1Ehcy_UcCm148E-UeUKE4e2C1xwgocAGDyAdyk2ecx-dDox0aBwai0VoV0t8aE0wm4VjlS2q0Uo2px_xt0i8vyV83QwdK087g6xS4pLy8iw0yMz61Zqg5yiUG265E3Igdy0zxu17way0q9o3xU19E5PK0rW2m7-4EcC6Qdwp8C0NE0HSda225WhpK0TonyEy7EHwlEsw2VA2Yg4oxTg2wwrksN3pMwE6p0RDhkm7p9Ulhk2q363isC0TP1616w1te06YxAjw1vK0vp0fG4Fqxt1Hte3i1VwjoBlwso32JwjE2ezK64A0km24Ma85e0abxqexeag3pl0zw0wgwrU5ExUF3pyJ3kAi5Utw4ZEwG0kG18wDzkuew1uWU1_Q0H8kwqG4O1Qw_qy8cO34i",
        __hsdp: "g492W1cgQb8yii1uCwh82kG8wrExhWFA4N23l8ixdhAvG94hq1h3JUGa4l3rk4VMz18xh0Z7hk84baYgwD8zt3akiH4C4iNjtqlONkAGb92RGjQGJd-lEzFGgFrgQAgpiQfIoxi2a4kXAjA8Arhy9lHkmH1x1UCAOgBikZOFF5Lhh0FNq67i6bsWszGBJS89dKAAiKp5gyEJ28OboRciijh2xaAtolsV4BBh9ENcGH63GaqskMKuia9DBKP5yO5GkGml6x12P2UW529rzAQx1UCmyy8DBozjcczapyBVpaGR8Q-qQgMGuReO1wWQx0zxiczabmhoVO29AiheeiBzLyi2UT6GGGlVJx9lIjJ6CKqvIg4kinsTiRzA6F1hGyEGXjDaDGFqGp6fhx2iFk8wCgycQdgDDKt7QpHAhiDZ9gvhPhp99QilkDp6zkgOVy3i6gx5BGpanDc6mFpj2HDxuCVqUWh0xBJ6xiiqEOyacwxxLzorxThay8yGVBT4Nxkq9G8ym9ghKUBBgSSbrgd8vpA488CfHl1l3VEl9xit1K9CF1aHwm8Fa4VeawsEtyUvBxPGEumFULJ1qVEYMjO5OGruueg8U88WEOaGVqwAoFWgK4aOoFaax218xO4k3W9wWl-czoaE9RzU8EaEfofEjwTwl8eFEoxiUW2eEoZwAzEb9nyfBUcUnRtzojxicqEweErwHBz86im3a362W1EU6fBK1vxu1Fx22K6UO5lxeawmA6FryrwlUdomK1NwZK8Cyo764Q4UeoW3u7o2owCwdi0wES1lUlw9Km1MK4o7eawae1rAwQwPxWdDU52E7a261sxO0ME8U2YG2e5Hwvoy0g61Fw9G582ywzwZw93wUzo6q0-o7rw4pwk86K5ojxui0y8nz8469yUdQu7U51okG6E8UgxjwLwUyE2rwCw9K0EUaU6W1xxOmfz9EuCyHxW0F8twIxa6opAQfz8-q2G263-7oWbxK0yo2Ry84C1cwuodU9E21w5Hwi8gwkHwg8C1nxa6EcoiwhUe82axq18w868wLwKwh84G1VwqE8Vk2aui22u68cUtzGAxifK4Q15xC4U9EhwXKbwqE7mu5EmDg620ga15Dyo2MgmwjpU2hwrU",
        __hblp: "1Cutw-h9hihUy2S1MoC1ew961ZCjQ19yU4t0UwZxK0DUcXgy0Molxi0yUaU6i5oO3Saw9t0zwmofU98fpqwwx6ayEsx2q68rxOmm5pUC2e9wj84i6A222q1zzoaUoxi2iew_wzUbFu7UdU4Ocx3ze4U4uiex6S3G7ER7wYwaWcG0yUpx-2mq6oiwADx2EK1BG8x6qfx2Erx2ry98eGgmxS13guoGfUG15xa0xE8UyuEaUbE4yu1mxK2C4oC3uq58mxeQ9yby8aElwDwMwhUmx24EcorwUAwOx-2e0z98iBwRLwEyEkCx-ewICm19wLxe1wwFwAwqU8E8oK1kwyzrwRwi8SeDwv8d8O2i2a3C10wJyE26wJxC58qwOwCwmpEx2bz899EC2G58jx62ydyUszEtx278hwm82GxG2e4oym7o5mvKqi4U4i6E5S36FUozUowDzGwCwHwwyEO0SQ5o8onxe7U5q32E66mu5FVodo9FomU2mwNw9616g9pE-VUS2GdwTCyES8wxG1KxqcghzocVEy2m1jwzwxglwJx61krCAAyoV3o4-1MUe8S1Cxa0y88U98kwtK13wpU8E4G1gxy2O4UhyUC4UnAwJxSi3u5UO36fyoK9xy56q9G4EbU8axiF8lxiezbxjxe6Ujg8UG1qwyxS2q0CA0EU8Ex0zwio9UepElBzUOq2m5UlwmU8osKmdzUnyEC16Axa0C8nyUhz8S6UlDg7K78O10BwPy84C1cUnx-3-2CdG49oO0wo2fwqo2WwJjG2SUeQUDxC3K4E4qh150hUbUy58c89Egz8mxW2C1Mzqy8GUny8nxq69pEuwPxq3q12wqE-4Vk6FVV889U4xa48ryE9pEOEK3u6p8Xx2eAx67EszUb84DUtwAy469u5Emwn9pE6K1cwiorwBK4ovg9VUmVqwwwQG7EtAy9Ue43iexe228wko",
        __sjsp: "g492W1cgQb8yii1uCwh82kG8wrExihiFA4N23lbexdhAvG9PjSwkgzNdUl4l3rk4VMz18xh0Z7hk84baYgMBQzt3akiH4C4iNjihTaBlO4ib864VJaFb_DEzFGgEB3ih1Bbg-NysOQtyDjKiih5CQoymnlzJ1K9ffG2EPiAR7kAAijXDCBgOaZ58x2y448KHGWF5vy4RuWjDy4l2UJ28OboWbAAQgEiKt1tPACyUjj88yEh85Q6pV8-dyu4y29iBBgngIMqxgymUVd2pUC8u8ypQ9Cccz98yuuimQA9UK59XhVEokyQx0zxi72RAm4y12iiieixjUAwr6GFoaaxK4p-VEcA442yq68O8z8yGDDDC4aWz89A5qzkbxeahK9CUW1lCAzp9kmh4yQ11zXwjXDxuAaAzF88FrhEkACx8ywKxLwhZ4yUW2N6xm5k4pUBBzHoJJ0QxZwXo-KA5k1eg9otG1HxG1ZxSbwgFUumFULwCwaq7EGqmE96au0KU561Ewbe0O81CUdonRtzo0zW0sZo0Q2093wlu0rS04QE",
        __comet_req: "15",
        fb_dtsg: auth.fbDtsg,
        jazoest: "25579",
        lsd: auth.lsd,
        __spin_r: "1034047270",
        __spin_b: "trunk",
        __spin_t: "1772048989",
        __crn: "comet.fbweb.CometMarketplaceComposerRoute",
        qpl_active_flow_ids: "138820675,521482763",
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: "useCometMarketplaceListingCreateMutation",
        server_timestamps: "true",
        variables: JSON.stringify(variables),
        doc_id: "9551550371629242",
        fb_api_analytics_tags: '["qpl_active_flow_ids=138820675,521482763"]',
    });

    const response = await fetch("https://www.facebook.com/api/graphql/", {
        method: "POST",
        headers: {
            accept: "*/*",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            "content-type": "application/x-www-form-urlencoded",
            cookie: auth.cookies,
            origin: "https://www.facebook.com",
            pragma: "no-cache",
            referer:
                "https://www.facebook.com/marketplace/create/item?ref=marketplace_vendoo",
            // sec-fetch headers — Facebook validates these for CORS requests
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
            "x-asbd-id": "359341",
            "x-fb-friendly-name": "useCometMarketplaceListingCreateMutation",
            "x-fb-lsd": auth.lsd,
        },
        body: body.toString(),
    });

    const text = await response.text();

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log("Response headers:", Object.fromEntries(response.headers));

    // Facebook prefixes all API responses with `for (;;);` to prevent JSON hijacking
    const jsonText = text.startsWith("for (;;);") ? text.slice(9) : text;

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
        console.log("Raw response (non-JSON):\n", text.slice(0, 2000));
        throw new Error(`Non-JSON response with status ${response.status}`);
    }

    console.log("FB RAW RESPONSE:", JSON.stringify(parsed, null, 2));

    // Facebook top-level error: { error: <code>, errorSummary: "...", errorDescription: "..." }
    if (parsed.error) {
        console.error(
            `Facebook API error ${parsed.error}: ${parsed.errorSummary}\n${parsed.errorDescription}`
        );
        throw new Error(`Facebook API error ${parsed.error}: ${parsed.errorSummary}`);
    }

    // GraphQL errors array — Facebook returns 200 OK but hides failures here
    // e.g. { errors: [{ message: "...", severity: "CRITICAL", path: [...] }] }
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
        const messages = (parsed.errors as Array<{ message?: string }>)
            .map((e, i) => e.message ?? `error[${i}]`)
            .join("; ");
        console.error("Facebook GraphQL errors:", JSON.stringify(parsed.errors, null, 2));
        throw new Error(`Facebook GraphQL error: ${messages}`);
    }

    if (response.status >= 400) {
        console.error("Error response body:", JSON.stringify(parsed, null, 2));
        throw new Error(`Request failed: ${response.status}`);
    }

    return parsed;
}
