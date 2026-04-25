// extension/scripts/facebook-scraper.js
// Runs on every facebook.com page at document_idle.
// Extracts fb_dtsg, lsd, __rev, __hs from inline JS and c_user from document.cookie.
// Also executes paginated Marketplace fetches on behalf of the background script,
// running inside the real FB tab so cookies and sec-fetch headers are browser-authentic.

console.log("Facebook Scraper: Content script loaded");

// ---------------------------------------------------------------------------
// TOKEN EXTRACTION
// ---------------------------------------------------------------------------

function extractFacebookTokens() {
    let fb_dtsg = null;
    let lsd = null;
    let c_user = null;
    let fb_rev = null;
    let fb_hs = null;
    let fb_dyn = null;
    let fb_csr = null;

    const scripts = document.querySelectorAll('script:not([src])');
    for (const script of scripts) {
        const text = script.textContent;
        if (!text) continue;

        if (!fb_dtsg) {
            const m = text.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/);
            if (m) fb_dtsg = m[1];
        }
        if (!fb_dtsg) {
            const m = text.match(/"token":"(AQ[^"]{10,})"/);
            if (m) fb_dtsg = m[1];
        }
        if (!lsd) {
            const m = text.match(/"LSD",\[\],\{"token":"([^"]+)"\}/);
            if (m) lsd = m[1];
        }
        if (!fb_rev) {
            const m = text.match(/"server_revision"\s*:\s*(\d{9,})/);
            if (m) fb_rev = m[1];
        }
        if (!fb_hs) {
            const m = text.match(/"haste_session"\s*:\s*"([^"]+)"/);
            if (m) fb_hs = m[1];
        }
        if (fb_dtsg && lsd && fb_rev && fb_hs) break;
    }

    // __dyn and __csr are embedded in the full page HTML (not always in a single script block)
    const fullHtml = document.documentElement.innerHTML;
    if (!fb_dyn) {
        const m = fullHtml.match(/"__dyn":"([^"]+)"/);
        if (m) fb_dyn = m[1];
    }
    if (!fb_csr) {
        const m = fullHtml.match(/"__csr":"([^"]+)"/);
        if (m) fb_csr = m[1];
    }

    const cUserMatch = document.cookie.match(/c_user=(\d+)/);
    if (cUserMatch) c_user = cUserMatch[1];

    return { fb_dtsg, lsd, c_user, fb_rev, fb_hs, fb_dyn, fb_csr };
}

// ---------------------------------------------------------------------------
// MARKETPLACE FETCH (runs in tab context — cookies are automatic, headers legit)
// ---------------------------------------------------------------------------

function computeJazoest(fbDtsg) {
    let sum = 0;
    for (const char of fbDtsg) sum += char.charCodeAt(0);
    return `2${sum}`;
}

function parseFBNDJSON(text) {
    const results = [];
    for (const rawChunk of text.trim().split('\n')) {
        let chunk = rawChunk.trim();
        if (!chunk) continue;
        if (chunk.startsWith('for (;;);')) chunk = chunk.slice('for (;;);'.length);
        try { results.push(JSON.parse(chunk)); }
        catch (e) { console.warn('FB Scraper: skipping unparseable chunk:', chunk.slice(0, 120)); }
    }
    return results;
}

function normalizeFBListing(node) {
    const coverUri = node.primary_listing_photo?.image?.uri || null;
    return {
        id: node.id,
        title: node.marketplace_listing_title || node.base_marketplace_listing_title || 'Untitled',
        price: node.listing_price?.formatted_amount || node.formatted_price?.text || null,
        // images is an array — starts with cover photo, deepFetch will replace with full set
        images: coverUri ? [coverUri] : [],
        url: node.share_uri || `https://www.facebook.com/marketplace/item/${node.id}/`,
        createdAt: node.creation_time ? new Date(node.creation_time * 1000).toISOString() : null,
        isSold: node.is_sold || false,
        isLive: node.is_live || false,
        views: node.listing_insights?.insights?.[0]?.count || 0,
        description: '',   // filled by deepFetchListings
        condition: null,   // filled by deepFetchListings
        platform: 'facebook',
    };
}

// ---------------------------------------------------------------------------
// PDP DEEP FETCH — extracts full data from individual item pages
// ---------------------------------------------------------------------------

/**
 * Recursively searches an object/array for the first value with the given key.
 * Depth-limited to prevent runaway recursion on FB's deeply nested blobs.
 */
