
console.log("Crosslisting App: Relay Script Loaded");

// ============================================================================
// 1. RELAY LISTENER (React Page -> Background)
// Listens for clicks from your Dashboard buttons (Depop, Grailed, etc.)
// ============================================================================
window.addEventListener("message", (event) => {
    // Security: Only accept messages from the same window
    if (event.source !== window) return;

    // DEBUG: Log specific actions we care about
    if (event.data && (event.data.action === "SYNC_DEPOP" || event.data.action === "SYNC_GRAILED" || event.data.action === "SYNC_FACEBOOK")) {
        console.log(`Content Script: Saw ${event.data.action}, relaying to Background...`);

        const originalAction = event.data.action;

        // Relay the message to the Background Service Worker
        chrome.runtime.sendMessage(event.data, (response) => {
            console.log("Content Script: Response from Background:", response);

            // Determine specific completion action
            let completionAction = "SYNC_COMPLETE"; // Fallback
            if (originalAction === "SYNC_DEPOP") completionAction = "SYNC_COMPLETE_DEPOP";
            if (originalAction === "SYNC_GRAILED") completionAction = "SYNC_COMPLETE_GRAILED";
            if (originalAction === "SYNC_FACEBOOK") completionAction = "SYNC_COMPLETE_FACEBOOK";

            // Send the data back to the React Page
            window.postMessage({
                action: completionAction,
                payload: response
            }, "*");
        });
    }

    // --- EBAY CROSSLIST RELAY ---
    if (event.data && event.data.action === 'CROSSLIST_TO_EBAY') {
        console.log('Content Script: Saw CROSSLIST_TO_EBAY, relaying to Background...');
        chrome.runtime.sendMessage(event.data, (response) => {
            console.log('Content Script: CROSSLIST_TO_EBAY response:', response);
            window.postMessage({
                action: 'CROSSLIST_TO_EBAY_STARTED',
                payload: response,
            }, '*');
        });
    }

    // --- FACEBOOK DELETE RELAY ---
    if (event.data && event.data.action === 'INITIATE_FB_DELETE') {
        console.log(`Content Script: Saw INITIATE_FB_DELETE for listing ${event.data.listingId}, relaying to Background...`);
        chrome.runtime.sendMessage(event.data, (response) => {
            console.log('Content Script: INITIATE_FB_DELETE response:', response);
            window.postMessage({
                action: 'DELETE_COMPLETE_FACEBOOK',
                payload: response
            }, '*');
        });
    }

    // --- CROSSLIST DEPOP RELAY ---
    if (event.data && event.data.action === 'CROSSLIST_DEPOP') {
        console.log('Content Script: Saw CROSSLIST_DEPOP, relaying to Background...');
        chrome.runtime.sendMessage(event.data, (response) => {
            console.log('Content Script: CROSSLIST_DEPOP acknowledged:', response);
        });
    }
});


// ============================================================================
// 2. EXECUTOR LISTENER (Background -> Page)
// Executes fetching logic when the Background Script commands it.
// This runs inside the tab of the platform (e.g., inside a Grailed.com tab)
// ============================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Content Script received command:", request.type);

    // --- PROGRESS RELAY ---
    if (request.type === 'GRAILED_SYNC_PROGRESS') {
        window.postMessage({
            action: 'GRAILED_SYNC_PROGRESS',
            progress: request.progress
        }, '*');
        return;
    }

    // --- CROSSLIST DEPOP PROGRESS RELAY ---
    if (request.type === 'CROSSLIST_DEPOP_PROGRESS') {
        window.postMessage({
            action: 'CROSSLIST_DEPOP_PROGRESS',
            progress: request.progress
        }, '*');
        return;
    }

    // --- EBAY PUBLISH SUCCESS RELAY ---
    if (request.type === 'EBAY_PUBLISH_SUCCESS') {
        window.postMessage({
            action: 'EBAY_PUBLISH_SUCCESS',
            itemId: request.itemId,
        }, '*');
        return;
    }

    // --- CROSSLIST DEPOP DONE RELAY ---
    if (request.type === 'CROSSLIST_DEPOP_DONE') {
        window.postMessage({
            action: 'CROSSLIST_DEPOP_DONE',
            results: request.results,
            total: request.total,
            successCount: request.successCount
        }, '*');
        return;
    }

    // --- DEPOP FETCH LOGIC ---
    if (request.type === 'EXECUTE_PAGE_FETCH') {
        // (If you have existing Depop fetch logic, it would go here. 
        //  Based on your previous success, your Depop fetch might be separate or 
        //  you can paste that logic here if it was missing from your snippet.)
        return true;
    }

    // --- GRAILED FETCH LOGIC ---
    if (request.type === 'EXECUTE_GRAILED_FETCH') {
        console.log("Grailed Bridge: Fetching listings via GraphQL...");

        // Define the Grailed GraphQL Query (Fetching your own listings)
        const query = `
            query MyListings {
                self {
                    listings(first: 50, sort: NEWEST) {
                        edges {
                            node {
                                id
                                title
                                description
                                price
                                size
                                photos {
                                    url
                                }
                                brand {
                                    name
                                }
                            }
                        }
                    }
                }
            }
        `;

        // Execute the Fetch
        fetch('https://www.grailed.com/api/graphql', {
            method: 'POST',
            headers: {
                'Authorization': request.token, // Token passed from Background
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        })
            .then(res => res.json())
            .then(result => {
                if (result.errors) {
                    throw new Error(result.errors[0].message);
                }

                // Extract the clean list of items
                const listings = result.data.self.listings.edges.map(edge => edge.node);
                console.log("Grailed Bridge: Found items:", listings);

                // Send data back to Background
                sendResponse({ success: true, products: listings, count: listings.length });
            })
            .catch(error => {
                console.error("Grailed Bridge Error:", error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // CRITICAL: Keeps the channel open for the async fetch to finish
    }
});