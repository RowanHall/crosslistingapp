// extension/background.js
console.log("Background Service Worker loaded [Triple Sniff Edition]");

// --- 0. HELPERS ---

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Basic JWT Decoder (Base64Url -> JSON)
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Failed to parse JWT:", e);
        return null;
    }
}


// --- 1. DEPOP SNIFFER ---
// Captures User ID from response headers and saves to storage
chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        const idHeader = details.responseHeaders.find(h => h.name.toLowerCase() === 'x-user-id');
        if (idHeader && idHeader.value) {
            console.log("Background: Captured Depop User ID:", idHeader.value);
            chrome.storage.local.set({ depop_user_id: idHeader.value });
        }
    },
    { urls: ["https://webapi.depop.com/*"] },
    ["responseHeaders"]
);


// --- 2. GRAILED SNIFFER (Cookie + CSRF Strategy) ---
// Captures JWT, full cookie blob, and x-csrf-token from outgoing Grailed requests.
// The CSRF token is captured directly from real requests (most reliable approach).
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        const headers = details.requestHeaders;
        const cookieHeader = headers.find(h => h.name.toLowerCase() === 'cookie');
        const csrfHeader = headers.find(h => h.name.toLowerCase() === 'x-csrf-token');

        // Always capture the CSRF token when we see it (from any POST to Grailed)
        if (csrfHeader && csrfHeader.value) {
            chrome.storage.local.get(['grailed_csrf_token'], (data) => {
                if (data.grailed_csrf_token !== csrfHeader.value) {
                    console.log("Background: New Grailed CSRF token captured");
                    chrome.storage.local.set({ grailed_csrf_token: csrfHeader.value });

                    // Push updated CSRF token to backend if we already have credentials
                    chrome.storage.local.get(['grailed_cookies', 'grailed_user_id', 'grailed_device_id'], (creds) => {
                        if (creds.grailed_cookies && creds.grailed_user_id) {
                            sendGrailedCredsToBackend(creds.grailed_cookies, creds.grailed_user_id, creds.grailed_device_id, csrfHeader.value);
                        }
                    });
                }
            });
        }

        if (cookieHeader && cookieHeader.value) {
            const fullCookies = cookieHeader.value;
            const matches = fullCookies.match(/grailed_jwt=(eyJ[^;]+)/);

            if (matches && matches[1]) {
                const token = matches[1];
                const fullToken = `Bearer ${token}`;

                chrome.storage.local.get(['grailed_token', 'grailed_cookies', 'grailed_device_id', 'grailed_csrf_token'], (data) => {
                    const tokenChanged = data.grailed_token !== fullToken;
                    const cookiesChanged = data.grailed_cookies !== fullCookies;

                    if (tokenChanged || cookiesChanged) {
                        console.log("Background: New Grailed credentials detected!");

                        const payload = parseJwt(token);
                        const userId = payload && (payload.sub || payload.id || payload.user_id);

                        if (userId) {
                            console.log(`Background: Extracted Grailed User ID: ${userId}`);
                        } else {
                            console.warn("Background: Could not extract User ID from Grailed JWT");
                        }

                        const deviceId = data.grailed_device_id || crypto.randomUUID();
                        const csrfToken = csrfHeader?.value || data.grailed_csrf_token || null;

                        chrome.storage.local.set({
                            grailed_token: fullToken,
                            grailed_user_id: userId || data.grailed_user_id,
                            grailed_cookies: fullCookies,
                            grailed_device_id: deviceId,
                        });

                        if (userId) {
                            sendGrailedCredsToBackend(fullCookies, userId, deviceId, csrfToken);
                        }
                    }
                });
            }
        }
    },
    { urls: ["https://*.grailed.com/*"] },
    ["requestHeaders", "extraHeaders"]
);

function sendGrailedCredsToBackend(cookies, userId, deviceId, csrfToken) {
    fetch('http://localhost:3000/api/integrations/grailed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cookies, user_id: userId, device_id: deviceId, csrf_token: csrfToken })
    }).then(resp => {
        if (resp.ok) {
            console.log("Background: Grailed credentials saved to backend");
        } else {
            resp.text().then(t => console.error("Background: Failed to save Grailed credentials:", resp.status, t));
        }
    }).catch(err => {
        console.error("Background: Network error saving Grailed credentials:", err.message);
    });
}


