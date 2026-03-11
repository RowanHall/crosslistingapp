// extension/background.js
console.log("Background Service Worker loaded [Triple Sniff Edition]");

// --- 0. HELPERS ---

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
        chrome.storage.local.set({
            fb_dtsg: request.fb_dtsg,
            fb_lsd: request.lsd,
            fb_user_id: request.c_user
        }, () => {
            const preview = (v) => v ? `${v.slice(0, 6)}…(${v.length})` : "missing";
            console.log("Background: Saved Facebook tokens", {
                fb_dtsg: preview(request.fb_dtsg),
                fb_lsd: preview(request.lsd),
                fb_user_id: request.c_user || "missing"
            });

            // Now POST the tokens to the Next.js backend (matching Depop/Grailed pattern)
            chrome.storage.local.get(['fb_session_cookies'], async (data) => {
                const payload = {
                    fb_dtsg: request.fb_dtsg,
                    lsd: request.lsd,
                    cookies: data.fb_session_cookies || null,
                    user_id: request.c_user || null
                };
                console.log("Background: Sending Facebook tokens to backend...", {
                    fb_dtsg: preview(request.fb_dtsg),
                    lsd: preview(request.lsd),
                    cookies: data.fb_session_cookies ? `present (${data.fb_session_cookies.length} chars)` : "missing",
                    user_id: request.c_user || "missing"
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
        chrome.storage.local.get(['fb_dtsg', 'fb_lsd', 'fb_user_id', 'fb_session_cookies'], (data) => {
            const preview = (v) => v ? `${v.slice(0, 6)}…(${v.length})` : "missing";
            console.log("Background: SYNC_FACEBOOK — returning credentials", {
                fb_dtsg: preview(data.fb_dtsg),
                fb_lsd: preview(data.fb_lsd),
                fb_user_id: data.fb_user_id || "missing",
                fb_session_cookies: data.fb_session_cookies ? `present (${data.fb_session_cookies.length} chars)` : "missing"
            });
            sendResponse({ success: true, credentials: data });
        });
        return true; // Keep channel open for async storage.get
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

// --- 8. DEPOP CROSSLIST QUEUE ---
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