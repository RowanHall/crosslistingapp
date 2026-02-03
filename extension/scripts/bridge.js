// Listen for the command from Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXECUTE_PAGE_FETCH') {
        console.log("Content Script: Received fetch command for User:", request.userId);

        performInPageFetch(request.userId).then(result => {
            sendResponse(result);
        });

        return true; // Keep channel open for async response
    }
});

async function performInPageFetch(userId) {
    try {
        const url = `https://webapi.depop.com/api/v3/shop/${userId}/products/?limit=24&force_fee_calculation=false`;

        // NOTICE: We do NOT need to set Auth tokens or Cookies manually.
        // The browser attaches them automatically because we are running ON depop.com.
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                // You usually don't even need to set content-type for GET
            }
        });

        if (!response.ok) {
            throw new Error(`Depop API Error: ${response.status}`);
        }

        const data = await response.json();
        console.log("Content Script: Fetched products:", data.products.length);

        // OPTIONAL: Send to your local DB from here, or return data to background
        // Sending to localhost from Content Script might trigger Mixed Content warnings (HTTPS -> HTTP)
        // So we will return the data to Background, and let Background save it.
        return { success: true, products: data.products, count: data.products.length };

    } catch (err) {
        console.error("In-Page Fetch Failed:", err);
        return { success: false, error: err.message };
    }
}

if (typeof module !== 'undefined') {
    module.exports = { performInPageFetch };
}