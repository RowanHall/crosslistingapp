/** @jest-environment node */

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/storage', () => ({
    uploadImageFromUrl: jest.fn((_supabase: unknown, url: string) => Promise.resolve(url)),
}));

import { createClient } from '@/utils/supabase/server';
import { POST } from '@/app/api/integrations/facebook/sync/route';
import { createMockSupabase } from '../../helpers/mockSupabase';

const mockCreateClient = jest.mocked(createClient);
const USER_ID = 'user-1';

const makeReq = (body: any) =>
    new Request('http://localhost/api/integrations/facebook/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

const fbProduct = (overrides: any = {}) => ({
    id: '1545306466555706',
    title: 'Vintage Levi 501',
    description: 'Size 32',
    price: 'CA$86',
    condition: 'Used - Good',
    isLive: true,
    isSold: false,
    images: ['https://scontent.xx.fbcdn.net/img1.jpg'],
    ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('POST /api/integrations/facebook/sync', () => {
    it('inserts new FB-native listings on first sync', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID }, seed: { listings: [] } });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ products: [fbProduct({ id: '1' }), fbProduct({ id: '2' })] }));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.count).toBe(2);
        expect(supabase._db.listings).toHaveLength(2);
        expect(supabase._db.listings[0].source).toBe('facebook');
    });

    it('does not duplicate rows on re-sync', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID }, seed: { listings: [] } });
        mockCreateClient.mockResolvedValue(supabase as any);

        await POST(makeReq({ products: [fbProduct({ id: '1' })] }));
        await POST(makeReq({ products: [fbProduct({ id: '1' })] }));

        expect(supabase._db.listings).toHaveLength(1);
    });

    it('intercepts a cross-listed row (Grailed-origin with facebook_listing_url) — no duplicate row', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    {
                        id: 'row-cross',
                        user_id: USER_ID,
                        source: 'grailed',
                        external_id: 'g-1',
                        facebook_listing_url: 'https://www.facebook.com/marketplace/item/1545306466555706/',
                        platforms_status: { grailed: 'listed', facebook: 'listed' },
                    },
                ],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        await POST(makeReq({ products: [fbProduct({ id: '1545306466555706', isLive: false, isSold: true })] }));

        expect(supabase._db.listings).toHaveLength(1);
        expect(supabase._db.listings[0].platforms_status).toEqual({
            grailed: 'listed',
            facebook: 'sold',
        });
    });

    it('reconciles: ghost FB-native listings get marked "unlisted" (never deleted)', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    {
                        id: 'ghost-row',
                        user_id: USER_ID,
                        source: 'facebook',
                        external_id: 'fb-old-id',
                        platforms_status: { facebook: 'listed' },
                    },
                ],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        // Sync a different product → ghost-row should be soft-archived
        const res = await POST(makeReq({ products: [fbProduct({ id: 'fb-new-id' })] }));
        const json = await res.json();

        expect(json.ghostsArchived).toBe(1);
        const ghost = supabase._db.listings.find((l: any) => l.id === 'ghost-row');
        expect(ghost).toBeDefined();
        expect(ghost.platforms_status.facebook).toBe('unlisted');
        // The new product should still be inserted
        expect(supabase._db.listings.find((l: any) => l.external_id === 'fb-new-id')).toBeDefined();
    });

    it('reconciles: cross-listed ghosts get facebook_listing_url cleared', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    {
                        id: 'cross-ghost',
                        user_id: USER_ID,
                        source: 'grailed',
                        external_id: 'g-1',
                        facebook_listing_url: 'https://www.facebook.com/marketplace/item/9999999/',
                        platforms_status: { grailed: 'listed', facebook: 'listed' },
                    },
                ],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        // Sync without the 9999999 listing — it's been deleted on FB
        await POST(makeReq({ products: [fbProduct({ id: 'fb-other' })] }));

        const ghost = supabase._db.listings.find((l: any) => l.id === 'cross-ghost');
        expect(ghost.facebook_listing_url).toBeNull();
        expect(ghost.platforms_status.facebook).toBe('unlisted');
        expect(ghost.platforms_status.grailed).toBe('listed');
    });
});