function findDeep(obj, key, depth = 0) {
    if (depth > 14 || obj === null || typeof obj !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
    for (const v of Object.values(obj)) {
        const hit = findDeep(v, key, depth + 1);
        if (hit !== undefined) return hit;
    }
    return undefined;
}

/**
 * Recursively collects ALL values for a given key (handles arrays of photo sets).
 */
function findAllDeep(obj, key, depth = 0) {
    if (depth > 14 || obj === null || typeof obj !== 'object') return [];
    const results = [];
    if (Object.prototype.hasOwnProperty.call(obj, key)) results.push(obj[key]);
    for (const v of Object.values(obj)) {
        results.push(...findAllDeep(v, key, depth + 1));
    }
    return results;
}

/**
 * Parses the raw HTML of a Facebook Marketplace PDP and extracts enrichment data.
 *
 * Strategy 1 (preferred): scans <script type="application/json"> blocks for
 *   Relay query payloads identified by queryName.
 * Strategy 2 (fallback): raw regex on the full HTML string — works even if the
 *   JSON block structure changes, since the field names stay stable.
 *
 * Logs extensively so failures are diagnosable in the extension console.
 *
 * @param {string} htmlString  Raw HTML from fetch()
 * @returns {{ description: string, images: string[], condition: string|null }}
 */
function extractDataFromFBHtml(htmlString) {
    const result = { description: '', images: [], condition: null };

    // ── STRATEGY 1: JSON script block parsing ────────────────────────────────
    const scriptRe = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
    let m;
    let blocksFound = 0;
    const queryNamesFound = [];

    while ((m = scriptRe.exec(htmlString)) !== null) {
        blocksFound++;
        let parsed;
        try { parsed = JSON.parse(m[1]); } catch (_) { continue; }

        const queryName = findDeep(parsed, 'queryName');
        if (!queryName) continue;
        queryNamesFound.push(queryName);

        // Images
        if (queryName === 'MarketplacePDPC2CMediaViewerWithImagesQuery') {
            const photoArrays = findAllDeep(parsed, 'listing_photos');
            for (const arr of photoArrays) {
                if (!Array.isArray(arr)) continue;
                for (const photo of arr) {
                    const uri = photo?.image?.uri || photo?.photo?.image?.uri || photo?.uri || null;
                    if (uri && !result.images.includes(uri)) result.images.push(uri);
                }
            }
        }

        // Description + condition
        if (queryName === 'MarketplacePDPContainerQuery') {
            if (!result.description) {
                const desc = findDeep(parsed, 'detailed_description') || findDeep(parsed, 'listing_description');
                if (desc?.text)                       result.description = desc.text;
                else if (typeof desc === 'string')    result.description = desc;
            }
            if (!result.condition) {
                const cond = findDeep(parsed, 'condition_display_name')
                    || findDeep(parsed, 'listing_condition')
                    || findDeep(parsed, 'condition');
                if (typeof cond === 'string') result.condition = cond;
            }
        }
    }

    console.log(
        `FB Scraper [extractData]: ${blocksFound} JSON blocks, ` +
        `queryNames: [${queryNamesFound.join(', ')}], ` +
        `images: ${result.images.length}, desc: ${!!result.description}, condition: ${result.condition}`
    );

    // ── STRATEGY 2: Raw HTML regex fallbacks ─────────────────────────────────
    // FB sometimes escapes forward slashes as \/ inside JSON strings.
    // Work on an unescaped copy so the URL regex fires correctly.
    const html = htmlString.replace(/\\\//g, '/');

    // Images fallback — extract all unique fbcdn.net image URLs
    if (result.images.length === 0) {
        const imgRe = /https:\/\/[a-z0-9.-]+\.fbcdn\.net\/v\/[^\s"'<>\\]+/g;
        const rawUrls = html.match(imgRe) || [];
        // Deduplicate and exclude tiny thumbnails (profile/sticker CDN paths)
        const seen = new Set();
        for (const url of rawUrls) {
            // Keep only actual photo assets (t45, t39, t31 are marketplace photo paths)
            if (/\/v\/t(45|39|31)\./.test(url) && !seen.has(url)) {
                seen.add(url);
                result.images.push(url);
            }
        }
        if (result.images.length > 0) {
            console.log(`FB Scraper [extractData]: fallback found ${result.images.length} images via URL regex`);
        }
    }

    // Description fallback — try multiple field names, both {text:} wrapper and plain string
    if (!result.description) {
        const descPatterns = [
            /"detailed_description"\s*:\s*\{"text"\s*:\s*"((?:[^"\\]|\\.)*)"/,
            /"listing_description"\s*:\s*\{"text"\s*:\s*"((?:[^"\\]|\\.)*)"/,
            /"redacted_description"\s*:\s*\{"text"\s*:\s*"((?:[^"\\]|\\.)*)"/,
            /"detailed_description"\s*:\s*"((?:[^"\\]|\\.)*)"/,
            /"listing_description"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        ];
        for (const re of descPatterns) {
            const hit = html.match(re);
            if (hit?.[1]) {
                result.description = hit[1]
                    .replace(/\\n/g, '\n')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\')
                    .trim();
                console.log(`FB Scraper [extractData]: description found via fallback regex`);
                break;
            }
        }
    }

    // Condition fallback
    if (!result.condition) {
        const condHit = html.match(/"condition_display_name"\s*:\s*"([^"]+)"/);
        if (condHit?.[1]) {
            result.condition = condHit[1];
            console.log(`FB Scraper [extractData]: condition found via fallback regex: ${result.condition}`);
        }
    }

    // Final summary
    console.log(
        `FB Scraper [extractData]: FINAL — images: ${result.images.length}, ` +
        `desc length: ${result.description.length}, condition: ${result.condition}`
    );

    return result;
}

