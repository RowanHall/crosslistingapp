export type ListingCondition = 'NEW' | 'USED_EXCELLENT' | 'USED_GOOD' | 'USED_FAIR';
export type ListingSource = 'ebay' | 'depop' | 'grailed' | 'facebook' | 'shopify';

export interface UniversalListingData {
    id: string;
    title: string;
    description: string;
    price: number | null;
    currency: string;
    images: string[];
    condition: ListingCondition;
    brand: string | null;
    size: string | null;
    source: ListingSource;
    originalData: any;
}

export class UniversalListing {
    id: string;
    title: string;
    description: string;
    price: number | null;
    currency: string;
    images: string[];
    condition: ListingCondition;
    brand: string | null;
    size: string | null;
    source: ListingSource;
    originalData: any;

    constructor(data: UniversalListingData) {
        this.id = data.id;
        this.title = data.title;
        this.description = data.description;
        this.price = data.price;
        this.currency = data.currency;
        this.images = data.images;
        this.condition = data.condition;
        this.brand = data.brand;
        this.size = data.size;
        this.source = data.source;
        this.originalData = data.originalData;
    }

    /** Convert to a plain object safe for Next.js server action serialization */
    toPlainObject(): UniversalListingData {
        return {
            id: this.id,
            title: this.title,
            description: this.description,
            price: this.price,
            currency: this.currency,
            images: this.images,
            condition: this.condition,
            brand: this.brand,
            size: this.size,
            source: this.source,
            originalData: this.originalData,
        };
    }

    static fromEbay(data: any): UniversalListing {
        const mapCondition = (cond: string): ListingCondition => {
            // Map eBay conditions to universal enum
            // Example mapping, adjust as needed based on actual eBay values
            const c = cond?.toUpperCase();
            if (c === 'NEW' || c === 'NEW_WITH_TAGS') return 'NEW';
            if (c === 'USED_EXCELLENT') return 'USED_EXCELLENT';
            if (c === 'USED_GOOD') return 'USED_GOOD';
            return 'USED_GOOD'; // Default fallback
        };

        return new UniversalListing({
            id: data?.sku || '',
            title: data?.product?.title || '',
            description: data?.product?.description || '',
            price: null, // eBay price handled in Offer API
            currency: 'USD', // Default or extract if available
            images: data?.product?.imageUrls || [],
            condition: mapCondition(data?.condition),
            brand: data?.product?.aspects?.Brand?.[0] || null,
            size: data?.product?.aspects?.Size?.[0] || null,
            source: 'ebay',
            originalData: data,
        });
    }

    static fromDepop(data: any): UniversalListing {
        const mapCondition = (cond: string): ListingCondition => {
            // Depop doesn't consistently provide condition in the same way, 
            // using a default or mapping if available in a different field.
            // For now, defaulting to USED_GOOD if not explicit.
            // In the example, there isn't a clear 'condition' field like eBay/Grailed enum-like strings in the top level 
            // other than 'description' content or potentially 'attributes'.
            // Assuming 'USED_GOOD' as a safe default based on description "Great condition" is not reliable parsing logic for this scope unless requested.
            // However, if there WAS a condition field:
            if (data?.condition === 'new') return 'NEW';
            return 'USED_GOOD';
        };

        // Extract title from description: first 40 chars, stop at newline
        let title = data?.description || '';
        const newlineIndex = title.indexOf('\n');
        if (newlineIndex !== -1) {
            title = title.substring(0, newlineIndex);
        }
        if (title.length > 40) {
            title = title.substring(0, 40);
        }

        // Extract highest res image
        const images = (data?.pictures || []).map((pic: any) => {
            // Prioritize 1280, then 960, then 640...
            return pic['1280'] || pic['960'] || pic['640'] || Object.values(pic)[0];
        }).filter(Boolean);

        return new UniversalListing({
            id: String(data?.id || ''),
            title: title,
            description: data?.description || '',
            price: parseFloat(data?.pricing?.original_price?.total_price)
                || parseFloat(data?.pricing?.original_price?.price_breakdown?.price?.amount)
                || null,
            currency: data?.pricing?.currency_name || 'USD',
            images,
            condition: mapCondition(data?.condition),
            brand: null, // Depop brand extraction might need more specific logic if not in top level
            size: data?.sizes?.[0] || null,
            source: 'depop',
            originalData: data,
        });
    }