// --- 3. ALGOLIA SNIFFER (Key Strategy) ---
// Captures dynamic Algolia keys from headers
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        let appId = null;
        let apiKey = null;

        for (const h of details.requestHeaders) {
            const name = h.name.toLowerCase();
            if (name === 'x-algolia-application-id') appId = h.value;
            if (name === 'x-algolia-api-key') apiKey = h.value;
        }
        console.log("Background: Found Algolia Credentials, might be new");
        if (appId && apiKey) {
            // Check uniqueness to avoid spamming storage
            chrome.storage.local.get(['algolia_creds'], (data) => {
                const oldCreds = data.algolia_creds || {};
                if (oldCreds.appId !== appId || oldCreds.apiKey !== apiKey) {
                    console.log("Background: Captured NEW Algolia Credentials!");
                    chrome.storage.local.set({
                        algolia_creds: { appId, apiKey }
                    });
                }
            });
        }
    },
    { urls: ["https://*.algolia.net/*", "https://*.algolianet.com/*"] },
    ["requestHeaders", "extraHeaders"]
);


// --- 4. FACEBOOK SNIFFER ---
// Captures the full cookie blob from outgoing FB requests.
// httpOnly cookies (xs, fr) are NOT accessible via document.cookie but ARE
// visible in request headers at the network level — this is how we capture them.
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        const cookieHeader = details.requestHeaders.find(h => h.name.toLowerCase() === 'cookie');
        if (cookieHeader && cookieHeader.value) {
            chrome.storage.local.get(['fb_session_cookies'], (data) => {
                if (data.fb_session_cookies !== cookieHeader.value) {
                    console.log("Background: Saved Facebook session cookies");
                    chrome.storage.local.set({ fb_session_cookies: cookieHeader.value });
                }
            });
        }
    },
    { urls: ["https://*.facebook.com/*"] },
    ["requestHeaders", "extraHeaders"]
);


// --- 5. MESSAGE ROUTER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Background: Received action:", request.action);

    if (request.action === 'SAVE_FACEBOOK_TOKENS') {
        const toSave = {
            fb_dtsg: request.fb_dtsg,
            fb_lsd: request.lsd,
            fb_user_id: request.c_user,
        };
        // Persist optional session metadata only when present (avoid clobbering with null)
        if (request.fb_rev) toSave.fb_rev = request.fb_rev;
        if (request.fb_hs)  toSave.fb_hs  = request.fb_hs;
        if (request.fb_dyn) toSave.fb_dyn = request.fb_dyn;
        if (request.fb_csr) toSave.fb_csr = request.fb_csr;

        chrome.storage.local.set(toSave, () => {
            const preview = (v) => v ? `${v.slice(0, 6)}…(${v.length})` : "missing";
            console.log("Background: Saved Facebook tokens", {
                fb_dtsg: preview(request.fb_dtsg),
                fb_lsd: preview(request.lsd),
                fb_user_id: request.c_user || "missing",
                fb_rev: request.fb_rev || "missing",
                fb_hs: preview(request.fb_hs),
                fb_dyn: preview(request.fb_dyn),
                fb_csr: preview(request.fb_csr),
            });

            // POST tokens to the Next.js backend — only when both CSRF tokens are present
            if (!request.fb_dtsg || !request.lsd) {
                console.log("Background: Skipping backend POST — fb_dtsg or lsd not captured yet");
                return;
            }

            chrome.storage.local.get(['fb_session_cookies'], async (data) => {
                const payload = {
                    fb_dtsg: request.fb_dtsg,
                    lsd: request.lsd,
                    cookies: data.fb_session_cookies || null,
                    user_id: request.c_user || null,
                    fb_dyn: request.fb_dyn || null,
                    fb_csr: request.fb_csr || null,
                };
                const preview = (v) => v ? `${v.slice(0, 6)}…(${v.length})` : "missing";
                console.log("Background: Sending Facebook tokens to backend...", {
                    fb_dtsg: preview(request.fb_dtsg),
                    lsd: preview(request.lsd),
                    cookies: data.fb_session_cookies ? `present (${data.fb_session_cookies.length} chars)` : "missing",
                    user_id: request.c_user || "missing",
                    fb_dyn: preview(request.fb_dyn),
                    fb_csr: preview(request.fb_csr),
                });

                try {
                    const resp = await fetch('http://localhost:3000/api/integrations/facebook', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify(payload)
                    });

                    if (resp.ok) {
                        const result = await resp.json();
                        console.log("Background: Successfully sent Facebook tokens to backend", result);
                    } else {
                        const errText = await resp.text();
                        console.error(`Background: Failed to send Facebook tokens to backend: ${resp.status}`, errText);
                    }
                } catch (err) {
                    console.error("Background: Network error sending Facebook tokens to backend:", err.message);
                }
            });
        });
        return false;
    }

    if (request.action === 'SYNC_FACEBOOK') {
        handleFacebookSync(sendResponse, sender?.tab?.id);
        return true; // Keep channel open for async work
    }

    if (request.action === 'SYNC_DEPOP') {
        handleDepopSync(sendResponse);
        return true; // Keep channel open
    }

    if (request.action === 'SYNC_GRAILED') {
        handleGrailedSync(sendResponse, sender?.tab?.id);
        return true; // Keep channel open
    }

    if (request.action === 'FETCH_GRAILED_DATA') {
        handleGrailedSync(sendResponse, sender?.tab?.id);
        return true; // Keep channel open
    }

    if (request.action === 'CROSSLIST_DEPOP') {
        handleDepopCrosslist(request.listings, sender?.tab?.id);
        sendResponse({ received: true });
        return true;
    }

    if (request.action === 'INITIATE_FB_DELETE') {
        handleFacebookDelete(request.listingId, sendResponse);
        return true; // Keep channel open for async work
    }

    if (request.action === 'DEPOP_POST_COMPLETE') {
        console.log(`Background: Depop post complete: "${request.listingTitle}" success=${request.success} error=${request.error || 'none'}`);
        if (request.stepLog && request.stepLog.length > 0) {
            console.log('Background: === Filler Step Log ===');
            request.stepLog.forEach(s => console.log('  ' + s));
            console.log('Background: === End Step Log ===');
        }
        processNextDepopListing(request.success, request.error);
        return false;
    }

    if (request.action === 'CROSSLIST_TO_EBAY') {
        const payload = request.payload;
        if (!payload) {
            sendResponse({ success: false, error: 'No payload provided' });
            return false;
        }
        chrome.storage.local.set({ ebay_crosslist_payload: payload }, () => {
            console.log('Background: eBay crosslist payload saved for:', payload.title);
            const suggestUrl = `https://www.ebay.com/sl/prelist/suggest?title=${encodeURIComponent(payload.title)}`;
            chrome.tabs.create({ url: suggestUrl }, (tab) => {
                console.log('Background: Opened eBay prelist tab:', tab.id);
                sendResponse({ success: true, tabId: tab.id });
            });
        });
        return true; // Keep channel open for async chrome.tabs.create
    }

    if (request.action === 'EBAY_PUBLISH_SUCCESS') {
        const tabId = sender?.tab?.id;
        console.log(`Background: eBay listing published! itemId=${request.itemId} — closing tab ${tabId}`);

        if (tabId) {
            chrome.tabs.remove(tabId, () => {
                if (chrome.runtime.lastError) {
                    console.warn('Background: Could not close eBay tab:', chrome.runtime.lastError.message);
                }
            });
        }

        // Notify the X-LIST UI tab so it can show a success toast
        chrome.tabs.query({ url: 'http://localhost:3000/*' }, (tabs) => {
            for (const uiTab of tabs) {
                chrome.tabs.sendMessage(uiTab.id, {
                    type: 'EBAY_PUBLISH_SUCCESS',
                    itemId: request.itemId,
                }).catch(() => {/* tab may not have content script */});
            }
        });

        return false;
    }

    if (request.action === 'EBAY_FILL_COMPLETE') {
        // Only reaches here on publish failure — tab is kept open for inspection
        console.error(`Background: eBay fill/publish failed. Error: ${request.error} — tab left open for review.`);
        return false;
    }
});