/**
 * Throttled queue that deep-fetches each listing's PDP page and merges the
 * enrichment data (all images, description, condition) back into the listing.
 *
 * Runs sequentially with a randomised jitter between requests to avoid
 * triggering Facebook's rate-limiting. Each failure is isolated so the
 * rest of the queue continues uninterrupted.
 *
 * @param {object[]} listings  Normalised listings from the pagination query
 * @returns {object[]}         Same array with images/description/condition filled in
 */
async function deepFetchListings(listings) {
    const JITTER_MIN = 2000;
    const JITTER_MAX = 4500;

    for (let i = 0; i < listings.length; i++) {
        const listing = listings[i];
        console.log(`FB Scraper: deep fetch [${i + 1}/${listings.length}] "${listing.title}"`);

        try {
            const resp = await fetch(listing.url, {
                credentials: 'include',
                headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
            });

            if (!resp.ok) {
                console.warn(`FB Scraper: HTTP ${resp.status} for listing ${listing.id} — skipping`);
            } else {
                const html = await resp.text();

                // DEBUG — remove after confirming page structure
                if (i === 0) {
                    console.log('FB Scraper [DEBUG] HTML length:', html.length);
                    // Count script block types
                    const jsonBlocks = (html.match(/<script type="application\/json"/g) || []).length;
                    const inlineBlocks = (html.match(/<script>/g) || []).length;
                    console.log(`FB Scraper [DEBUG] script blocks — type=application/json: ${jsonBlocks}, inline: ${inlineBlocks}`);
                    // Dump first occurrence of any key field names
                    ['detailed_description', 'listing_description', 'listing_photos', 'queryName', 'condition_display_name'].forEach(field => {
                        const idx = html.indexOf(`"${field}"`);
                        if (idx !== -1) {
                            console.log(`FB Scraper [DEBUG] "${field}" found at index ${idx}:`, html.slice(idx, idx + 200));
                        } else {
                            console.log(`FB Scraper [DEBUG] "${field}" NOT FOUND in HTML`);
                        }
                    });
                }

                const enrichment = extractDataFromFBHtml(html);

                if (enrichment.images.length > 0) listing.images    = enrichment.images;
                if (enrichment.description)       listing.description = enrichment.description;
                if (enrichment.condition)         listing.condition   = enrichment.condition;

                console.log(
                    `FB Scraper: ✓ "${listing.title}" — ` +
                    `${enrichment.images.length} images, ` +
                    `desc: ${enrichment.description ? 'yes' : 'no'}, ` +
                    `condition: ${enrichment.condition || 'none'}`
                );
            }
        } catch (e) {
            // Isolate the failure — log and continue to the next listing
            console.error(`FB Scraper: deep fetch error for listing ${listing.id}: ${e.message}`);
        }

        // Throttle — skip delay after the last item
        if (i < listings.length - 1) {
            const delay = JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN);
            console.log(`FB Scraper: waiting ${Math.round(delay)}ms…`);
            await new Promise(r => setTimeout(r, delay));
        }
    }

    return listings;
}

