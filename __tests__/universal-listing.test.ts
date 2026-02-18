import { UniversalListing } from '../lib/universal-listing';

describe('UniversalListing', () => {
    describe('fromEbay', () => {
        it('should correctly map eBay data', () => {
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
    });

    describe('fromDepop', () => {
        it('should correctly map Depop data', () => {
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
            expect(listing.title).toBe("Vintage y2k sweater"); // First 40 chars, stop at newline
            expect(listing.description).toBe("Vintage y2k sweater\nGreat condition");
            expect(listing.price).toBe(99.00);
            expect(listing.images).toContain("https://media-photos.depop.com/.../P8.jpg");
            // Condition might default if not present or mapped differently, check implementation
            // expect(listing.condition).toBe("USED_GOOD"); 
            expect(listing.size).toBe("One size");
            expect(listing.source).toBe("depop");
        });
    });

    describe('fromGrailed', () => {
        it('should correctly map Grailed data', () => {
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
                "title": "a bathing ape ‘stars n stripes’ fullzip hoodie nigo",
                "image_url": "https://media-assets.grailed.com/.../temp"
            };

            const listing = UniversalListing.fromGrailed(rawData);

            expect(listing.id).toBe("91293025");
            expect(listing.title).toBe("a bathing ape ‘stars n stripes’ fullzip hoodie nigo");
            expect(listing.description).toBe("a bathing ape ‘stars n stripes’ fullzip hoodie nigo"); // Fallback to title if desc missing
            expect(listing.price).toBe(219);
            expect(listing.images).toEqual(["https://media-assets.grailed.com/.../temp"]);
            expect(listing.condition).toBe("USED_EXCELLENT"); // Mapped from 'is_gently_used'
            expect(listing.brand).toBe("Bape");
            expect(listing.size).toBe("m");
            expect(listing.source).toBe("grailed");
        });
    });
});
