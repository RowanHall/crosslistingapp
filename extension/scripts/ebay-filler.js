// extension/scripts/ebay-filler.js
// Three-phase eBay crosslist automation:
//   Phase 1a (/sl/prelist/suggest)  — clicks the Search button (title already pre-filled)
//   Phase 1b (/sl/prelist/identify) — skips product match, picks condition, continues to /lstng
//   Phase 2  (/lstng)               — fills draft via PUT API, clicks "List it", auto-closes tab
//
// eBay new listing editor API (/lstng):
//   PUT  /lstng/api/listing_draft/{draftId}?mode=AddItem
//   Body: { requestId: uuid, removedFields: [], [field]: value, requestMeta: { lastDeltaTimestamp: Date.now() } }
//   Price field: string e.g. "49.99"

(function () {
    console.log('eBay Filler: Script loaded on', window.location.href);

    const pathname = window.location.pathname;

    // =========================================================================
    // HELPERS
    // =========================================================================

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function getUrlParam(name) {
        return new URLSearchParams(window.location.search).get(name) || null;
    }

    /**
     * Polls fn() every POLL_MS up to MAX_WAIT_MS.
     * Resolves with the truthy value returned by fn(), or null on timeout.
     */
    function pollFor(fn, { maxMs = 15_000, pollMs = 100 } = {}) {
        return new Promise((resolve) => {
            let elapsed = 0;
            const id = setInterval(() => {
                elapsed += pollMs;
                const result = fn();
                if (result) {
                    clearInterval(id);
                    resolve(result);
                } else if (elapsed >= maxMs) {
                    clearInterval(id);
                    resolve(null);
                }
            }, pollMs);
        });
    }

    // =========================================================================
    // PHASE 1a — SEARCH SUBMITTER
    // /sl/prelist/suggest: title is already pre-filled by the ?title= param.
    // Just click the Search button (class: keyword-suggestion__button).
    // eBay redirects to /sl/prelist/identify after the search.
    // =========================================================================

    if (pathname.includes('/sl/prelist/suggest')) {
        console.log('eBay Filler [Phase 1a]: Search submitter active.');

        chrome.storage.local.get(['ebay_crosslist_payload'], async (result) => {
            if (!result.ebay_crosslist_payload) {
                console.log('eBay Filler [Phase 1a]: No pending payload — exiting.');
                return;
            }

            console.log('eBay Filler [Phase 1a]: Payload found. Looking for Search button...');

            // The Search button is rendered synchronously — poll briefly just in case
            // React hydrates slightly after document_end.
            const searchBtn = await pollFor(
                () => document.querySelector('button.keyword-suggestion__button, button[aria-label="Search"]'),
                { maxMs: 5_000, pollMs: 100 }
            );

            if (!searchBtn) {
                console.warn('eBay Filler [Phase 1a]: Could not find Search button after 5s.');
                return;
            }

            console.log('eBay Filler [Phase 1a]: Clicking Search button.');
            searchBtn.click();
        });

        return; // Phase 1b handles the next page
    }

    // =========================================================================
    // PHASE 1b — PRODUCT IDENTIFIER / CATEGORY CONFIRMER
    // /sl/prelist/identify: eBay shows product matches.
    // Click the first product match button (class: product-button) so eBay
    // pre-fills item specifics, or fall back to "Continue without match".
    // =========================================================================

    if (pathname.includes('/sl/prelist/identify')) {
        console.log('eBay Filler [Phase 1b]: Product identifier active.');

        chrome.storage.local.get(['ebay_crosslist_payload'], async (result) => {
            if (!result.ebay_crosslist_payload) {
                console.log('eBay Filler [Phase 1b]: No pending payload — exiting.');
                return;
            }

            // This is a React SPA — all view transitions (product list → condition picker)
            // happen via pushState without a page reload. The content script only fires once,
            // so we must handle the full sequence here in one async chain.

            // --- Step 1: If we're on the product list view, click "Continue without match".
            // We deliberately skip product-button clicks: selecting a product sends eBay to
            // /lstng (a different editor our PUT API cannot target). "Continue without match"
            // goes to /sl/list/v2 where our API works — but it still goes through the
            // condition picker first (view=cgtype).
            const view = new URLSearchParams(window.location.search).get('view');

            if (!view || view === 'cgconfirmation') {
                // We may be on the product list or confirmation dialog.
                // In both cases, wait for prelist-radix__next-action and click it.
                const continueBtn = await pollFor(
                    () => document.querySelector('button.prelist-radix__next-action'),
                    { maxMs: 10_000, pollMs: 100 }
                );

                if (!continueBtn) {
                    console.warn('eBay Filler [Phase 1b]: Could not find "Continue without match" — aborting.');
                    return;
                }

                console.log('eBay Filler [Phase 1b]: Clicking "Continue without match".');
                continueBtn.click();
            }

            // --- Step 2: Wait for the condition picker (view=cgtype) to render.
            // After clicking Continue without match, eBay pushes view=cgtype onto the URL.
            // condition-button elements appear; we pick a sensible default.
            console.log('eBay Filler [Phase 1b]: Waiting for condition picker...');

            const firstConditionBtn = await pollFor(
                () => document.querySelector('button.condition-button'),
                { maxMs: 10_000, pollMs: 100 }
            );

            if (!firstConditionBtn) {
                console.warn('eBay Filler [Phase 1b]: Condition picker did not appear — aborting.');
                return;
            }

            // Default to "Pre-owned - Good". Fall back to first available condition.
            const preferredCondition = [...document.querySelectorAll('button.condition-button')].find(
                b => b.textContent.trim().startsWith('Pre-owned - Good')
            ) || firstConditionBtn;

            console.log('eBay Filler [Phase 1b]: Selecting condition:', preferredCondition.textContent.trim().slice(0, 40));
            preferredCondition.click();

            // --- Step 3: Click the condition Continue button.
            const conditionCta = await pollFor(
                () => document.querySelector('button.prelist-radix__condition-grading-cta'),
                { maxMs: 5_000, pollMs: 100 }
            );

            if (!conditionCta) {
                console.warn('eBay Filler [Phase 1b]: Condition Continue button not found — aborting.');
                return;
            }

            console.log('eBay Filler [Phase 1b]: Clicking condition Continue.');
            conditionCta.click();

            // eBay will now navigate to /lstng — Phase 2 takes over there.
            console.log('eBay Filler [Phase 1b]: Complete. Waiting for /lstng redirect...');
        });

        return; // Phase 2 handles /lstng
    }

    // =========================================================================
    // PHASE 2 — DRAFT API EXECUTOR + AUTO-PUBLISH
    // Runs on /lstng after eBay redirects from the condition picker.
    // Uses PUT /lstng/api/listing_draft/{draftId}?mode=AddItem, then clicks
    // the "List it" button and waits for the success redirect.
    // =========================================================================

    if (!pathname.includes('/lstng')) {
        console.log('eBay Filler: Unexpected path — exiting.');
        return;
    }

    console.log('eBay Filler [Phase 2]: Draft executor active on /lstng.');

    chrome.storage.local.get(['ebay_crosslist_payload'], async (result) => {
        const payload = result.ebay_crosslist_payload;
        if (!payload) {
            console.log('eBay Filler [Phase 2]: No pending payload in storage — exiting.');
            return;
        }

        console.log('eBay Filler [Phase 2]: Found payload for:', payload.title);

        // --- 1. Extract draft context from URL (/lstng?draftId=...&mode=...) -
        const draftId = getUrlParam('draftId');
        const mode    = getUrlParam('mode') || 'AddItem';

        if (!draftId) {
            console.error('eBay Filler [Phase 2]: Missing draftId in URL.', window.location.search);
            chrome.runtime.sendMessage({ action: 'EBAY_FILL_COMPLETE', success: false, error: 'Missing draftId in URL' });
            return;
        }

        console.log(`eBay Filler [Phase 2]: draftId=${draftId}, mode=${mode}`);

        // --- 2. eBay Picture Services (EPS) uploader -------------------------

        async function uploadToEbayEPS(imageUrl) {
            let blob;
            try {
                const imgResp = await fetch(imageUrl);
                if (!imgResp.ok) {
                    console.warn(`eBay Filler [EPS]: Failed to download image (HTTP ${imgResp.status}): ${imageUrl}`);
                    return null;
                }
                blob = await imgResp.blob();
            } catch (err) {
                console.warn(`eBay Filler [EPS]: Network error downloading image: ${imageUrl}`, err.message);
                return null;
            }

            const formData = new FormData();
            formData.append('file', blob, 'image.jpg');

            let responseText;
            try {
                const uploadResp = await fetch('https://mach-100.ebay.com/ws/eBayISAPI.dll?EpsBasic', {
                    method: 'POST',
                    credentials: 'include',
                    body: formData,
                });
                responseText = await uploadResp.text();
            } catch (err) {
                console.warn(`eBay Filler [EPS]: Upload request failed for ${imageUrl}:`, err.message);
                return null;
            }

            const match = responseText.match(/(https:\/\/i\.ebayimg\.com\/[^<"'\s]+)/i);
            if (match && match[1]) {
                console.log(`eBay Filler [EPS]: Uploaded → ${match[1]}`);
                return match[1];
            }

            console.warn(`eBay Filler [EPS]: Could not extract i.ebayimg.com URL. Raw:\n${responseText.slice(0, 300)}`);
            return null;
        }

        // --- 3. Draft update helper (new /lstng API format) ------------------
        // Body: { requestId, removedFields: [], [field]: value, requestMeta: { lastDeltaTimestamp } }
        // Price must be a string: "49.99"

        async function updateEbayDraft(fieldName, fieldValue) {
            const url = `/lstng/api/listing_draft/${draftId}?mode=${mode}`;
            const body = {
                requestId: crypto.randomUUID(),
                removedFields: [],
                [fieldName]: fieldValue,
                requestMeta: { lastDeltaTimestamp: Date.now() },
            };

            console.log(`eBay Filler [Phase 2]: PUT ${fieldName} →`, url);

            const resp = await fetch(url, {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'content-type': 'application/json',
                    'x-requested-with': 'XMLHttpRequest',
                },
                body: JSON.stringify(body),
            });

            if (!resp.ok) {
                const text = await resp.text().catch(() => '');
                throw new Error(`PUT ${fieldName} failed: HTTP ${resp.status} — ${text.slice(0, 200)}`);
            }

            const json = await resp.json().catch(() => ({}));
            console.log(`eBay Filler [Phase 2]: ${fieldName} response:`, JSON.stringify(json).slice(0, 200));
            return json;
        }

        // --- 4. Sequential field updates ------------------------------------
        // Each wrapped in its own try/catch so one failure doesn't stop the rest.

        // TITLE
        if (payload.title) {
            try {
                await updateEbayDraft('title', payload.title);
                await sleep(300);
            } catch (err) {
                console.error('eBay Filler [Phase 2]: title update failed:', err.message);
            }
        }

        // DESCRIPTION
        if (payload.description != null && payload.description !== '') {
            try {
                await updateEbayDraft('description', payload.description);
                await sleep(300);
            } catch (err) {
                console.error('eBay Filler [Phase 2]: description update failed:', err.message);
            }
        }

        // PRICE — must be a string e.g. "49.99"
        const numericPrice = payload.price != null ? Number(payload.price) : 0;
        if (!isNaN(numericPrice) && numericPrice > 0) {
            try {
                await updateEbayDraft('price', String(numericPrice.toFixed(2)));
                await sleep(300);
            } catch (err) {
                console.error('eBay Filler [Phase 2]: price update failed:', err.message);
            }
        }

        // PHOTOS — upload each image to EPS first to get i.ebayimg.com URLs
        const rawImages = Array.isArray(payload.images) ? payload.images : [];
        if (rawImages.length > 0) {
            try {
                console.log(`eBay Filler [Phase 2]: Uploading ${rawImages.length} image(s) to EPS...`);
                const ebayImageUrls = (
                    await Promise.all(rawImages.map((url) => uploadToEbayEPS(url)))
                ).filter((url) => url !== null);

                if (ebayImageUrls.length === 0) {
                    console.warn('eBay Filler [Phase 2]: All EPS uploads failed — skipping pictures update');
                } else {
                    console.log(`eBay Filler [Phase 2]: ${ebayImageUrls.length}/${rawImages.length} images uploaded`);
                    await updateEbayDraft('pictures', ebayImageUrls);
                    await sleep(300);
                }
            } catch (err) {
                console.error('eBay Filler [Phase 2]: pictures update failed:', err.message);
            }
        }

        // --- 5. PUBLISH — click "List it" and watch for the success redirect --
        // After clicking "List it", eBay either shows a confirmation or redirects
        // to /itm/{itemId}. We intercept the XHR publish response to get itemId.
        console.log('eBay Filler [Phase 2]: All fields updated. Waiting for page to settle...');
        await sleep(1000);

        // Set up publish response interceptor BEFORE clicking the button
        let publishItemId = null;
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        const origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._ebay_url = url;
            this._ebay_method = method;
            return origOpen.call(this, method, url, ...args);
        };

        XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
            if (!this._ebay_headers) this._ebay_headers = {};
            this._ebay_headers[header] = value;
            return origSetRequestHeader.call(this, header, value);
        };

        XMLHttpRequest.prototype.send = function(body) {
            const url = this._ebay_url || '';
            const method = (this._ebay_method || '').toUpperCase();
            if (method === 'POST' && url.includes('/lstng/api/listing_draft/') && url.includes('/publish')) {
                console.log('eBay Filler [Phase 2]: Intercepted publish POST:', url);
                this.addEventListener('load', () => {
                    try {
                        const data = JSON.parse(this.responseText);
                        publishItemId = data.itemId ?? data.item_id ?? data.id ?? null;
                        console.log('eBay Filler [Phase 2]: Publish XHR response, itemId=', publishItemId);
                    } catch (e) {
                        console.warn('eBay Filler [Phase 2]: Could not parse publish response:', this.responseText?.slice(0, 300));
                    }
                });
            }
            return origSend.call(this, body);
        };

        // Also intercept fetch for publish
        const origFetch = window.fetch;
        window.fetch = async function(input, init) {
            const url = typeof input === 'string' ? input : input?.url || '';
            const method = (init?.method || 'GET').toUpperCase();
            const resp = await origFetch.call(this, input, init);

            if (method === 'POST' && url.includes('/lstng/api/listing_draft/') && url.includes('/publish')) {
                console.log('eBay Filler [Phase 2]: Intercepted publish fetch:', url);
                const cloned = resp.clone();
                cloned.json().then(data => {
                    publishItemId = data.itemId ?? data.item_id ?? data.id ?? null;
                    console.log('eBay Filler [Phase 2]: Publish fetch response, itemId=', publishItemId);
                }).catch(() => {});
            }
            return resp;
        };

        // Poll for and click the "List it" / "Publish" button
        const listItBtn = await pollFor(
            () => {
                // Try multiple selectors for the publish button
                return (
                    document.querySelector('button.btn--primary[data-test-id="publishButton"]') ||
                    [...document.querySelectorAll('button.btn--primary, button.btn--large')].find(
                        b => /list it|publish|submit listing/i.test(b.textContent)
                    ) ||
                    null
                );
            },
            { maxMs: 15_000, pollMs: 200 }
        );

        if (!listItBtn) {
            console.warn('eBay Filler [Phase 2]: Could not find "List it" button after 15s — leaving tab open.');
            await chrome.storage.local.remove('ebay_crosslist_payload');
            chrome.runtime.sendMessage({ action: 'EBAY_FILL_COMPLETE', success: false, error: 'Could not find publish button' });
            return;
        }

        console.log('eBay Filler [Phase 2]: Clicking "List it" button:', listItBtn.textContent.trim());
        listItBtn.click();

        // Wait for publish to complete — either we got an itemId from the interceptor,
        // or the page navigates to /itm/{itemId}
        const maxWait = 30_000;
        const pollInterval = 500;
        let waited = 0;
        let finalItemId = null;

        while (waited < maxWait) {
            await sleep(pollInterval);
            waited += pollInterval;

            // Check interceptor result
            if (publishItemId) {
                finalItemId = publishItemId;
                break;
            }

            // Check if page navigated to /itm/{itemId}
            const currentPath = window.location.pathname;
            const itemMatch = currentPath.match(/\/itm\/(\d+)/);
            if (itemMatch) {
                finalItemId = itemMatch[1];
                console.log('eBay Filler [Phase 2]: Detected /itm/ redirect, itemId=', finalItemId);
                break;
            }

            // Check for a success heading on the page
            const successEl = document.querySelector('[data-test-id="LISTING_CONFIRMATION"], .listing-confirmation');
            if (successEl) {
                console.log('eBay Filler [Phase 2]: Detected success element on page.');
                // Try to find itemId in the page
                const idMatch = document.body.innerHTML.match(/"itemId"\s*:\s*"?(\d+)"?/);
                if (idMatch) finalItemId = idMatch[1];
                break;
            }
        }

        // Restore originals
        XMLHttpRequest.prototype.open = origOpen;
        XMLHttpRequest.prototype.send = origSend;
        XMLHttpRequest.prototype.setRequestHeader = origSetRequestHeader;
        window.fetch = origFetch;

        // Clean up storage
        await chrome.storage.local.remove('ebay_crosslist_payload');

        if (finalItemId || waited < maxWait) {
            console.log(`eBay Filler [Phase 2]: Published! itemId=${finalItemId}`);
            chrome.runtime.sendMessage({ action: 'EBAY_PUBLISH_SUCCESS', itemId: finalItemId, draftId });
        } else {
            console.warn('eBay Filler [Phase 2]: Publish timed out — no itemId detected.');
            chrome.runtime.sendMessage({ action: 'EBAY_FILL_COMPLETE', success: false, error: 'Publish timed out', draftId });
        }
    });
})();