/**
 * Sends a progress update to the tab that initiated the sync.
 */
function sendProgressToTab(tabId, progress) {
    if (!tabId) return;
    try {
        chrome.tabs.sendMessage(tabId, {
            type: 'GRAILED_SYNC_PROGRESS',
            progress
        });
    } catch (e) {
        console.warn('Background: Failed to send progress:', e.message);
    }
}


// --- 6. PHOTO ENRICHMENT ---

/**
 * Fetches the listing page HTML from grailed.com and extracts photos + description.
 * The background service worker has host_permissions for grailed.com,
 * so it can fetch listing pages with the user's cookies.
 * Returns { photos: string[], description: string|null }
 */
async function enrichFromListingPage(listingId, slug) {
    try {
        const listingPath = slug || listingId;
        const url = `https://www.grailed.com/listings/${listingPath}`;
        console.log(`Background: Fetching data from ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include'
        });

        if (!response.ok) {
            console.warn(`Background: Failed to fetch listing ${listingId}: ${response.status}`);
            return { photos: [], description: null };
        }

        console.log(`Background: Final URL for listing ${listingId}: ${response.url}`);

        const html = await response.text();
        const photos = new Set();
        let description = null;

        // --- Extract from __NEXT_DATA__ JSON ---
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
        if (nextDataMatch) {
            try {
                const nextData = JSON.parse(nextDataMatch[1]);
                // Try to find the listing description in the page props
                const listing = nextData?.props?.pageProps?.listing
                    || nextData?.props?.pageProps?.data?.listing;
                if (listing?.description) {
                    description = listing.description;
                    console.log(`Background: Found description in __NEXT_DATA__ for listing ${listingId}`);
                }
            } catch (e) {
                console.warn(`Background: Failed to parse __NEXT_DATA__ for listing ${listingId}:`, e.message);
            }
        }

        // --- Fallback: extract description from meta tag or og:description ---
        if (!description) {
            // Try og:description (usually has a good seller description)
            const ogDescMatch = html.match(/property="og:description"\s+content="([^"]+)"/);
            if (ogDescMatch && ogDescMatch[1]) {
                // Only use if it doesn't look like a generic Grailed SEO blurb
                const ogDesc = ogDescMatch[1];
                if (!ogDesc.startsWith('Searching for ')) {
                    description = ogDesc;
                }
            }
        }

        // --- Fallback: extract description from JSON-LD structured data ---
        if (!description) {
            const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/g);
            if (jsonLdMatch) {
                for (const block of jsonLdMatch) {
                    try {
                        const jsonStr = block.replace(/<\/?script[^>]*>/g, '');
                        const ld = JSON.parse(jsonStr);
                        if (ld?.description && ld['@type'] === 'Product') {
                            description = ld.description;
                            console.log(`Background: Found description in JSON-LD for listing ${listingId}`);
                            break;
                        }
                    } catch (e) { /* skip */ }
                }
            }
        }

        // --- Extract photos ---
        // Strategy 1: og:image meta tags
        const ogImageMatches = html.match(/property="og:image"\s+content="([^"]+)"/g) || [];
        for (const match of ogImageMatches) {
            const urlMatch = match.match(/content="([^"]+)"/);
            if (urlMatch && urlMatch[1].includes('media-assets.grailed.com')) {
                const cleanUrl = urlMatch[1].split('?')[0];
                photos.add(cleanUrl);
            }
        }

        // Strategy 2: Broad regex for any media-assets listing URL in HTML
        const broadRegex = /https:\/\/media-assets\.grailed\.com\/prd\/listing\/[^"'\s?]+/g;
        const broadMatches = html.match(broadRegex) || [];
        for (const url of broadMatches) {
            photos.add(url);
        }

        const uniqueUrls = [...photos];
        console.log(`Background: Found ${uniqueUrls.length} photos, description: ${description ? 'YES' : 'NO'} for listing ${listingId}`);

        return { photos: uniqueUrls, description };
    } catch (e) {
        console.error(`Background: Error enriching listing ${listingId}:`, e);
        return { photos: [], description: null };
    }
}

/**
 * Enriches Algolia hits with all photos by scraping each listing page.
 * Adds an `allPhotos` array to each hit.
 */
async function enrichListingsWithPhotos(hits, tabId) {
    const DELAY_MS = 500; // Half-second delay between requests to avoid rate-limiting
    const enriched = [];

    for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const listingId = hit.id || hit.objectID;
        const title = hit.title || `Listing ${listingId}`;

        console.log(`Background: Enriching photos ${i + 1}/${hits.length} (listing ${listingId})...`);

        // Send progress update to the UI
        sendProgressToTab(tabId, {
            phase: 'enriching',
            current: i + 1,
            total: hits.length,
            message: `Fetching photos ${i + 1}/${hits.length}...`
        });

        // Try to build the slug from Algolia data
        const slug = hit.pretty_path?.replace('/listings/', '') || listingId;

        const enriched_data = await enrichFromListingPage(listingId, slug);
        hit.allPhotos = enriched_data.photos;
        if (enriched_data.description) {
            hit.enrichedDescription = enriched_data.description;
        }
        enriched.push(hit);

        // Delay between requests (skip delay after last item)
        if (i < hits.length - 1) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }

    return enriched;
}


// --- 7. HANDLERS ---

async function handleDepopSync(sendResponse) {
    console.log("Background: Starting Depop Sync...");
    try {
        const data = await chrome.storage.local.get('depop_user_id');
        const userId = data.depop_user_id;

        if (!userId) {
            sendResponse({ success: false, error: "User ID missing. Please refresh Depop." });
            return;
        }

        const tabs = await chrome.tabs.query({ url: "*://*.depop.com/*" });
        if (tabs.length === 0) {
            sendResponse({ success: false, error: "Please open a Depop tab." });
            return;
        }

        chrome.tabs.sendMessage(tabs[0].id, {
            type: 'EXECUTE_PAGE_FETCH',
            userId: userId
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Background: Bridge communication error:", chrome.runtime.lastError.message);
                sendResponse({ success: false, error: "Extension disconnected. Please refresh your Depop tab." });
            } else {
                console.log("Background: Received Depop Data:", response);
                sendResponse(response);
            }
        });

        console.log(`Background: Fetched items from Depop.`);

    } catch (e) {
        console.error("Depop Sync Error:", e);
        sendResponse({ success: false, error: e.message });
    }
}

async function handleGrailedSync(sendResponse, tabId) {
    console.log("Background: Starting Grailed Sync (Direct Algolia + Photo Enrichment)...");

    try {
        // 1. Get All Credentials
        const data = await chrome.storage.local.get(['grailed_user_id', 'algolia_creds']);
        const userId = data.grailed_user_id;
        const creds = data.algolia_creds;

        if (!userId) {
            sendResponse({ success: false, error: "Grailed User ID missing. Please login to Grailed." });
            return;
        }
        if (!creds || !creds.appId || !creds.apiKey) {
            sendResponse({ success: false, error: "Algolia Keys missing. Please browse Grailed to capture them." });
            return;
        }

        console.log(`Background: Fetching for User ${userId} with AppID ${creds.appId}`);

        // Send initial progress
        sendProgressToTab(tabId, {
            phase: 'fetching',
            current: 0,
            total: 0,
            message: 'Fetching your listings...'
        });

        // 2. Phase 1: Fast Algolia fetch for listing metadata
        const url = `https://${creds.appId}-dsn.algolia.net/1/indexes/*/queries`;

        const body = {
            "requests": [
                {
                    "indexName": "Listing_by_listing_quality_production",
                    "params": `filters=user.id%3A${userId}&hitsPerPage=50`
                }
            ]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Algolia-Application-Id': creds.appId,
                'X-Algolia-API-Key': creds.apiKey
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Algolia Request Failed: ${response.status} - ${errText}`);
        }

        const result = await response.json();
        const hits = result.results[0]?.hits || [];
        console.log(`Background: Phase 1 complete — fetched ${hits.length} items from Algolia.`);

        // Send progress: listings fetched, starting enrichment
        sendProgressToTab(tabId, {
            phase: 'enriching',
            current: 0,
            total: hits.length,
            message: `Found ${hits.length} listings. Fetching photos...`
        });

        // 3. Phase 2: Enrich each listing with all photos
        console.log(`Background: Phase 2 — enriching ${hits.length} listings with full photos...`);
        const enrichedHits = await enrichListingsWithPhotos(hits, tabId);
        console.log(`Background: Phase 2 complete — photo enrichment done.`);

        // Send progress: saving
        sendProgressToTab(tabId, {
            phase: 'saving',
            current: hits.length,
            total: hits.length,
            message: 'Saving to database...'
        });

        // 4. Send response
        sendResponse({ success: true, products: enrichedHits, count: enrichedHits.length });

    } catch (e) {
        console.error("Grailed Sync Error:", e);
        sendResponse({ success: false, error: e.message });
    }
}

// --- 8. FACEBOOK MARKETPLACE IMPORT ---

/**
 * Derives Facebook's "jazoest" anti-CSRF value from fb_dtsg.
 * Algorithm: sum the char codes of fb_dtsg, prepend "2".
 */
function computeJazoest(fbDtsg) {
    let sum = 0;
    for (const char of fbDtsg) sum += char.charCodeAt(0);
    return `2${sum}`;
}

/**
 * Facebook sends NDJSON (newline-delimited JSON) with a "for (;;);" prefix on
 * the first chunk as a CSRF guard. Splits on newlines, strips the prefix, and
 * returns an array of parsed objects. Tolerates malformed chunks.
 */
function parseFBNDJSON(text) {
    const results = [];
    for (const rawChunk of text.trim().split('\n')) {
        let chunk = rawChunk.trim();
        if (!chunk) continue;
        if (chunk.startsWith('for (;;);')) chunk = chunk.slice('for (;;);'.length);
        try {
            results.push(JSON.parse(chunk));
        } catch (e) {
            console.warn('Background: FB — skipping unparseable NDJSON chunk:', chunk.slice(0, 120));
        }
    }
    return results;
}

/**
 * Normalizes a raw Facebook listing node into a flat, app-friendly object.
 * Only the fields we actually use are extracted; all status flags are preserved.
 */
function normalizeFBListing(node) {
    return {
        id: node.id,
        title: node.marketplace_listing_title
            || node.base_marketplace_listing_title
            || 'Untitled',
        price: node.listing_price?.formatted_amount
            || node.formatted_price?.text
            || null,
        imageUrl: node.primary_listing_photo?.image?.uri || null,
        url: node.share_uri
            || `https://www.facebook.com/marketplace/item/${node.id}/`,
        createdAt: node.creation_time
            ? new Date(node.creation_time * 1000).toISOString()
            : null,
        isSold: node.is_sold || false,
        isLive: node.is_live || false,
        views: node.listing_insights?.insights?.[0]?.count || 0,
        platform: 'facebook',
    };
}

/**
 * Fetches one page of active Facebook Marketplace listings via the private
 * Relay pagination query.
 *
 * @param {object} creds  - Stored credentials from chrome.storage.local
 * @param {string|null} cursor - Relay cursor for pagination (null = first page)
 * @returns {{ edges: Array, pageInfo: { has_next_page: boolean, end_cursor: string|null } }}
 */
async function fetchFBMarketplacePage(creds, cursor) {
    const { fb_dtsg, fb_lsd, fb_user_id, fb_session_cookies, fb_rev, fb_hs } = creds;

    const variables = {
        count: 10,
        cursor: cursor || null,
        order: 'CREATION_TIMESTAMP_DESC',
        scale: 2,
        state: null,
        status: null,
        title_search: null,
        // Relay provider flag observed in all captured requests
        '__relay_internal__pv__ShouldUpdateMarketplaceBoostListingBoostedStatusrelayprovider': false,
    };

    const rev = fb_rev || '1034954086'; // Fallback — will work until FB deploys
    const spinT = String(Math.floor(Date.now() / 1000));
    const jazoest = computeJazoest(fb_dtsg);

    const params = new URLSearchParams({
        doc_id: '25446537771690810',
        variables: JSON.stringify(variables),
        fb_api_req_friendly_name: 'MarketplaceYouSellingFastActiveSectionPaginationQuery',
        fb_api_caller_class: 'RelayModern',
        server_timestamps: 'true',
        __user: fb_user_id || '',
        __a: '1',
        fb_dtsg,
        lsd: fb_lsd,
        jazoest,
        av: fb_user_id || '',
        __rev: rev,
        __spin_r: rev,
        __spin_b: 'trunk',
        __spin_t: spinT,
        dpr: '2',
        __comet_req: '15',
    });

    if (fb_hs) params.set('__hs', fb_hs);

    const response = await fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': fb_session_cookies,
            'X-FB-LSD': fb_lsd,
            'X-FB-Friendly-Name': 'MarketplaceYouSellingFastActiveSectionPaginationQuery',
            'X-ASBD-ID': '359341',
            'Origin': 'https://www.facebook.com',
            'Referer': 'https://www.facebook.com/marketplace/you/selling',
            // FB validates these sec-fetch-* headers — omitting them causes error 1357054
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        },
        body: params.toString(),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`FB GraphQL HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const text = await response.text();
    const chunks = parseFBNDJSON(text);

    if (chunks.length === 0) {
        throw new Error('FB returned an empty or unparseable response');
    }

    // Chunk 0 — main listing data
    const mainChunk = chunks[0];
    console.log('Background: FB raw first chunk:', JSON.stringify(mainChunk).slice(0, 500));

    // Detect FB error responses.
    // FB error can be a plain number ({"error":1,"errorDescription":"..."}),
    // an object ({"error":{"code":1357054,"message":"..."}}), or a GraphQL errors array.
    if (mainChunk?.error !== undefined && mainChunk?.error !== null) {
        const err = mainChunk.error;
        const code = typeof err === 'object' ? (err.code ?? err.type ?? '') : err;
        const msg  = typeof err === 'object'
            ? (err.message ?? err.errorDescription ?? JSON.stringify(err))
            : (mainChunk.errorDescription ?? mainChunk.errorSummary ?? String(err));
        throw new Error(`FB API error ${code}: ${msg}`);
    }
    if (mainChunk?.errors?.length) {
        throw new Error(`FB GraphQL error: ${mainChunk.errors[0]?.message}`);
    }

    const edges = mainChunk?.data?.viewer?.marketplace_listing_sets?.edges || [];

    // Deferred chunk — pagination info (sent as a second NDJSON line)
    let pageInfo = { has_next_page: false, end_cursor: null };
    for (const chunk of chunks.slice(1)) {
        if (chunk?.data?.page_info) {
            pageInfo = chunk.data.page_info;
            break;
        }
        // Sometimes nested under a path-keyed label
        if (chunk?.data && typeof chunk.data === 'object') {
            const nested = Object.values(chunk.data).find(v => v?.page_info);
            if (nested) { pageInfo = nested.page_info; break; }
        }
    }

    return { edges, pageInfo };
}

/**
 * Sequentially enriches a list of base FB listings with high-res images,
 * description, and condition by calling FETCH_SINGLE_FB_LISTING on the
 * content script running in the FB tab.
 *
 * @param {object[]} baseListings  Normalised listings from fetchAllFBListings
 * @param {number}   tabId         The Facebook tab hosting the content script
 * @param {object}   tokens        Stored FB credentials to pass as fallback
 * @param {number}   originTabId   The X-LIST UI tab to send progress updates to
 * @returns {object[]}             Listings with images/description/condition merged in
 */
async function enrichFBListings(baseListings, tabId, tokens, originTabId) {
    for (let i = 0; i < baseListings.length; i++) {
        const listing = baseListings[i];

        sendProgressToTab(originTabId, {
            phase: 'enriching',
            current: i + 1,
            total: baseListings.length,
            message: `Fetching high-res photos ${i + 1}/${baseListings.length}...`,
        });

        try {
            const result = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tabId, {
                    action: 'FETCH_SINGLE_FB_LISTING',
                    listingId: listing.id,
                    tokens,
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn(`Background: enrichFBListings relay error for ${listing.id}:`, chrome.runtime.lastError.message);
                        resolve(null);
                    } else {
                        resolve(response);
                    }
                });
            });

            if (result?.success) {
                if (result.description)          listing.description = result.description;
                if (result.condition)            listing.condition   = result.condition;
                if (result.imageUrls?.length)    listing.images      = result.imageUrls;
                console.log(
                    `Background: enriched [${i + 1}/${baseListings.length}] "${listing.title}" — ` +
                    `${result.imageUrls?.length ?? 0} images, desc: ${!!result.description}, condition: ${result.condition || 'none'}`
                );
            } else {
                console.warn(`Background: enrichFBListings failed for listing ${listing.id}:`, result?.error);
            }
        } catch (e) {
            console.error(`Background: enrichFBListings exception for listing ${listing.id}:`, e.message);
        }

        // Randomised delay between requests to avoid rate-limiting (skip after last)
        if (i < baseListings.length - 1) {
            const delay = 1500 + Math.random() * 1500; // 1500–3000 ms
            console.log(`Background: enrichFBListings waiting ${Math.round(delay)}ms…`);
            await sleep(delay);
        }
    }

    return baseListings;
}

/**
 * Delegates the paginated Marketplace fetch to the facebook-scraper content script
 * running inside an open Facebook tab.
 *
 * Fetching from the service worker triggers error 1357004 because FB detects the
 * request didn't originate from a real browser window. Running inside the tab means
 * credentials:'include' attaches all cookies natively and sec-fetch headers are
 * set correctly by the browser.
 */
async function handleFacebookSync(sendResponse, originTabId) {
    console.log('Background: Starting Facebook Marketplace sync (tab-relay mode)...');

    try {
        const creds = await chrome.storage.local.get([
            'fb_dtsg', 'fb_lsd', 'fb_user_id', 'fb_rev', 'fb_hs', 'fb_dyn', 'fb_csr',
        ]);

        // Find any open Facebook tab to host the fetch
        const tabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
        if (tabs.length === 0) {
            sendResponse({
                success: false,
                error: 'No Facebook tab found. Please open facebook.com and try again.',
            });
            return;
        }

        const tabId = tabs[0].id;
        console.log(`Background: Relaying FB fetch to tab ${tabId} (${tabs[0].url?.slice(0, 60)})`);

        const tokens = {
            fb_dtsg: creds.fb_dtsg,
            lsd:     creds.fb_lsd,
            c_user:  creds.fb_user_id,
            fb_rev:  creds.fb_rev,
            fb_hs:   creds.fb_hs,
            fb_dyn:  creds.fb_dyn,
            fb_csr:  creds.fb_csr,
        };

        // Phase 1: paginated base fetch (title, price, cover image, id)
        sendProgressToTab(originTabId, {
            phase: 'fetching',
            current: 0,
            total: 0,
            message: 'Fetching your listings...',
        });

        const baseResult = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, { action: 'EXECUTE_FB_FETCH', tokens }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    resolve(response);
                }
            });
        });

        if (!baseResult?.success) {
            sendResponse(baseResult);
            return;
        }

        const baseListings = baseResult.products || [];
        console.log(`Background: Phase 1 complete — ${baseListings.length} listings fetched`);

        // Phase 2: enrich each listing with high-res images, description, condition
        sendProgressToTab(originTabId, {
            phase: 'enriching',
            current: 0,
            total: baseListings.length,
            message: `Found ${baseListings.length} listings. Fetching details...`,
        });

        const enrichedListings = await enrichFBListings(baseListings, tabId, tokens, originTabId);
        console.log(`Background: Phase 2 complete — enrichment done for ${enrichedListings.length} listings`);

        sendProgressToTab(originTabId, {
            phase: 'saving',
            current: enrichedListings.length,
            total: enrichedListings.length,
            message: 'Saving to database...',
        });

        sendResponse({ success: true, products: enrichedListings, count: enrichedListings.length });

    } catch (e) {
        console.error('Background: Facebook Sync Error:', e);
        sendResponse({ success: false, error: e.message });
    }
}


async function handleFacebookDelete(listingId, sendResponse) {
    console.log(`Background: Initiating FB delete for listing ${listingId}`);

    try {
        const creds = await chrome.storage.local.get([
            'fb_dtsg', 'fb_lsd', 'fb_user_id', 'fb_rev', 'fb_hs', 'fb_dyn', 'fb_csr',
        ]);

        const tabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
        if (tabs.length === 0) {
            sendResponse({
                success: false,
                error: 'No Facebook tab found. Please open facebook.com and try again.',
            });
            return;
        }

        const tabId = tabs[0].id;
        console.log(`Background: Relaying FB delete to tab ${tabId}`);

        chrome.tabs.sendMessage(tabId, {
            action: 'DELETE_SINGLE_FB_LISTING',
            listingId,
            tokens: {
                fb_dtsg: creds.fb_dtsg,
                lsd:     creds.fb_lsd,
                c_user:  creds.fb_user_id,
                fb_rev:  creds.fb_rev,
                fb_hs:   creds.fb_hs,
                fb_dyn:  creds.fb_dyn,
                fb_csr:  creds.fb_csr,
            },
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Background: FB delete relay error:', chrome.runtime.lastError.message);
                sendResponse({
                    success: false,
                    error: `Extension disconnected from Facebook tab: ${chrome.runtime.lastError.message}`,
                });
                return;
            }
            console.log(`Background: FB delete result for listing ${listingId}:`, response);
            sendResponse(response);
        });

    } catch (e) {
        console.error('Background: Facebook Delete Error:', e);
        sendResponse({ success: false, error: e.message });
    }
}


// --- 9. DEPOP CROSSLIST QUEUE ---
let depopCrosslistState = {
    queue: [],
    results: [],
    originTabId: null,
    currentDepopTabId: null
};

async function handleDepopCrosslist(listings, tabId) {
    console.log(`Background: Starting Depop crosslist for ${listings.length} listings`);
    depopCrosslistState = {
        queue: [...listings],
        results: [],
        originTabId: tabId,
        currentDepopTabId: null
    };
    processNextDepopListing(null, null); // Start first one
}

async function processNextDepopListing(lastSuccess, lastError) {
    // Record result of previous listing (if any)
    if (lastSuccess !== null) {
        depopCrosslistState.results.push({ success: lastSuccess, error: lastError });
    }

    // Close previous Depop tab
    if (depopCrosslistState.currentDepopTabId) {
        try {
            await chrome.tabs.remove(depopCrosslistState.currentDepopTabId);
        } catch (e) {
            console.warn('Background: Could not close Depop tab:', e.message);
        }
        depopCrosslistState.currentDepopTabId = null;
    }

    // Send progress to origin tab
    const completed = depopCrosslistState.results.length;
    const total = completed + depopCrosslistState.queue.length;

    if (depopCrosslistState.originTabId) {
        sendProgressToTab(depopCrosslistState.originTabId, {
            phase: 'crosslisting',
            current: completed,
            total: total,
            message: depopCrosslistState.queue.length > 0
                ? `Posted ${completed}/${total}. Processing next...`
                : `Done! Posted ${completed}/${total} listings.`
        });
    }

    // Check if queue is empty
    if (depopCrosslistState.queue.length === 0) {
        console.log('Background: Depop crosslist queue empty. All done!');
        // Notify the origin tab
        if (depopCrosslistState.originTabId) {
            try {
                chrome.tabs.sendMessage(depopCrosslistState.originTabId, {
                    type: 'CROSSLIST_DEPOP_DONE',
                    results: depopCrosslistState.results,
                    total: total,
                    successCount: depopCrosslistState.results.filter(r => r.success).length
                });
            } catch (e) {
                console.warn('Background: Could not notify origin tab:', e.message);
            }
        }
        // Clear storage
        chrome.storage.local.remove('depop_crosslist_current');
        return;
    }

    // Pop next listing
    const nextListing = depopCrosslistState.queue.shift();
    console.log(`Background: Processing listing: "${nextListing.title}" (${depopCrosslistState.queue.length} remaining)`);

    // Store current listing for the filler script to read
    await chrome.storage.local.set({ depop_crosslist_current: nextListing });

    // Open Depop create page
    const tab = await chrome.tabs.create({
        url: 'https://www.depop.com/products/create/',
        active: false // Keep in background
    });
    depopCrosslistState.currentDepopTabId = tab.id;

    // Safety timeout: if filler doesn't respond within 60s, skip this listing
    setTimeout(() => {
        if (depopCrosslistState.currentDepopTabId === tab.id) {
            console.warn(`Background: Listing "${nextListing.title}" timed out. Skipping.`);
            processNextDepopListing(false, 'Timed out');
        }
    }, 60000);
}