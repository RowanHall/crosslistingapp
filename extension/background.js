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


// --- 2. GRAILED SNIFFER (Cookie Strategy) ---
// Captures JWT from Cookie AND extracts User ID
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        const cookieHeader = details.requestHeaders.find(h => h.name.toLowerCase() === 'cookie');

        if (cookieHeader && cookieHeader.value) {
            // Regex: Find "grailed_jwt=" followed by "eyJ" until a semicolon or end of string
            const matches = cookieHeader.value.match(/grailed_jwt=(eyJ[^;]+)/);

            if (matches && matches[1]) {
                const token = matches[1];
                const fullToken = `Bearer ${token}`;

                // Check if it's new before processing
                console.log("Background: Found Grailed Token, might be new");
                chrome.storage.local.get(['grailed_token'], (data) => {
                    if (data.grailed_token !== fullToken) {
                        console.log("Background: New Grailed Token detected!");

                        // Decode JWT to get User ID
                        const payload = parseJwt(token);
                        if (payload && (payload.sub || payload.id || payload.user_id)) {
                            // Grailed usually uses 'sub' or 'id' for the user identifier
                            const userId = payload.sub || payload.id || payload.user_id;
                            console.log(`Background: Extracted Grailed User ID: ${userId}`);

                            chrome.storage.local.set({
                                grailed_token: fullToken,
                                grailed_user_id: userId
                            });
                        } else {
                            console.warn("Background: Could not extract User ID from Grailed JWT");
                            // Still save the token just in case
                            chrome.storage.local.set({ grailed_token: fullToken });
                        }
                    }
                });
            }
        }
    },
    { urls: ["https://*.grailed.com/*"] },
    ["requestHeaders", "extraHeaders"]
);


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


// --- 4. MESSAGE ROUTER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Background: Received action:", request.action);

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


// --- 5. PHOTO ENRICHMENT ---

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


// --- 6. HANDLERS ---

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