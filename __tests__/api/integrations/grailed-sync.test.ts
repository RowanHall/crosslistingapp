/** @jest-environment node */

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/storage', () => ({
    uploadImageFromUrl: jest.fn((_supabase: unknown, url: string) => Promise.resolve(url)),
}));

import { createClient } from '@/utils/supabase/server';
import { POST } from '@/app/api/integrations/grailed/sync/route';
import { createMockSupabase } from '../../helpers/mockSupabase';

const mockCreateClient = jest.mocked(createClient);
const USER_ID = 'user-1';

const makeReq = (body: any) =>
    new Request('http://localhost/api/integrations/grailed/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

const grailedProduct = (overrides: any = {}) => ({
    id: 91293025,
    title: 'Bape Hoodie',
    condition: 'is_gently_used',
    designers: [{ id: 38, name: 'Bape' }],
    price: 219,
    size: 'm',
    allPhotos: ['https://media-assets.grailed.com/photo1.jpg'],
    ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('POST /api/integrations/grailed/sync', () => {
    it('returns 401 when unauthenticated', async () => {
        const supabase = createMockSupabase({ user: null });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ products: [] }));
        expect(res.status).toBe(401);
    });

    it('short-circuits on empty products array', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID } });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ products: [] }));
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json).toEqual({ success: true, count: 0, message: 'No products to sync' });
    });

    it('inserts new listings on first sync', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID }, seed: { listings: [] } });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ products: [grailedProduct({ id: 1 }), grailedProduct({ id: 2 })] }));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json).toEqual({ success: true, count: 2 });
        expect(supabase._db.listings).toHaveLength(2);
        expect(supabase._db.listings.every((l: any) => l.source === 'grailed')).toBe(true);
        expect(supabase._db.listings[0].platforms_status).toEqual({ grailed: 'listed' });
    });

    it('does NOT duplicate rows when syncing the same payload twice (no double-import)', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID }, seed: { listings: [] } });
        mockCreateClient.mockResolvedValue(supabase as any);

        const products = [grailedProduct({ id: 100 }), grailedProduct({ id: 200 })];

        await POST(makeReq({ products }));
        await POST(makeReq({ products }));

        expect(supabase._db.listings).toHaveLength(2);
    });

    it('updates content fields on re-sync (title change picked up)', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID }, seed: { listings: [] } });
        mockCreateClient.mockResolvedValue(supabase as any);

        await POST(makeReq({ products: [grailedProduct({ id: 1, title: 'Old' })] }));
        await POST(makeReq({ products: [grailedProduct({ id: 1, title: 'New' })] }));

        expect(supabase._db.listings).toHaveLength(1);
        expect(supabase._db.listings[0].title).toBe('New');
    });

    it('intercepts cross-listed items (existing row with grailed_listing_url) and only updates status', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    {
                        id: 'row-99',
                        user_id: USER_ID,
                        source: 'facebook',
                        external_id: 'fb-original',
                        grailed_listing_url: 'https://www.grailed.com/listings/91293025-foo',
                        platforms_status: { facebook: 'listed', grailed: 'listed' },
                    },
                ],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        await POST(makeReq({ products: [grailedProduct({ id: 91293025, sold_at: '2026-06-01' })] }));

        // No new row created — only the existing cross-listed row is updated
        expect(supabase._db.listings).toHaveLength(1);
        expect(supabase._db.listings[0].id).toBe('row-99');
        expect(supabase._db.listings[0].platforms_status.grailed).toBe('sold');
        expect(supabase._db.listings[0].platforms_status.facebook).toBe('listed');
    });
});
