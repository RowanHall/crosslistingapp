// extension/sidepanel.js


// 1. Listen for messages from your React App (Localhost)
window.addEventListener('message', async (event) => {
    // Security: Only accept messages from your app
    if (event.origin !== 'http://localhost:3000') return;

    const { action, payload } = event.data;

    // --- CASE A: IMPORT/SYNC BUTTON CLICKED ---
    if (action === 'SYNC_DEPOP') {
        console.log("Sidepanel: Received Import Request. Contacting Background...");

        // Forward the command to background.js
        chrome.runtime.sendMessage({ type: 'SYNC_DEPOP' }, (response) => {
            console.log("Sidepanel: Got Data from Background. Sending to React...");

            // Send the data BACK to your React App
            const iframe = document.getElementById('app-frame');
            if (iframe && response) {
                iframe.contentWindow.postMessage({
                    action: 'SYNC_COMPLETE',
                    payload: response
                }, 'http://localhost:3000');
            }
        });
    }

    // --- CASE B: SCRAPER (Keep your existing logic if needed) ---
    if (action === 'EXECUTE_SCRAPER') {
        // ... (Your existing scraper code) ...
        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab) {
                console.error('No active tab found');
                return;
            }

            // Execute the scraper script in the active tab context
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['scripts/depop-scraper.js'] // We'll assume we copy this or reference it correctly
            });

            // Send the result back to the iframe
            const scraperResult = results[0]?.result;
            const iframe = document.getElementById('app-frame');
            iframe.contentWindow.postMessage({
                action: 'SCRAPE_RESULT',
                payload: scraperResult
            }, 'http://localhost:3000');

        } catch (error) {
            console.error('Script execution failed:', error);
            // Optional: Send error back to UI
        }
    }
});