async function fetchFBPage(tokens, cursor) {
    const { fb_dtsg, lsd, c_user, fb_rev, fb_hs } = tokens;

    const variables = {
        count: 10,
        cursor: cursor || null,
        order: 'CREATION_TIMESTAMP_DESC',
        scale: 2,
        state: null,
        status: null,
        title_search: null,
        '__relay_internal__pv__ShouldUpdateMarketplaceBoostListingBoostedStatusrelayprovider': false,
    };

    const rev = fb_rev || '1034954086';
    const params = new URLSearchParams({
        doc_id: '25446537771690810',
        variables: JSON.stringify(variables),
        fb_api_req_friendly_name: 'MarketplaceYouSellingFastActiveSectionPaginationQuery',
        fb_api_caller_class: 'RelayModern',
        server_timestamps: 'true',
        __user: c_user || '',
        __a: '1',
        fb_dtsg,
        lsd,
        jazoest: computeJazoest(fb_dtsg),
        av: c_user || '',
        __rev: rev,
        __spin_r: rev,
        __spin_b: 'trunk',
        __spin_t: String(Math.floor(Date.now() / 1000)),
        dpr: '2',
        __comet_req: '15',
    });
    if (fb_hs) params.set('__hs', fb_hs);

    // Running inside a real FB tab: credentials:'include' attaches all cookies
    // automatically (including HttpOnly xs/fr), and sec-fetch headers are set
    // by the browser with same-origin values — no bot-detection risk.
    const response = await fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-FB-LSD': lsd,
            'X-FB-Friendly-Name': 'MarketplaceYouSellingFastActiveSectionPaginationQuery',
            'X-ASBD-ID': '359341',
        },
        body: params.toString(),
    });

    if (!response.ok) {
        throw new Error(`FB HTTP ${response.status}`);
    }

    const text = await response.text();
    const chunks = parseFBNDJSON(text);
    if (!chunks.length) throw new Error('FB returned empty response');

    const main = chunks[0];
    console.log('FB Scraper: raw first chunk:', JSON.stringify(main).slice(0, 400));

    if (main?.error !== undefined && main?.error !== null) {
        const err = main.error;
        const code = typeof err === 'object' ? (err.code ?? '') : err;
        const msg = typeof err === 'object'
            ? (err.message ?? JSON.stringify(err))
            : (main.errorDescription ?? main.errorSummary ?? String(err));
        throw new Error(`FB API error ${code}: ${msg}`);
    }
    if (main?.errors?.length) throw new Error(`FB GraphQL: ${main.errors[0]?.message}`);

    const edges = main?.data?.viewer?.marketplace_listing_sets?.edges || [];

    let pageInfo = { has_next_page: false, end_cursor: null };
    for (const chunk of chunks.slice(1)) {
        if (chunk?.data?.page_info) { pageInfo = chunk.data.page_info; break; }
        if (chunk?.data && typeof chunk.data === 'object') {
            const nested = Object.values(chunk.data).find(v => v?.page_info);
            if (nested) { pageInfo = nested.page_info; break; }
        }
    }

    return { edges, pageInfo };
}

// ---------------------------------------------------------------------------
// SINGLE LISTING DEEP FETCH — uses the internal PDP GraphQL query
// ---------------------------------------------------------------------------

/**
 * Fetches full details for a single Facebook Marketplace listing via the
 * MarketplacePDPContainerQuery GraphQL endpoint.
 *
 * Must run inside a real FB tab so credentials:'include' attaches session
 * cookies and sec-fetch headers are browser-authentic.
 *
 * @param {string} listingId  The numeric FB listing ID
 * @param {object} tokens     { fb_dtsg, lsd, c_user, fb_rev, fb_hs, fb_dyn, fb_csr }
 * @returns {{ title, description, price, currency, imageUrls, condition }}
 */
