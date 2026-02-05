// extension/background.js
console.log("Background Service Worker loaded");

// --- 1. DEPOP SNIFFER ---
// Captures User ID from response headers and saves to storage
chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        const idHeader = details.responseHeaders.find(h => h.name.toLowerCase() === 'x-user-id');
        if (idHeader && idHeader.value) {
            console.log("Background: Captured Depop User ID:", idHeader.value);
            // Save to storage immediately
            chrome.storage.local.set({ depop_user_id: idHeader.value });
        }
    },
    { urls: ["https://webapi.depop.com/*"] },
    ["responseHeaders"]
);

// --- 2. GRAILED SNIFFER (Cookie Strategy) ---
// Captures JWT from the "Cookie" header in requests
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        const cookieHeader = details.requestHeaders.find(h => h.name.toLowerCase() === 'cookie');

        if (cookieHeader && cookieHeader.value) {
            // Regex: Find "grailed_jwt=" followed by "eyJ" until a semicolon or end of string
            const matches = cookieHeader.value.match(/grailed_jwt=(eyJ[^;]+)/);

            if (matches && matches[1]) {
                const token = matches[1];
                const fullToken = `Bearer ${token}`;
                console.log("Background: Captured Grailed JWT from Cookie!");
                // Check if it's new before saving to avoid spamming storage
                chrome.storage.local.get('grailed_token', (data) => {
                    if (data.grailed_token !== fullToken) {

                        chrome.storage.local.set({ grailed_token: fullToken });
                    }
                });
            }
        }
    },
    { urls: ["https://*.grailed.com/*"] },
    ["requestHeaders", "extraHeaders"]
);

// --- 3. MESSAGE ROUTER ---
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
});

// --- 4. HANDLERS ---

async function handleDepopSync(sendResponse) {
    console.log("Background: Starting Depop Sync...");
    try {
        // FIX: Read from STORAGE, not global variable
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
        }, sendResponse);

    } catch (e) {
        console.error("Depop Sync Error:", e);
        sendResponse({ success: false, error: e.message });
    }
}

async function handleGrailedSync(sendResponse) {
    console.log("Background: Starting Grailed Sync...");
    try {
        // 1. Get Token from Storage
        const data = await chrome.storage.local.get('grailed_token');
        const token = data.grailed_token;

        if (!token) {
            sendResponse({ success: false, error: "Grailed Token missing. Please refresh Grailed." });
            return;
        }

        // 2. Find Grailed Tab
        const tabs = await chrome.tabs.query({ url: "*://*.grailed.com/*" });
        if (tabs.length === 0) {
            sendResponse({ success: false, error: "Please open a Grailed tab." });
            return;
        }

        // 3. Delegate to Content Script
        console.log("Background: Delegating to Grailed tab", tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, {
            type: 'EXECUTE_GRAILED_FETCH',
            token: token
        }, sendResponse);

    } catch (e) {
        console.error("Grailed Sync Error:", e);
        sendResponse({ success: false, error: e.message });
    }
}