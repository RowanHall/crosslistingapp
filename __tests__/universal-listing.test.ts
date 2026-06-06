import { UniversalListing } from '../lib/universal-listing';

describe('UniversalListing', () => {
    describe('fromEbay', () => {
        it('maps a typical eBay product', () => {
            const rawData = {
                "sku": "VINTAGE-TEE-001",
                "locale": "en_US",
                "product": {
                    "title": "90s Vintage Graphic T-Shirt",
                    "description": "A well-preserved 90s tee.",
                    "aspects": {
                        "Brand": ["Vintage"],
                        "Size": ["L"]
                    },
                    "imageUrls": ["https://example.com/img1.jpg"]
                },
                "condition": "USED_GOOD",
                "availability": {
                    "shipToLocationAvailability": { "quantity": 1 }
                }
            };

            const listing = UniversalListing.fromEbay(rawData);

            expect(listing.id).toBe("VINTAGE-TEE-001");
            expect(listing.title).toBe("90s Vintage Graphic T-Shirt");
            expect(listing.description).toBe("A well-preserved 90s tee.");
            expect(listing.price).toBeNull();
            expect(listing.images).toEqual(["https://example.com/img1.jpg"]);
            expect(listing.condition).toBe("USED_GOOD");
            expect(listing.brand).toBe("Vintage");
            expect(listing.size).toBe("L");
            expect(listing.source).toBe("ebay");
        });

        it('maps NEW_WITH_TAGS to NEW', () => {
            const listing = UniversalListing.fromEbay({ sku: 'x', condition: 'NEW_WITH_TAGS', product: {} });
            expect(listing.condition).toBe('NEW');
        });

        it('defaults to USED_GOOD for unknown conditions', () => {
            const listing = UniversalListing.fromEbay({ sku: 'x', condition: 'WHO_KNOWS', product: {} });
            expect(listing.condition).toBe('USED_GOOD');
        });

        it('tolerates missing fields without throwing', () => {
            const listing = UniversalListing.fromEbay({});
            expect(listing.id).toBe('');
            expect(listing.brand).toBeNull();
            expect(listing.images).toEqual([]);
        });
    });

    describe('fromDepop', () => {
        it('maps a typical Depop product', () => {
            const rawData = {
                "id": 644360662,
                "description": "Vintage y2k sweater\nGreat condition",
                "pictures": [
                    {
                        "150": "url_150",
                        "640": "url_640",
                        "1280": "https://media-photos.depop.com/.../P8.jpg"
                    }
                ],
                "pricing": {
                    "original_price": {
                        "price_breakdown": {
                            "price": { "amount": "99.00" }
                        },
                        "currency_code": "USD"
                    }
                },
                "sizes": ["One size"],
                "status": "ONSALE"
            };

            const listing = UniversalListing.fromDepop(rawData);

            expect(listing.id).toBe("644360662");
            expect(listing.title).toBe("Vintage y2k sweater");
            expect(listing.description).toBe("Vintage y2k sweater\nGreat condition");
            expect(listing.price).toBe(99.00);
            expect(listing.images).toContain("https://media-photos.depop.com/.../P8.jpg");
            expect(listing.size).toBe("One size");
            expect(listing.source).toBe("depop");
        });

        it('truncates titles longer than 40 chars when no newline', () => {
            const longText = 'a'.repeat(60);
            const listing = UniversalListing.fromDepop({ id: 1, description: longText });
            expect(listing.title).toHaveLength(40);
        });

        it('falls back across picture resolutions', () => {
            const listing = UniversalListing.fromDepop({
                id: 1,
                pictures: [{ '640': 'lo.jpg' }, { '1280': 'hi.jpg' }],
            });
            expect(listing.images).toEqual(['lo.jpg', 'hi.jpg']);
        });
    });

    describe('fromGrailed', () => {
        it('maps a typical Grailed product', () => {
            const rawData = {
                "id": 91293025,
                "category": "tops",
                "condition": "is_gently_used",
                "department": "menswear",
                "designers": [
                    { "id": 38, "name": "Bape" }
                ],
                "price": 219,
                "size": "m",
                "title": "a bathing ape 'stars n stripes' fullzip hoodie nigo",
                "image_url": "https://media-assets.grailed.com/.../temp"
            };

            const listing = UniversalListing.fromGrailed(rawData);

            expect(listing.id).toBe("91293025");
            expect(listing.title).toBe("a bathing ape 'stars n stripes' fullzip hoodie nigo");
            expect(listing.description).toBe("a bathing ape 'stars n stripes' fullzip hoodie nigo");
            expect(listing.price).toBe(219);
            expect(listing.images).toEqual(["https://media-assets.grailed.com/.../temp"]);
            expect(listing.condition).toBe("USED_EXCELLENT");
            expect(listing.brand).toBe("Bape");
            expect(listing.size).toBe("m");
            expect(listing.source).toBe("grailed");
        });

        it('prefers allPhotos when present (Phase 2 enrichment)', () => {
            const listing = UniversalListing.fromGrailed({
                id: 1,
                condition: 'is_new',
                allPhotos: ['a.jpg', 'b.jpg', 'c.jpg'],
                image_url: 'fallback.jpg',
                photos: [{ url: 'should-not-appear.jpg' }],
            });
            expect(listing.images).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
            expect(listing.condition).toBe('NEW');
        });

        it('maps is_used to USED_GOOD', () => {
            const listing = UniversalListing.fromGrailed({ id: 1, condition: 'is_used' });
            expect(listing.condition).toBe('USED_GOOD');
        });
    });

    describe('fromShopify', () => {
        it('maps a typical Shopify product', () => {
            const rawData = {
                id: 9876543210,
                title: 'Carhartt Detroit Jacket',
                body_html: '<p>Worn but cared for. <strong>No flaws.</strong></p>',
                vendor: 'Carhartt',
                tags: 'mens, jackets, condition:used_excellent',
                variants: [{ price: '85.00', option1: 'L' }],
                images: [{ src: 'https://cdn.shopify.com/jacket-1.jpg' }],
            };

            const listing = UniversalListing.fromShopify(rawData);

            expect(listing.id).toBe('9876543210');
            expect(listing.title).toBe('Carhartt Detroit Jacket');
            expect(listing.description).toBe('Worn but cared for. No flaws.');
            expect(listing.price).toBe(85);
            expect(listing.condition).toBe('USED_EXCELLENT');
            expect(listing.brand).toBe('Carhartt');
            expect(listing.size).toBe('L');
            expect(listing.images).toEqual(['https://cdn.shopify.com/jacket-1.jpg']);
            expect(listing.source).toBe('shopify');
        });

        it('prefers _hostedImages over images when sync re-hosted them', () => {
            const listing = UniversalListing.fromShopify({
                id: 1,
                tags: '',
                variants: [{ price: '10' }],
                images: [{ src: 'cdn.shopify.com/orig.jpg' }],
                _hostedImages: ['supabase/hosted.jpg'],
            });
            expect(listing.images).toEqual(['supabase/hosted.jpg']);
        });

        it('parses condition tag with a "condition:new" value', () => {
            const listing = UniversalListing.fromShopify({
                id: 1,
                tags: 'mens, condition:new',
                variants: [{ price: '10' }],
                images: [],
            });
            expect(listing.condition).toBe('NEW');
        });

        it('defaults condition to USED_GOOD when no condition tag', () => {
            const listing = UniversalListing.fromShopify({
                id: 1,
                tags: 'mens',
                variants: [{ price: '10' }],
                images: [],
            });
            expect(listing.condition).toBe('USED_GOOD');
        });
    });

    describe('fromFacebook', () => {
        it('maps a CA$-prefixed FB Marketplace listing', () => {
            const rawData = {
                id: '1234567890',
                title: 'Vintage Levi 501',
                description: 'Size 32',
                price: 'CA$86',
                condition: 'Used - Like New',
                images: ['https://scontent.xx.fbcdn.net/img1.jpg'],
            };

            const listing = UniversalListing.fromFacebook(rawData);

            expect(listing.id).toBe('1234567890');
            expect(listing.title).toBe('Vintage Levi 501');
            expect(listing.description).toBe('Size 32');
            expect(listing.price).toBe(86);
            expect(listing.currency).toBe('CAD');
            expect(listing.condition).toBe('USED_EXCELLENT');
            expect(listing.brand).toBeNull();
            expect(listing.images).toEqual(['https://scontent.xx.fbcdn.net/img1.jpg']);
            expect(listing.source).toBe('facebook');
        });

        it('detects GBP, EUR, AUD currency prefixes', () => {
            expect(UniversalListing.fromFacebook({ id: 1, price: '£12' }).currency).toBe('GBP');
            expect(UniversalListing.fromFacebook({ id: 1, price: '€20' }).currency).toBe('EUR');
            expect(UniversalListing.fromFacebook({ id: 1, price: 'AU$30' }).currency).toBe('AUD');
        });

        it('maps "New" (without "like" or "used") to NEW', () => {
            expect(UniversalListing.fromFacebook({ id: 1, condition: 'New' }).condition).toBe('NEW');
        });

        it('maps "Used - Good" to USED_GOOD', () => {
            expect(UniversalListing.fromFacebook({ id: 1, condition: 'Used - Good' }).condition).toBe('USED_GOOD');
        });

        it('maps "Used - Fair" or heavy use to USED_FAIR', () => {
            expect(UniversalListing.fromFacebook({ id: 1, condition: 'Used - Fair' }).condition).toBe('USED_FAIR');
            expect(UniversalListing.fromFacebook({ id: 1, condition: 'Heavily used' }).condition).toBe('USED_FAIR');
        });

        it('returns null price when no parseable number', () => {
            expect(UniversalListing.fromFacebook({ id: 1, price: 'Free' }).price).toBeNull();
        });
    });

    describe('toPlainObject', () => {
        it('serializes back to UniversalListingData shape', () => {
            const listing = UniversalListing.fromGrailed({ id: 1, condition: 'is_new', title: 't' });
            const plain = listing.toPlainObject();
            expect(plain.source).toBe('grailed');
            expect(plain.id).toBe('1');
            expect(Object.keys(plain).sort()).toEqual([
                'brand', 'condition', 'currency', 'description', 'id',
                'images', 'originalData', 'price', 'size', 'source', 'title',
            ]);
        });
    });
});
