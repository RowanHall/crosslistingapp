// extension/scripts/facebook-scraper.js
// Runs on every facebook.com page at document_idle.
// Extracts fb_dtsg, lsd from inline JS and c_user from non-httpOnly cookie.

console.log("Facebook Scraper: Content script loaded");

function extractFacebookTokens() {
    let fb_dtsg = null;
    let lsd = null;
    let c_user = null;

    // Search all inline <script> tags for the embedded JSON data
    const scripts = document.querySelectorAll('script:not([src])');
    for (const script of scripts) {
        const text = script.textContent;
        if (!text) continue;

        if (!fb_dtsg) {
            const dtsgMatch = text.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/);
            if (dtsgMatch) fb_dtsg = dtsgMatch[1];
        }

        if (!lsd) {
            const lsdMatch = text.match(/"LSD",\[\],\{"token":"([^"]+)"\}/);
            if (lsdMatch) lsd = lsdMatch[1];
        }

        if (fb_dtsg && lsd) break;
    }

    // c_user is NOT httpOnly — accessible via document.cookie
    const cUserMatch = document.cookie.match(/c_user=(\d+)/);
    if (cUserMatch) c_user = cUserMatch[1];

    return { fb_dtsg, lsd, c_user };
}

// Extract on load and send to background
(function init() {
    const { fb_dtsg, lsd, c_user } = extractFacebookTokens();

    if (fb_dtsg || lsd || c_user) {
        const preview = (v) => v ? `${v.slice(0, 6)}…(${v.length})` : "missing";
        console.log("Facebook Scraper: Found tokens, saving to storage", {
            fb_dtsg: preview(fb_dtsg),
            lsd: preview(lsd),
            c_user: c_user || "missing"
        });
        chrome.runtime.sendMessage({
            action: 'SAVE_FACEBOOK_TOKENS',
            fb_dtsg,
            lsd,
            c_user
        });
    } else {
        console.log("Facebook Scraper: No tokens found on this page");
    }
})();

// Also listen for SYNC_FACEBOOK triggered by the React dashboard via postMessage
// (mirrors the SYNC_DEPOP pattern in content.js, relayed through this separate scraper
//  since the dashboard runs on localhost and cannot directly talk to facebook.com pages,
//  but the background script can bridge the two)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING_FACEBOOK_SCRAPER') {
        sendResponse({ alive: true });
    }
});
