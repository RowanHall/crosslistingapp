export type ListingCondition = 'NEW' | 'USED_EXCELLENT' | 'USED_GOOD' | 'USED_FAIR';

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
    source: 'ebay' | 'depop' | 'grailed';
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
    source: 'ebay' | 'depop' | 'grailed';
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
}
