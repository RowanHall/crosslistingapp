// public/scripts/depop-scraper.js

(function () {
    console.log('Depop Scraper started...');

    function scrapeDepop() {
        try {
            const data = {};

            // 1. Description
            // Depop descriptions are often in div[data-testid="product__description"] or similar
            const descriptionEl = document.querySelector('[data-testid="product__description"]') ||
                document.querySelector('meta[property="og:description"]');
            if (descriptionEl) {
                data.description = descriptionEl.innerText || descriptionEl.getAttribute('content');
            }

            // 2. Price
            // Often in aria-label="Price" or data-testid="product__price"
            const priceEl = document.querySelector('[data-testid="product__price"]');
            if (priceEl) {
                data.price = priceEl.innerText.replace(/[^\d.]/g, '');
            }

            // 3. Images
            // Look for images in the gallery
            const imageEls = document.querySelectorAll('img[class*="Image__StyledImage"]'); // Selector might need adjustment based on specific Depop styling
            const images = [];
            imageEls.forEach(img => {
                if (img.src && !images.includes(img.src) && img.src.includes('depop.com')) {
                    images.push(img.src);
                }
            });
            // Fallback if semantic classes fail, try looking for large images
            if (images.length === 0) {
                const allImages = document.querySelectorAll('img');
                allImages.forEach(img => {
                    if (img.width > 200 && img.src.includes('depop')) {
                        images.push(img.src);
                    }
                });
            }
            data.images = images;

            // 4. Title (often description is title, but sometimes there's a header)
            // Depop uses description as the main text usually.

            // 5. Brand, Size, Condition - often in a table or list
            // This part is highly dependent on Depop's current DOM structure
            const attributes = document.querySelectorAll('[data-testid="product__attribute"]');
            attributes.forEach(attr => {
                const key = attr.querySelector('p:first-child')?.innerText?.toLowerCase();
                const value = attr.querySelector('p:last-child')?.innerText;
                if (key && value) {
                    if (key.includes('brand')) data.brand = value;
                    if (key.includes('size')) data.size = value;
                    if (key.includes('condition')) data.condition = value;
                }
            });

            return data;
        } catch (e) {
            console.error('Error scraping Depop:', e);
            return { error: e.message };
        }
    }

    return scrapeDepop();
})();