    static fromGrailed(data: any): UniversalListing {
        const mapCondition = (cond: string): ListingCondition => {
            const c = cond?.toLowerCase();
            if (c === 'is_new') return 'NEW';
            if (c === 'is_gently_used') return 'USED_EXCELLENT';
            if (c === 'is_used') return 'USED_GOOD';
            return 'USED_GOOD';
        };

        // Extract images - prefer allPhotos from enrichment step, fallback to Algolia fields
        let images: string[] = [];
        if (Array.isArray(data?.allPhotos) && data.allPhotos.length > 0) {
            // Phase 2 enrichment: full photo URLs scraped from listing page
            images = [...data.allPhotos];
        } else {
            // Fallback: Algolia cover photo only
            if (data?.cover_photo?.url) {
                images.push(data.cover_photo.url);
            } else if (typeof data?.cover_photo === 'string') {
                images.push(data.cover_photo);
            } else if (data?.image_url) {
                images.push(data.image_url);
            }
            // Also grab any additional photos array
            if (Array.isArray(data?.photos)) {
                for (const photo of data.photos) {
                    const url = typeof photo === 'string' ? photo : photo?.url;
                    if (url && !images.includes(url)) images.push(url);
                }
            }
        }

        return new UniversalListing({
            id: String(data?.id || ''),
            title: data?.title || '',
            description: data?.enrichedDescription || data?.description || data?.title || '',
            price: typeof data?.price === 'number' ? data.price : null,
            currency: 'USD',
            images,
            condition: mapCondition(data?.condition),
            brand: data?.designers?.[0]?.name || null,
            size: data?.size || null,
            source: 'grailed',
            originalData: data,
        });
    }

    static fromShopify(data: any): UniversalListing {
        // Parse condition from tags (look for "condition:*" tag)
        const tags: string[] = (data.tags ?? "")
            .split(",")
            .map((t: string) => t.trim().toLowerCase());
        const conditionTag = tags.find((t) => t.startsWith("condition:"));

        const mapCondition = (tag: string | undefined): ListingCondition => {
            if (!tag) return 'USED_GOOD';
            const value = tag.split(":")[1] ?? "";
            if (value === "new")            return 'NEW';
            if (value === "used_excellent") return 'USED_EXCELLENT';
            if (value === "used_fair")      return 'USED_FAIR';
            return 'USED_GOOD';
        };

        // Strip HTML from body_html
        const description = (data.body_html ?? "").replace(/<[^>]*>/g, "").trim();

        // Prefer re-hosted images if the sync route attached them
        const images: string[] = Array.isArray(data._hostedImages) && data._hostedImages.length > 0
            ? data._hostedImages
            : (data.images ?? []).map((img: any) => img.src ?? img);

        return new UniversalListing({
            id: String(data.id ?? ''),
            title: data.title ?? '',
            description,
            price: parseFloat(data.variants?.[0]?.price ?? '0') || null,
            currency: 'USD',
            images,
            condition: mapCondition(conditionTag),
            brand: data.vendor || null,
            size: data.variants?.[0]?.option1 ?? null,
            source: 'shopify',
            originalData: data,
        });
    }

    static fromFacebook(data: any): UniversalListing {
        // Price comes as a formatted string e.g. "CA$86" or "$120.00"
        let price: number | null = null;
        if (data?.price) {
            const numeric = String(data.price).replace(/[^0-9.]/g, '');
            const parsed = parseFloat(numeric);
            if (!isNaN(parsed)) price = parsed;
        }

        // Detect currency from the formatted string prefix
        let currency = 'USD';
        if (data?.price) {
            const p = String(data.price);
            if (p.startsWith('CA$'))      currency = 'CAD';
            else if (p.startsWith('£'))   currency = 'GBP';
            else if (p.startsWith('€'))   currency = 'EUR';
            else if (p.startsWith('AU$')) currency = 'AUD';
        }

        // Prefer the full images array from deep fetch; fall back to nothing
        const images: string[] = Array.isArray(data?.images) && data.images.length > 0
            ? data.images
            : [];

        // Map FB's condition string to our enum.
        // FB returns human-readable strings like "Used - Like New", "New", "Used - Good", etc.
        const mapCondition = (cond: string | null): ListingCondition => {
            if (!cond) return 'USED_GOOD';
            const c = cond.toLowerCase();
            if (c.includes('new') && !c.includes('like') && !c.includes('used')) return 'NEW';
            if (c.includes('like new') || c.includes('gently used')) return 'USED_EXCELLENT';
            if (c.includes('good'))  return 'USED_GOOD';
            if (c.includes('fair') || c.includes('heavily')) return 'USED_FAIR';
            return 'USED_GOOD';
        };

        return new UniversalListing({
            id: String(data?.id || ''),
            title: data?.title || '',
            description: data?.description || '',
            price,
            currency,
            images,
            condition: mapCondition(data?.condition ?? null),
            brand: null,
            size: null,
            source: 'facebook',
            originalData: data,
        });
    }
}
