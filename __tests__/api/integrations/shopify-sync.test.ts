/** @jest-environment node */

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/storage', () => ({
    uploadImageFromUrl: jest.fn((_supabase: unknown, url: string) => Promise.resolve(url)),
}));
jest.mock('@/lib/shopify', () => ({
    listShopifyProducts: jest.fn(),
}));

import { createClient } from '@/utils/supabase/server';
import { POST } from '@/app/api/integrations/shopify/sync/route';
import { listShopifyProducts } from '@/lib/shopify';
import { createMockSupabase } from '../../helpers/mockSupabase';
import { seedShopifyIntegration } from '../../helpers/mockPlatforms';

const mockCreateClient = jest.mocked(createClient);
const mockListShopify = jest.mocked(listShopifyProducts);
const USER_ID = 'user-1';

const shopifyProduct = (overrides: any = {}) => ({
    id: 9876543210,
    title: 'Carhartt Detroit Jacket',
    body_html: '<p>Worn but cared for.</p>',
    vendor: 'Carhartt',
    tags: 'condition:used_good',
    variants: [{ price: '85.00', option1: 'L' }],
    images: [{ src: 'https://cdn.shopify.com/jacket-1.jpg' }],
    ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('POST /api/integrations/shopify/sync', () => {
    it('returns 401 when unauthenticated', async () => {
        const supabase = createMockSupabase({ user: null });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST();
        expect(res.status).toBe(401);
    });

    it('returns 400 when no Shopify integration is connected', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID }, seed: { user_integrations: [] } });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST();
        const json = await res.json();
        expect(res.status).toBe(400);
        expect(json.error).toMatch(/not connected/i);
    });

    it('inserts new products on first sync', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                user_integrations: [seedShopifyIntegration(USER_ID)],
                listings: [],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        mockListShopify.mockResolvedValue([shopifyProduct({ id: 1 }), shopifyProduct({ id: 2 })]);

        const res = await POST();
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.count).toBe(2);
        expect(supabase._db.listings).toHaveLength(2);
        expect(supabase._db.listings[0].source).toBe('shopify');
    });

    it('does not duplicate rows on re-sync (matches by shopify_product_id)', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                user_integrations: [seedShopifyIntegration(USER_ID)],
                listings: [
                    {
                        id: 'existing-row',
                        user_id: USER_ID,
                        shopify_product_id: '1',
                        platforms_status: { shopify: 'listed' },
                    },
                ],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        mockListShopify.mockResolvedValue([shopifyProduct({ id: 1 })]);

        const res = await POST();
        const json = await res.json();

        // count = 0 because the existing row was just status-updated, not inserted
        expect(json.count).toBe(0);
        expect(supabase._db.listings).toHaveLength(1);
        expect(supabase._db.listings[0].platforms_status.shopify).toBe('listed');
    });

    it('preserves cross-platform status on the existing row', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                user_integrations: [seedShopifyIntegration(USER_ID)],
                listings: [
                    {
                        id: 'cross',
                        user_id: USER_ID,
                        shopify_product_id: '42',
                        platforms_status: { grailed: 'listed', facebook: 'sold' },
                    },
                ],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        mockListShopify.mockResolvedValue([shopifyProduct({ id: 42 })]);

        await POST();

        expect(supabase._db.listings[0].platforms_status).toEqual({
            grailed: 'listed',
            facebook: 'sold',
            shopify: 'listed',
        });
    });
});
