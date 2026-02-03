// extension/scripts/poshmark-filler.js

(function () {
    console.log("Poshmark Filler Script Loaded");

    chrome.storage.local.get(['pending_listing'], async (result) => {
        const listing = result.pending_listing;
        if (!listing) {
            console.log("No pending listing found in storage.");
            return;
        }

        console.log("Found pending listing:", listing);

        // Clear storage so it doesn't run again unintentionally
        chrome.storage.local.remove('pending_listing');

        // Helper to dispatch React events
        const setReactValue = (element, value) => {
            if (!element) return;

            const valueSetter = Object.getOwnPropertyDescriptor(element, 'value').set;
            const prototype = Object.getPrototypeOf(element);
            const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;

            if (valueSetter && valueSetter !== prototypeValueSetter) {
                prototypeValueSetter.call(element, value);
            } else {
                valueSetter.call(element, value);
            }

            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('blur', { bubbles: true }));
        };

        // Wait a moment for React to hydrate/render
        // Ideally we use a mutation observer or a retry loop, but for now we'll try a small delay or immediate
        // The script is run at 'document_end', but React might take a sec.
        // Let's use a small polling mechanism to be safe.

        const waitForElement = (selector, timeout = 5000) => {
            return new Promise((resolve) => {
                if (document.querySelector(selector)) {
                    return resolve(document.querySelector(selector));
                }

                const observer = new MutationObserver((mutations) => {
                    if (document.querySelector(selector)) {
                        resolve(document.querySelector(selector));
                        observer.disconnect();
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });

                setTimeout(() => {
                    observer.disconnect();
                    resolve(null);
                }, timeout);
            });
        };

        try {
            // 1. Fill Title
            const titleInput = await waitForElement('[placeholder="Title"]'); // Adjust selector as needed based on Poshmark
            // User suggested [placeholder="Title"] or similar.
            // fallback selectors could be added.
            if (titleInput) {
                setReactValue(titleInput, listing.title);
                console.log("Filled Title");
            } else {
                console.warn("Title input not found");
            }

            // 2. Fill Description
            const descInput = await waitForElement('[data-testid="description-input"]');
            if (descInput) {
                setReactValue(descInput, listing.description);
                console.log("Filled Description");
            } else {
                console.warn("Description input not found");
            }

            // 3. Fill Price
            // "Original Price"
            const originalPriceInput = await waitForElement('[data-testid="original-price-input"]');
            if (originalPriceInput) {
                setReactValue(originalPriceInput, listing.price); // Assuming listing.price is a string or number fitting format
                console.log("Filled Original Price");
            }

            // "Listing Price" - often Poshmark requires both or just listing price. 
            // We'll set both to the same if we only have one price.
            const listingPriceInput = await waitForElement('[data-testid="listing-price-input"]');
            if (listingPriceInput) {
                setReactValue(listingPriceInput, listing.price);
                console.log("Filled Listing Price");
            }

            // 4. Image Handling
            if (listing.images && listing.images.length > 0) {
                console.log("Processing images...", listing.images);
                const dt = new DataTransfer();

                // Process images sequentially
                for (const imgUrl of listing.images) {
                    try {
                        const response = await fetch(imgUrl);
                        const blob = await response.blob();
                        const filename = imgUrl.split('/').pop().split('?')[0] || 'image.jpg';
                        const file = new File([blob], filename, { type: blob.type });
                        dt.items.add(file);
                    } catch (err) {
                        console.error("Error fetching image:", imgUrl, err);
                    }
                }

                const fileInput = await waitForElement('input[type="file"]');
                if (fileInput) {
                    fileInput.files = dt.files;
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log("Images uploaded");
                } else {
                    console.warn("File input not found");
                }
            }

        } catch (e) {
            console.error("Error in Poshmark filler:", e);
        }

    });
})();
