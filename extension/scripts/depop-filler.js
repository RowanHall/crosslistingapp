// extension/scripts/depop-filler.js
// Content script injected on depop.com/products/create/*
// Reads listing data from chrome.storage, fills the form, and submits.
//
// ═══════════════════════════════════════════════════════════════
// Depop Form Selectors (verified via live inspection):
//   Description: textarea#description
//   Category:    input#group-input (combobox) → #group-menu → #group-item-N
//   Brand:       input#brand-input (combobox) → #brand-menu
//   Condition:   input#condition-input (combobox) → #condition-menu
//   Size:        button#variants-toggle-button → #variants-menu → #variants-item-N
//   Price:       input#priceAmount__input
//   Post:        button containing "Post listing" or "Post"
// ═══════════════════════════════════════════════════════════════

(function () {
    console.log("Depop Filler: Script loaded on", window.location.href);

    // Override Page Visibility API (prevents background tab throttling)
    Object.defineProperty(document, 'hidden', { value: false, writable: false });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: false });
    document.dispatchEvent(new Event('visibilitychange'));

    chrome.storage.local.get(['depop_crosslist_current'], async (result) => {
        const listing = result.depop_crosslist_current;
        if (!listing) {
            console.log("Depop Filler: No pending listing found in storage.");
            return;
        }

        console.log("Depop Filler: === Starting fill for:", listing.title, "===");

        // ═══════════════════════════════════════════
        // HELPERS
        // ═══════════════════════════════════════════

        const sleep = (ms) => new Promise(r =>
            setTimeout(r, ms + Math.floor(Math.random() * 200))
        );

        const waitForElement = (selector, timeout = 10000) => {
            return new Promise((resolve) => {
                const existing = document.querySelector(selector);
                if (existing) return resolve(existing);

                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el) {
                        observer.disconnect();
                        resolve(el);
                    }
                });

                if (document.body) {
                    observer.observe(document.body, { childList: true, subtree: true });
                }

                setTimeout(() => {
                    observer.disconnect();
                    resolve(null);
                }, timeout);
            });
        };

        const ensureInteractable = (element) => {
            if (!element) return false;
            element.scrollIntoView({ behavior: 'instant', block: 'center' });
            const rect = element.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0;
            const isDisabled = element.disabled || element.getAttribute('aria-disabled') === 'true';
            return isVisible && !isDisabled;
        };

        const setNativeValue = (element, value) => {
            if (!element) return;
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            )?.set;
            const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype, 'value'
            )?.set;

            const setter = element.tagName === 'TEXTAREA'
                ? nativeTextAreaValueSetter
                : nativeInputValueSetter;

            if (setter) {
                setter.call(element, value);
            } else {
                element.value = value;
            }
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        };

        /**
         * Fill a combobox by ID. Types char-by-char, waits for menu, clicks first match.
         */
        const fillCombobox = async (inputId, menuId, searchTerm) => {
            if (!searchTerm) return false;

            const input = document.getElementById(inputId);
            if (!input) {
                console.warn(`Depop Filler: [STEP] Combobox #${inputId} NOT FOUND`);
                return false;
            }

            if (!ensureInteractable(input)) return false;

            console.log(`Depop Filler: [STEP] Filling combobox #${inputId} with "${searchTerm}"`);

            input.focus();
            input.click();
            await sleep(300);
            setNativeValue(input, '');
            await sleep(200);

            // Type char-by-char
            for (const char of searchTerm) {
                const currentVal = input.value + char;
                setNativeValue(input, currentVal);
                input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
                await sleep(40 + Math.floor(Math.random() * 60));
            }

            // Wait for dropdown
            const menu = await waitForElement(`#${menuId}`, 3000);
            if (!menu) await sleep(1500);

            const menuEl = document.getElementById(menuId);
            if (menuEl) {
                const itemPrefix = menuId.replace('-menu', '-item-');
                const options = menuEl.querySelectorAll(`[role="option"], [id^="${itemPrefix}"]`);
                console.log(`Depop Filler: [STEP] Menu #${menuId} has ${options.length} option(s)`);
                if (options.length > 0) {
                    console.log(`Depop Filler: [STEP] Clicking: "${options[0].textContent?.trim()}"`);
                    options[0].click();
                    await sleep(300);
                    return true;
                }
            } else {
                console.warn(`Depop Filler: [STEP] Menu #${menuId} never appeared`);
            }

            input.blur();
            return false;
        };

        // ═══════════════════════════════════════════
        // BRAND ALIAS MAP
        // Some brands are stored differently in our DB vs Depop's brand database.
        // Map common mismatches so the combobox search finds results.
        // ═══════════════════════════════════════════
        const brandAliases = {
            'bape': 'A Bathing Ape',
            'a bathing ape': 'A Bathing Ape',
            'cdg': 'Comme des Garcons',
            'comme des garçons': 'Comme des Garcons',
            'rl': 'Ralph Lauren',
            'polo': 'Polo Ralph Lauren',
            'tnf': 'The North Face',
            'north face': 'The North Face',
            'lv': 'Louis Vuitton',
            'nigo': 'Human Made',
        };

        // ═══════════════════════════════════════════
        // MAIN FILL LOGIC
        // ═══════════════════════════════════════════

        const errors = [];
        const steps = [];

        const log = (step, detail) => {
            const ts = new Date().toISOString().split('T')[1];
            const entry = `[${steps.length + 1}] ${ts} ${step}: ${detail}`;
            steps.push(entry);
            console.log(`Depop Filler: ${entry}`);
        };

        try {
            log('INIT', 'Waiting for form to render...');
            log('INIT', `document.hidden=${document.hidden}, visibilityState=${document.visibilityState}`);
            await sleep(3000);

            if (window.location.href.includes('/login') || window.location.href.includes('/signup')) {
                throw new Error('Redirected to login page');
            }
            log('INIT', `URL OK: ${window.location.href}`);

            let descriptionEl = await waitForElement('#description', 10000);
            if (!descriptionEl) descriptionEl = document.querySelector('textarea');
            if (!descriptionEl) throw new Error('No description textarea found after 13s');
            log('INIT', 'Form rendered');

            await sleep(400);

            // ── 1. DESCRIPTION ──
            if (!ensureInteractable(descriptionEl)) throw new Error('Description not interactable');
            const fullDesc = listing.description || listing.title || '';
            setNativeValue(descriptionEl, fullDesc);
            log('DESCRIPTION', `✓ Filled (${fullDesc.length} chars)`);

            await sleep(600);

            // ── 2. PRICE ──
            let priceInput = document.getElementById('priceAmount__input')
                || document.querySelector('[data-testid="priceAmount__input"]');

            if (priceInput && listing.price && ensureInteractable(priceInput)) {
                priceInput.focus();
                setNativeValue(priceInput, '');
                await sleep(200);
                setNativeValue(priceInput, String(listing.price));
                priceInput.blur();
                log('PRICE', `✓ ${listing.price}`);
            } else {
                log('PRICE', '✗ Not found or not interactable');
                errors.push('Price not set');
            }

            await sleep(600);

            // ── 3. CATEGORY ──
            log('CATEGORY', 'Looking for suggested pills...');
            await sleep(1500);

            let categorySet = false;
            const suggestedButtons = document.querySelectorAll('button');
            for (const btn of suggestedButtons) {
                const text = btn.textContent?.trim() || '';
                if (text.includes('/') && (text.includes('Men') || text.includes('Women') || text.includes('Unisex'))) {
                    if (ensureInteractable(btn)) {
                        log('CATEGORY', `✓ Pill: "${text}"`);
                        btn.click();
                        categorySet = true;
                        await sleep(1500);
                        break;
                    }
                }
            }

            if (!categorySet) {
                log('CATEGORY', 'No pills, trying combobox...');
                categorySet = await fillCombobox('group-input', 'group-menu', 'Men');
                if (categorySet) await sleep(1500);
            }

            if (!categorySet) {
                log('CATEGORY', '✗ Failed');
                errors.push('Category not set');
            }

            await sleep(800);

            // ── 4. BRAND ──
            // FIX: Map brand aliases so "Bape" → "A Bathing Ape" for Depop's database
            let brandTerm = listing.brand || 'Vintage';
            const aliasKey = brandTerm.toLowerCase().trim();
            if (brandAliases[aliasKey]) {
                log('BRAND', `Alias: "${brandTerm}" → "${brandAliases[aliasKey]}"`);
                brandTerm = brandAliases[aliasKey];
            }
            const brandResult = await fillCombobox('brand-input', 'brand-menu', brandTerm);
            log('BRAND', brandResult ? `✓ "${brandTerm}"` : `✗ "${brandTerm}"`);

            // If alias failed, try original name as fallback
            if (!brandResult && brandAliases[aliasKey]) {
                log('BRAND', `Trying original: "${listing.brand}"`);
                const retryResult = await fillCombobox('brand-input', 'brand-menu', listing.brand);
                if (!retryResult) errors.push('Brand failed: ' + listing.brand);
                else log('BRAND', `✓ Retry worked with "${listing.brand}"`);
            } else if (!brandResult) {
                errors.push('Brand failed: ' + brandTerm);
            }

            await sleep(600);

            // ── 5. CONDITION ──
            if (listing.condition) {
                const conditionMap = {
                    'NEW': 'Brand new', 'LIKE_NEW': 'Like new',
                    'USED_EXCELLENT': 'Excellent', 'USED_GOOD': 'Good', 'USED_FAIR': 'Fair',
                    'new_with_tags': 'Brand new', 'new_without_tags': 'Like new',
                    'like_new': 'Like new', 'good': 'Good', 'fair': 'Fair',
                };
                const depopCondition = conditionMap[listing.condition] || listing.condition;
                const condResult = await fillCombobox('condition-input', 'condition-menu', depopCondition);
                log('CONDITION', condResult ? `✓ "${depopCondition}"` : `✗ "${depopCondition}"`);
            }

            await sleep(600);

            // ── 6. SIZE ──
            // Uses button#variants-toggle-button → menu#variants-menu → #variants-item-N
            // FIX: Use EXACT match first, then fallback to includes (avoids "s" matching "One size")
            log('SIZE', `Looking for #variants-toggle-button (data: "${listing.size || 'none'}")`);

            const sizeButton = document.getElementById('variants-toggle-button');
            let sizeSet = false;

            if (sizeButton && ensureInteractable(sizeButton)) {
                log('SIZE', 'Clicking toggle button...');
                sizeButton.click();
                await sleep(1000);

                const sizeMenu = await waitForElement('#variants-menu', 5000);

                if (sizeMenu) {
                    // Wait a bit more for menu items to render
                    await sleep(500);

                    const sizeItems = sizeMenu.querySelectorAll('[id^="variants-item-"]');
                    log('SIZE', `Menu: ${sizeItems.length} options`);

                    const available = [...sizeItems].map(item =>
                        `${item.id}="${item.textContent?.trim()}"`
                    );
                    log('SIZE', `Available: ${available.join(', ')}`);

                    const sizeTarget = (listing.size || '').toLowerCase().trim();

                    if (sizeTarget) {
                        // PASS 1: Exact match only (critical for single-letter sizes like "s", "m", "l")
                        for (const item of sizeItems) {
                            const txt = item.textContent?.trim().toLowerCase() || '';
                            if (txt === sizeTarget) {
                                log('SIZE', `Exact match: "${item.textContent?.trim()}" — clicking`);
                                item.scrollIntoView({ behavior: 'instant', block: 'center' });
                                await sleep(200);
                                item.click();
                                sizeSet = true;
                                await sleep(500);
                                break;
                            }
                        }

                        // PASS 2: Fuzzy match only if exact failed (for sizes like "extra large" → "XL")
                        if (!sizeSet) {
                            for (const item of sizeItems) {
                                const txt = item.textContent?.trim().toLowerCase() || '';
                                if (txt.includes(sizeTarget) && txt !== 'one size') {
                                    log('SIZE', `Fuzzy match: "${item.textContent?.trim()}" — clicking`);
                                    item.scrollIntoView({ behavior: 'instant', block: 'center' });
                                    await sleep(200);
                                    item.click();
                                    sizeSet = true;
                                    await sleep(500);
                                    break;
                                }
                            }
                        }
                    }

                    // PASS 3: Fallback to first non-"One size" option
                    if (!sizeSet && sizeItems.length > 0) {
                        for (const item of sizeItems) {
                            const txt = item.textContent?.trim().toLowerCase() || '';
                            if (txt !== 'one size') {
                                log('SIZE', `Fallback: "${item.textContent?.trim()}"`);
                                item.scrollIntoView({ behavior: 'instant', block: 'center' });
                                await sleep(200);
                                item.click();
                                sizeSet = true;
                                await sleep(500);
                                break;
                            }
                        }
                    }
                } else {
                    log('SIZE', '✗ #variants-menu never appeared');
                }
            } else {
                log('SIZE', '✗ #variants-toggle-button not found or not interactable');
            }

            if (!sizeSet) {
                log('SIZE', '✗ FAILED');
                errors.push('Size not set');
            }

            await sleep(600);

            // ── 7. IMAGES ──
            // FIX: Use drag-and-drop events instead of fileInput.files assignment.
            // React file inputs don't detect programmatic .files changes — they rely
            // on the native change event from the file picker or drag-drop dataTransfer.
            if (listing.images && Array.isArray(listing.images) && listing.images.length > 0) {
                log('IMAGES', `Processing ${listing.images.length} image(s)...`);

                const files = [];
                for (const imgUrl of listing.images.slice(0, 8)) {
                    try {
                        const response = await fetch(imgUrl);
                        if (!response.ok) {
                            log('IMAGES', `HTTP ${response.status}: ${imgUrl.substring(0, 50)}`);
                            continue;
                        }
                        const blob = await response.blob();
                        const filename = imgUrl.split('/').pop()?.split('?')[0] || 'image.jpg';
                        const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
                        files.push(file);
                    } catch (err) {
                        log('IMAGES', `Fetch error: ${err.message}`);
                    }
                }

                log('IMAGES', `Fetched ${files.length}/${listing.images.length}`);

                if (files.length > 0) {
                    let imageUploaded = false;

                    // Strategy A: Drag-and-drop onto the upload zone
                    const dropZone = document.querySelector('[class*="upload" i]')
                        || document.querySelector('[class*="drag" i]')
                        || document.querySelector('[class*="dropzone" i]')
                        || document.querySelector('[class*="ImageUpload" i]')
                        || document.querySelector('[data-testid*="image" i]')
                        || document.querySelector('label[for*="image" i]');

                    if (dropZone) {
                        log('IMAGES', `Found drop zone: <${dropZone.tagName} class="${(dropZone.className || '').toString().substring(0, 60)}">`);

                        const dt = new DataTransfer();
                        files.forEach(f => dt.items.add(f));

                        // Simulate full drag-drop sequence
                        dropZone.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
                        await sleep(100);
                        dropZone.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
                        await sleep(100);
                        dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
                        log('IMAGES', `✓ Drag-dropped ${files.length} files onto zone`);
                        imageUploaded = true;
                        await sleep(3000);
                    }

                    // Strategy B: Set files on <input type="file"> with proper event
                    if (!imageUploaded) {
                        const fileInput = document.querySelector('input[type="file"]');
                        if (fileInput) {
                            log('IMAGES', `Trying file input: <input accept="${fileInput.accept || '*'}">`);

                            const dt = new DataTransfer();
                            files.forEach(f => dt.items.add(f));
                            fileInput.files = dt.files;

                            // Dispatch both input and change events for React compatibility
                            const changeEvent = new Event('change', { bubbles: true });
                            Object.defineProperty(changeEvent, 'target', {
                                writable: false,
                                value: fileInput
                            });
                            fileInput.dispatchEvent(changeEvent);
                            fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                            log('IMAGES', `✓ Set ${dt.files.length} files on input`);
                            imageUploaded = true;
                            await sleep(3000);
                        }
                    }

                    // Strategy C: Click the upload area to open native file picker,
                    // then intercept and override (last resort)
                    if (!imageUploaded) {
                        log('IMAGES', '✗ No upload zone or file input found');
                        errors.push('Image upload element not found');
                    }

                    // Verify: check if images actually appeared on the page
                    await sleep(1000);
                    const uploadedPreviews = document.querySelectorAll('[class*="preview" i] img, [class*="thumbnail" i] img, [class*="image" i] img');
                    log('IMAGES', `Post-upload preview check: ${uploadedPreviews.length} preview image(s) on page`);

                } else {
                    log('IMAGES', '✗ All fetches failed');
                    errors.push('All image fetches failed');
                }
            } else {
                log('IMAGES', 'No image data');
            }

            await sleep(800);

            // ── 8. PRE-SUBMIT CHECK ──
            log('VALIDATE', 'Checking for validation errors...');
            const existingErrors = document.querySelectorAll('[class*="error" i], [data-testid*="error"]');
            const preErrors = [...existingErrors]
                .map(e => e.textContent?.trim())
                .filter(t => t && t.length > 3 && t.length < 200
                    && (t.toLowerCase().includes('required') || t.toLowerCase().includes('insert')));
            if (preErrors.length > 0) {
                log('VALIDATE', `⚠ Pre-submit issues: ${preErrors.join(' | ')}`);
            } else {
                log('VALIDATE', '✓ No errors');
            }

            // ── 9. SUBMIT ──
            log('SUBMIT', 'Looking for Post button...');
            const allButtons = document.querySelectorAll('button');
            let postButton = null;
            for (const btn of allButtons) {
                const text = btn.textContent?.trim().toLowerCase() || '';
                if (text.includes('post listing') || text === 'post') {
                    postButton = btn;
                    break;
                }
            }
            if (!postButton) postButton = document.querySelector('button[type="submit"]');

            if (postButton && ensureInteractable(postButton)) {
                log('SUBMIT', `Found: "${postButton.textContent?.trim()}" disabled=${postButton.disabled}`);

                // Wait if button is temporarily disabled
                let attempts = 0;
                while (postButton.disabled && attempts < 10) {
                    log('SUBMIT', `Button disabled, waiting... (${attempts + 1}/10)`);
                    await sleep(500);
                    attempts++;
                }

                if (postButton.disabled) {
                    errors.push('Post button stayed disabled');
                } else {
                    const urlBefore = window.location.href;
                    log('SUBMIT', 'Clicking Post...');
                    postButton.click();

                    // Poll for success
                    let posted = false;
                    for (let i = 0; i < 20; i++) {
                        await sleep(500);
                        if (window.location.href !== urlBefore) {
                            posted = true;
                            log('SUBMIT', `✓ URL changed → ${window.location.href}`);
                            break;
                        }
                        const toast = document.querySelector('[class*="toast"], [role="alert"]');
                        if (toast && toast.textContent?.toLowerCase().includes('success')) {
                            posted = true;
                            log('SUBMIT', '✓ Success toast');
                            break;
                        }
                    }

                    if (!posted) {
                        const valErrors = document.querySelectorAll('[class*="error" i], [class*="Error"]');
                        const errorTexts = [...valErrors]
                            .map(e => e.textContent?.trim())
                            .filter(t => t && t.length > 3 && t.length < 200);
                        if (errorTexts.length > 0) {
                            log('SUBMIT', `✗ Validation: ${errorTexts.join(' | ')}`);
                            errors.push('Validation: ' + errorTexts.join('; '));
                        } else {
                            log('SUBMIT', '⚠ No redirect after 10s, no errors');
                        }
                    }
                }
            } else {
                log('SUBMIT', '✗ Post button not found');
                errors.push('Post button not found');
            }

            // ── REPORT ──
            const success = errors.length === 0;
            log('DONE', success
                ? `✓ SUCCESS — "${listing.title}"`
                : `⚠ ISSUES (${errors.length}): ${errors.join('; ')}`
            );

            console.log('Depop Filler: === FULL STEP LOG ===');
            steps.forEach(s => console.log('  ' + s));
            console.log('Depop Filler: === END LOG ===');

            chrome.runtime.sendMessage({
                action: 'DEPOP_POST_COMPLETE',
                success,
                error: errors.length > 0 ? errors.join('; ') : null,
                listingTitle: listing.title,
                stepLog: steps
            });

        } catch (err) {
            log('FATAL', `✗ ${err.message}`);
            console.error('Depop Filler: Stack:', err.stack);
            console.log('Depop Filler: === FULL STEP LOG ===');
            steps.forEach(s => console.log('  ' + s));
            console.log('Depop Filler: === END LOG ===');

            chrome.runtime.sendMessage({
                action: 'DEPOP_POST_COMPLETE',
                success: false,
                error: err.message,
                listingTitle: listing.title,
                stepLog: steps
            });
        }
    });
})();
