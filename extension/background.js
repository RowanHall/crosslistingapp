// extension/background.js
console.log("Background Service Worker loaded");

// 1. HEADER SNIFFER (Captures ID and saves to Storage)
chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        const idHeader = details.responseHeaders.find(h => h.name.toLowerCase() === 'x-user-id');
        if (idHeader && idHeader.value) {
            console.log("Background: Captured & Saved User ID:", idHeader.value);
            // SAVE TO STORAGE (Persists even if service worker sleeps)
            chrome.storage.local.set({ depop_user_id: idHeader.value });
        }
    },
    { urls: ["https://webapi.depop.com/*"] },
    ["responseHeaders"]
);

// 2. MESSAGE LISTENER
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Background: Received message:", request);

    if (request.action === 'SYNC_DEPOP' || request.type === 'SYNC_DEPOP') {
        handleDepopSync(sendResponse);
        return true; // Keep channel open for async response
    }
});

// 3. SYNC HANDLER
async function handleDepopSync(sendResponse) {
    console.log("Background: Starting Sync...");

    try {
        // A. GET USER ID FROM STORAGE
        const data = await chrome.storage.local.get('depop_user_id');
        const userId = data.depop_user_id;

        if (!userId) {
            console.warn("Background: User ID missing from storage.");
            sendResponse({ success: false, error: "User ID not found. Please refresh your Depop tab." });
            return;
        }

        // B. FIND DEPOP TAB
        const tabs = await chrome.tabs.query({ url: "*://*.depop.com/*" });
        if (tabs.length === 0) {
            sendResponse({ success: false, error: "Please open a Depop tab first." });
            return;
        }

        // C. EXECUTE
        console.log(`Background: Delegating to tab ${tabs[0].id} with UserID ${userId}`);
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
            type: 'EXECUTE_PAGE_FETCH',
            userId: userId
        });

        console.log("Background: Bridge Response:", response);
        sendResponse(response);

    } catch (e) {
        console.error("Background: Sync Error:", e);
        sendResponse({ success: false, error: e.message || "Unknown error in background" });
    }
}