async function fetchSingleFBListing(listingId, tokens) {
    const { fb_dtsg, lsd, c_user, fb_rev, fb_hs, fb_dyn, fb_csr } = tokens;

    const variables = {
        targetId: String(listingId),
        scale: 2,
        enableJobEmployerActionBar: false,
        enableJobSeekerActionBar: false,
        feedbackSource: 56,
        feedLocation: 'MARKETPLACE_MEGAMALL',
        referralCode: null,
        useDefaultActor: false,
        __relay_internal__pv__ShouldUpdateMarketplaceBoostListingBoostedStatusrelayprovider: false,
        __relay_internal__pv__CometUFISingleLineUFIrelayprovider: false,
        __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
        __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
        __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: 'ORIGINAL',
        __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
        __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: false,
        __relay_internal__pv__IsWorkUserrelayprovider: false,
        __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: true,
        __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: true,
        __relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider: true,
    };

    const rev = fb_rev || '1035354658';
    const spinT = String(Math.floor(Date.now() / 1000));

    const params = new URLSearchParams({
        doc_id: '26303270389289489',
        variables: JSON.stringify(variables),
        fb_api_req_friendly_name: 'MarketplacePDPContainerQuery',
        fb_api_caller_class: 'RelayModern',
        server_timestamps: 'true',
        __user: c_user || '',
        __a: '1',
        fb_dtsg,
        lsd,
        jazoest: computeJazoest(fb_dtsg),
        av: c_user || '',
        __rev: rev,
        __spin_r: rev,
        __spin_b: 'trunk',
        __spin_t: spinT,
        dpr: '2',
        __comet_req: '15',
    });
    if (fb_hs)  params.set('__hs', fb_hs);
    if (fb_dyn) params.set('__dyn', fb_dyn);
    if (fb_csr) params.set('__csr', fb_csr);

    const response = await fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-FB-LSD': lsd,
            'X-FB-Friendly-Name': 'MarketplacePDPContainerQuery',
            'X-ASBD-ID': '359341',
        },
        body: params.toString(),
    });

    if (!response.ok) {
        throw new Error(`FB HTTP ${response.status} for listing ${listingId}`);
    }

    const text = await response.text();
    const chunks = parseFBNDJSON(text);
    if (!chunks.length) throw new Error('FB returned empty response for listing ' + listingId);

    // Check the first chunk for top-level API errors before scanning all chunks
    const main = chunks[0];
    if (main?.error !== undefined && main?.error !== null) {
        const err = main.error;
        const code = typeof err === 'object' ? (err.code ?? '') : err;
        const msg = typeof err === 'object'
            ? (err.message ?? JSON.stringify(err))
            : (main.errorDescription ?? String(err));
        throw new Error(`FB API error ${code}: ${msg}`);
    }
    if (main?.errors?.length) throw new Error(`FB GraphQL: ${main.errors[0]?.message}`);

    // FB uses @defer — description arrives in chunk 0, listing_photos in later chunks.
    // We deep-search every chunk so we never miss data regardless of which chunk it lands in.
    const imageUrlSet = new Set();
    let description = null;
    let condition = null;
    let title = null;
    let price = null;
    let currency = null;

    /**
     * Extracts a photo URI from a single photo node, handling the two shapes
     * FB uses in practice:
     *   • { image: { uri } }            — standard PDP format
     *   • { photo: { image: { uri } } } — C2C media viewer format
     *   • { uri }                        — rare flattened format
     */
    function extractPhotoUri(photo) {
        return photo?.image?.uri
            || photo?.photo?.image?.uri
            || photo?.uri
            || null;
    }

    function scanChunk(obj, depth) {
        if (!obj || typeof obj !== 'object') return;
        if (depth > 20) return; // guard against runaway recursion

        if (Array.isArray(obj)) {
            for (const item of obj) scanChunk(item, depth + 1);
            return;
        }

        // listing_photos — the deferred image array (primary target)
        if ('listing_photos' in obj && Array.isArray(obj.listing_photos)) {
            for (const photo of obj.listing_photos) {
                const uri = extractPhotoUri(photo);
                if (uri) imageUrlSet.add(uri);
            }
        }

        // primary_listing_photo — cover image present in the first chunk
        if ('primary_listing_photo' in obj) {
            const uri = extractPhotoUri(obj.primary_listing_photo);
            if (uri) imageUrlSet.add(uri);
        }

        if (!description && 'redacted_description' in obj) {
            const t = obj.redacted_description?.text;
            if (t) description = t;
        }

        if (!condition && 'condition_display_name' in obj) {
            if (typeof obj.condition_display_name === 'string') condition = obj.condition_display_name;
        }

        if (!title && 'marketplace_listing_title' in obj) {
            if (typeof obj.marketplace_listing_title === 'string') title = obj.marketplace_listing_title;
        }

        if (!price && 'listing_price' in obj && obj.listing_price) {
            price    = obj.listing_price.amount   ?? null;
            currency = obj.listing_price.currency ?? null;
        }

        // Recurse into all child values
        for (const val of Object.values(obj)) {
            if (val && typeof val === 'object') scanChunk(val, depth + 1);
        }
    }

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        // Diagnostic: log the top-level keys and size of every chunk so we can
        // see exactly where (or whether) listing_photos arrives.
        const topKeys = chunk && typeof chunk === 'object' ? Object.keys(chunk) : [];
        console.log(
            `FB Scraper [chunk ${i}] keys: [${topKeys.join(', ')}] — ` +
            `${JSON.stringify(chunk).length} chars`
        );
        scanChunk(chunk, 0);
    }

    // --- Supplementary photo query fallback -------------------------------
    // listing_photos is deferred and appears to be absent or inaccessible in
    // the MarketplacePDPContainerQuery response for seller views. Use the
    // dedicated MarketplacePDPC2CMediaViewerWithImagesQuery (doc_id
    // 10059604367394414) which returns only listing_photos in ~8 KB.
    if (imageUrlSet.size === 0) {
        console.warn(`FB Scraper [fetchSingleFBListing]: no images from main query for listing ${listingId} — trying photo query`);
        try {
            const photoUrls = await fetchFBListingPhotos(listingId, tokens);
            for (const url of photoUrls) imageUrlSet.add(url);
            console.log(`FB Scraper [fetchSingleFBListing]: photo query returned ${photoUrls.length} images for listing ${listingId}`);
        } catch (e) {
            console.warn(`FB Scraper [fetchSingleFBListing]: photo query failed for listing ${listingId}: ${e.message}`);
        }
    }

    // --- Regex fallback (last resort) -------------------------------------
    if (imageUrlSet.size === 0) {
        console.warn(`FB Scraper [fetchSingleFBListing]: both queries found 0 images for listing ${listingId} — trying regex on raw text`);
        const unescaped = text.replace(/\\\//g, '/');
        const matches = unescaped.match(/https:\/\/[a-z0-9.\-]+\.fbcdn\.net\/v\/[^\s"'<>\\]+/g) || [];
        for (const url of matches) {
            if (/\/v\/t(45|39|31)\./.test(url)) imageUrlSet.add(url);
        }
        if (imageUrlSet.size > 0) {
            console.log(`FB Scraper [fetchSingleFBListing]: regex fallback found ${imageUrlSet.size} images`);
        }
    }

    const imageUrls = [...imageUrlSet];
    console.log(
        `FB Scraper [fetchSingleFBListing]: listing ${listingId} — ` +
        `${chunks.length} chunks, ${imageUrls.length} images, desc: ${!!description}, condition: ${condition}`
    );

    return { title, description, price, currency, condition, imageUrls };
}

/**
 * Fetches the full photo set for a single listing using the lighter
 * MarketplacePDPC2CMediaViewerWithImagesQuery (doc_id 10059604367394414).
 * This query is ~8 KB vs ~310 KB for the full PDP query and returns
 * listing_photos reliably even in seller view.
 *
 * @param {string} listingId
 * @param {object} tokens  { fb_dtsg, lsd, c_user, fb_rev, fb_hs, fb_dyn, fb_csr }
 * @returns {string[]}  Array of image URIs (empty on failure)
 */
async function fetchFBListingPhotos(listingId, tokens) {
    const { fb_dtsg, lsd, c_user, fb_rev, fb_hs, fb_dyn, fb_csr } = tokens;

    const rev = fb_rev || '1035354658';
    const params = new URLSearchParams({
        doc_id: '10059604367394414',
        variables: JSON.stringify({ targetId: String(listingId), scale: 2 }),
        fb_api_req_friendly_name: 'MarketplacePDPC2CMediaViewerWithImagesQuery',
        fb_api_caller_class: 'RelayModern',
        server_timestamps: 'true',
        __user: c_user || '',
        __a: '1',
        fb_dtsg,
        lsd,
        jazoest: computeJazoest(fb_dtsg),
        av: c_user || '',
        __rev: rev,
        __spin_r: rev,
        __spin_b: 'trunk',
        __spin_t: String(Math.floor(Date.now() / 1000)),
        dpr: '2',
        __comet_req: '15',
    });
    if (fb_hs)  params.set('__hs', fb_hs);
    if (fb_dyn) params.set('__dyn', fb_dyn);
    if (fb_csr) params.set('__csr', fb_csr);

    const response = await fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-FB-LSD': lsd,
            'X-FB-Friendly-Name': 'MarketplacePDPC2CMediaViewerWithImagesQuery',
            'X-ASBD-ID': '359341',
        },
        body: params.toString(),
    });

    if (!response.ok) {
        throw new Error(`FB photo query HTTP ${response.status}`);
    }

    const text = await response.text();
    const chunks = parseFBNDJSON(text);
    const uriSet = new Set();

    function extractFromChunk(obj, depth) {
        if (!obj || typeof obj !== 'object' || depth > 20) return;
        if (Array.isArray(obj)) {
            for (const item of obj) extractFromChunk(item, depth + 1);
            return;
        }
        if ('listing_photos' in obj && Array.isArray(obj.listing_photos)) {
            for (const photo of obj.listing_photos) {
                const uri = photo?.image?.uri || photo?.photo?.image?.uri || photo?.uri;
                if (uri) uriSet.add(uri);
            }
        }
        for (const val of Object.values(obj)) {
            if (val && typeof val === 'object') extractFromChunk(val, depth + 1);
        }
    }

    for (const chunk of chunks) extractFromChunk(chunk, 0);

    // Regex fallback on this response too
    if (uriSet.size === 0) {
        const unescaped = text.replace(/\\\//g, '/');
        const matches = unescaped.match(/https:\/\/[a-z0-9.\-]+\.fbcdn\.net\/v\/[^\s"'<>\\]+/g) || [];
        for (const url of matches) {
            if (/\/v\/t(45|39|31)\./.test(url)) uriSet.add(url);
        }
    }

    return [...uriSet];
}

async function fetchAllFBListings(tokens) {
    const allListings = [];
    let cursor = null;
    let hasNextPage = true;
    let pageCount = 0;
    const MAX_PAGES = 20;

    while (hasNextPage && pageCount < MAX_PAGES) {
        pageCount++;
        console.log(`FB Scraper: fetching page ${pageCount} (cursor: ${cursor ? cursor.slice(0, 12) + '…' : 'null'})`);

        const { edges, pageInfo } = await fetchFBPage(tokens, cursor);

        for (const edge of edges) {
            const listing = edge?.node?.first_listing;
            if (!listing || listing.is_sold || listing.is_draft || listing.is_hidden) continue;
            allListings.push(normalizeFBListing(listing));
        }

        hasNextPage = pageInfo.has_next_page;
        cursor = pageInfo.end_cursor;
        if (hasNextPage) await new Promise(r => setTimeout(r, 350));
    }

    console.log(`FB Scraper: ${allListings.length} listings fetched. Starting deep fetch for full data...`);
    await deepFetchListings(allListings);

    console.log(`FB Scraper: done — ${allListings.length} active listings over ${pageCount} page(s)`);
    return { success: true, products: allListings, count: allListings.length };
}

// ---------------------------------------------------------------------------
// DELETE LISTING
// ---------------------------------------------------------------------------

/**
 * Deletes a single Facebook Marketplace listing via the
 * useCometMarketplaceForSaleItemDeleteMutation GraphQL mutation.
 *
 * Must run inside a real FB tab so credentials:'include' attaches session
 * cookies and sec-fetch headers are browser-authentic.
 *
 * @param {string} listingId  The numeric FB listing ID to delete
 * @param {object} tokens     { fb_dtsg, lsd, c_user, fb_rev, fb_hs, fb_dyn, fb_csr }
 * @returns {{ success: boolean, deletedId?: string, error?: string }}
 */
async function deleteFBListing(listingId, tokens) {
    const { fb_dtsg, lsd, c_user, fb_rev, fb_hs, fb_dyn, fb_csr } = tokens;

    const variables = {
        input: {
            actor_id: c_user,
            client_mutation_id: String(Date.now()),
            batch_delete_variants: true,
            for_sale_item_id: listingId,
            referral_surface: 'BROWSE_TAB',
            surface: 'MARKETPLACE_PAGE_SELLING',
        },
    };

    const rev = fb_rev || '1035354658';
    const params = new URLSearchParams({
        doc_id: '30073389588942699',
        variables: JSON.stringify(variables),
        fb_api_req_friendly_name: 'useCometMarketplaceForSaleItemDeleteMutation',
        fb_api_caller_class: 'RelayModern',
        server_timestamps: 'true',
        __user: c_user || '',
        __a: '1',
        fb_dtsg,
        lsd,
        jazoest: computeJazoest(fb_dtsg),
        av: c_user || '',
        __rev: rev,
        __spin_r: rev,
        __spin_b: 'trunk',
        __spin_t: String(Math.floor(Date.now() / 1000)),
        dpr: '2',
        __comet_req: '15',
    });
    if (fb_hs)  params.set('__hs', fb_hs);
    if (fb_dyn) params.set('__dyn', fb_dyn);
    if (fb_csr) params.set('__csr', fb_csr);

    const response = await fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-FB-LSD': lsd,
            'X-FB-Friendly-Name': 'useCometMarketplaceForSaleItemDeleteMutation',
            'X-ASBD-ID': '359341',
        },
        body: params.toString(),
    });

    if (!response.ok) {
        throw new Error(`FB HTTP ${response.status} deleting listing ${listingId}`);
    }

    // Strip the for(;;); prefix before parsing
    const text = await response.text();
    const clean = text.startsWith('for (;;);') ? text.slice('for (;;);'.length) : text;
    const json = JSON.parse(clean);

    const deletedId = json?.data?.commerce_for_sale_item_delete?.deleted_for_sale_item_id;
    if (deletedId === listingId) {
        console.log(`FB Scraper: listing ${listingId} deleted successfully`);
        return { success: true, deletedId };
    }

    // Surface any FB-side error message
    const fbError = json?.errors?.[0]?.message
        || json?.error?.message
        || JSON.stringify(json).slice(0, 200);
    throw new Error(`Delete mutation did not confirm deletion: ${fbError}`);
}

