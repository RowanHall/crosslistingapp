// // extension/scripts/content.js
// console.log("Crosslisting App: Relay Script Loaded");

// window.addEventListener("message", (event) => {
//     // DEBUG: Log EVERY message this window receives to see if we catch the React one
//     // (You will see many system messages here, look for yours)
//     if (event.data && event.data.action) {
//         console.log("Content Script saw message:", event.data);
//     }

//     // 1. We removed 'if (event.source !== window)' because of Isolated World conflicts

//     // 2. Filter for your specific action
//     if (event.data && event.data.action === "SYNC_DEPOP") {
//         console.log("Content Script: Relay SYNC_DEPOP -> Background");

//         chrome.runtime.sendMessage({ action: "SYNC_DEPOP" }, (response) => {
//             console.log("Content Script: Response from Background:", response);
//             window.postMessage({
//                 action: "SYNC_COMPLETE",
//                 payload: response
//             }, "*");
//         });
//     }

// });

// extension/scripts/content.js
console.log("Crosslisting App: Relay Script Loaded");

// ============================================================================
// 1. RELAY LISTENER (React Page -> Background)
// Listens for clicks from your Dashboard buttons (Depop, Grailed, etc.)
// ============================================================================
window.addEventListener("message", (event) => {
    // Security: Only accept messages from the same window
    if (event.source !== window) return;

    // DEBUG: Log specific actions we care about
    if (event.data && (event.data.action === "SYNC_DEPOP" || event.data.action === "SYNC_GRAILED")) {
        console.log(`Content Script: Saw ${event.data.action}, relaying to Background...`);

        // Relay the message to the Background Service Worker
        chrome.runtime.sendMessage(event.data, (response) => {
            console.log("Content Script: Response from Background:", response);

            // Send the data back to the React Page
            window.postMessage({
                action: "SYNC_COMPLETE",
                payload: response
            }, "*");
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