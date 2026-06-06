/** @jest-environment node */

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/shopify', () => ({
    createShopifyProduct: jest.fn(),
}));

import { createClient } from '@/utils/supabase/server';
import { createShopifyProduct } from '@/lib/shopify';
import { POST } from '@/app/api/crosslist/shopify/route';
import { createMockSupabase } from '../../helpers/mockSupabase';
import { seedShopifyIntegration } from '../../helpers/mockPlatforms';

const mockCreateClient = jest.mocked(createClient);
const mockCreate = jest.mocked(createShopifyProduct);

const USER_ID = 'user-1';
const LISTING_ID = 'listing-1';

const makeReq = (body: any) =>
    new Request('http://localhost/api/crosslist/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

function seedActiveListing(extra: Partial<any> = {}) {
    return {
        id: LISTING_ID,
        user_id: USER_ID,
        title: 'Carhartt Jacket',
        description: 'Worn well.',
        price: 85,
        brand: 'Carhartt',
        size: 'L',
        condition: 'USED_GOOD',
        currency: 'USD',
        images: ['https://example.com/img.jpg'],
        platforms_status: {},
        shopify_listing_url: null,
        shopify_product_id: null,
        ...extra,
    };
}

function happyPathMocks() {
    mockCreate.mockResolvedValue({ id: 9999, url: 'https://test-shop.myshopify.com/products/jacket' } as any);
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/crosslist/shopify', () => {
    it('happy path: creates product and updates DB with id + url', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [seedActiveListing()],
                user_integrations: [seedShopifyIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        happyPathMocks();

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.listingUrl).toMatch(/products\/jacket/);

        const row = supabase._db.listings[0];
        expect(row.shopify_product_id).toBe('9999');
        expect(row.shopify_listing_url).toMatch(/products\/jacket/);
        expect(row.platforms_status.shopify).toBe('listed');
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('returns 409 ALREADY_LISTED when platforms_status.shopify === "listed"', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    seedActiveListing({
                        platforms_status: { shopify: 'listed' },
                        shopify_listing_url: 'https://test-shop.myshopify.com/products/old',
                        shopify_product_id: '1234',
                    }),
                ],
                user_integrations: [seedShopifyIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        happyPathMocks();

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        const json = await res.json();

        expect(res.status).toBe(409);
        expect(json.code).toBe('ALREADY_LISTED');
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('returns 409 when only shopify_product_id is set', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [seedActiveListing({ shopify_product_id: '1234' })],
                user_integrations: [seedShopifyIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        happyPathMocks();

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        expect(res.status).toBe(409);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('bypasses guard when force=true', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    seedActiveListing({
                        platforms_status: { shopify: 'listed' },
                        shopify_product_id: '1234',
                    }),
                ],
                user_integrations: [seedShopifyIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        happyPathMocks();

        const res = await POST(makeReq({ listingId: LISTING_ID, force: true }));

        expect(res.status).toBe(200);
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('returns 401 when unauthenticated', async () => {
        const supabase = createMockSupabase({ user: null });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when Shopify integration missing', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: { listings: [seedActiveListing()], user_integrations: [] },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        expect(res.status).toBe(400);
    });

    it('platform error does NOT mutate DB', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [seedActiveListing()],
                user_integrations: [seedShopifyIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        mockCreate.mockRejectedValue(new Error('Shopify rate limit'));

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        expect(res.status).toBe(500);

        const row = supabase._db.listings[0];
        expect(row.shopify_product_id).toBeNull();
        expect(row.shopify_listing_url).toBeNull();
        expect(row.platforms_status).toEqual({});
    });
});