// ---------------------------------------------------------------------------
// MESSAGE LISTENER
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING_FACEBOOK_SCRAPER') {
        sendResponse({ alive: true });
        return;
    }

    if (request.action === 'REFRESH_FB_TOKENS') {
        const tokens = extractFacebookTokens();
        const preview = (v) => v ? `${v.slice(0, 6)}…(${v.length})` : 'missing';
        console.log('FB Scraper: refreshed tokens on demand', {
            fb_dtsg: preview(tokens.fb_dtsg),
            lsd: preview(tokens.lsd),
        });
        sendResponse(tokens);
        return;
    }

    if (request.action === 'FETCH_SINGLE_FB_LISTING') {
        const liveTokens = extractFacebookTokens();
        const tokens = {
            fb_dtsg: liveTokens.fb_dtsg || request.tokens?.fb_dtsg,
            lsd:     liveTokens.lsd     || request.tokens?.lsd,
            c_user:  liveTokens.c_user  || request.tokens?.c_user,
            fb_rev:  liveTokens.fb_rev  || request.tokens?.fb_rev,
            fb_hs:   liveTokens.fb_hs   || request.tokens?.fb_hs,
            fb_dyn:  liveTokens.fb_dyn  || request.tokens?.fb_dyn,
            fb_csr:  liveTokens.fb_csr  || request.tokens?.fb_csr,
        };

        if (!tokens.fb_dtsg || !tokens.lsd) {
            sendResponse({ success: false, error: 'Could not extract fb_dtsg / lsd from this page.' });
            return;
        }

        fetchSingleFBListing(request.listingId, tokens)
            .then(data => sendResponse({ success: true, ...data }))
            .catch(err => sendResponse({ success: false, error: err.message }));

        return true; // keep channel open for async response
    }

    if (request.action === 'DELETE_SINGLE_FB_LISTING') {
        const liveTokens = extractFacebookTokens();
        const tokens = {
            fb_dtsg: liveTokens.fb_dtsg || request.tokens?.fb_dtsg,
            lsd:     liveTokens.lsd     || request.tokens?.lsd,
            c_user:  liveTokens.c_user  || request.tokens?.c_user,
            fb_rev:  liveTokens.fb_rev  || request.tokens?.fb_rev,
            fb_hs:   liveTokens.fb_hs   || request.tokens?.fb_hs,
            fb_dyn:  liveTokens.fb_dyn  || request.tokens?.fb_dyn,
            fb_csr:  liveTokens.fb_csr  || request.tokens?.fb_csr,
        };

        if (!tokens.fb_dtsg || !tokens.lsd) {
            sendResponse({ success: false, error: 'Could not extract fb_dtsg / lsd from this page.' });
            return;
        }

        deleteFBListing(request.listingId, tokens)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));

        return true; // keep channel open for async response
    }

    // Background delegates the paginated fetch here so it runs inside the real
    // FB tab — cookies are browser-managed and sec-fetch headers are authentic.
    if (request.action === 'EXECUTE_FB_FETCH') {
        // Re-sniff tokens from the live page to ensure freshness,
        // but fall back to whatever the background passed in.
        const liveTokens = extractFacebookTokens();
        const tokens = {
            fb_dtsg: liveTokens.fb_dtsg || request.tokens?.fb_dtsg,
            lsd:     liveTokens.lsd     || request.tokens?.lsd,
            c_user:  liveTokens.c_user  || request.tokens?.c_user,
            fb_rev:  liveTokens.fb_rev  || request.tokens?.fb_rev,
            fb_hs:   liveTokens.fb_hs   || request.tokens?.fb_hs,
        };

        if (!tokens.fb_dtsg || !tokens.lsd) {
            sendResponse({ success: false, error: 'Could not extract fb_dtsg / lsd from this page.' });
            return;
        }

        fetchAllFBListings(tokens)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));

        return true; // keep message channel open for async response
    }
});

// ---------------------------------------------------------------------------
// INIT — extract tokens and send to background on page load
// ---------------------------------------------------------------------------

(function init() {
    const tokens = extractFacebookTokens();
    const { fb_dtsg, lsd, c_user, fb_rev, fb_hs, fb_dyn, fb_csr } = tokens;

    if (fb_dtsg || lsd || c_user) {
        const preview = (v) => v ? `${v.slice(0, 6)}…(${v.length})` : 'missing';
        console.log('FB Scraper: found tokens, saving to storage', {
            fb_dtsg: preview(fb_dtsg),
            lsd: preview(lsd),
            c_user: c_user || 'missing',
            fb_rev: fb_rev || 'missing',
            fb_hs: preview(fb_hs),
            fb_dyn: preview(fb_dyn),
            fb_csr: preview(fb_csr),
        });
        chrome.runtime.sendMessage({ action: 'SAVE_FACEBOOK_TOKENS', fb_dtsg, lsd, c_user, fb_rev, fb_hs, fb_dyn, fb_csr });
    } else {
        console.log('FB Scraper: no tokens found on this page');
    }
})();
