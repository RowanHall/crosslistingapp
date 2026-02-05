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
        handleGrailedSync(sendResponse);
        return true; // Keep channel open
    }

    if (request.action === 'FETCH_GRAILED_DATA') {
        handleGrailedSync(sendResponse);
        return true; // Keep channel open
    }
});


// --- 5. HANDLERS ---

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

async function handleGrailedSync(sendResponse) {
    console.log("Background: Starting Grailed Sync (Direct Algolia)...");

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

        // 3. Perform Fetch directly from Background
        // Algolia URL format: https://${ApplicationID}-dsn.algolia.net/1/indexes/*/queries
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
        console.log(`Background: Fetched ${hits.length} items from Algolia.`);
        console.log("Background: Received Grailed Data:", hits);

        // 4. send response
        sendResponse({ success: true, products: hits, count: hits.length });

    } catch (e) {
        console.error("Grailed Sync Error:", e);
        sendResponse({ success: false, error: e.message });
    }
}