/** @jest-environment node */

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));

import { createClient } from '@/utils/supabase/server';
import { POST, OPTIONS } from '@/app/api/inventory/bulk-import/route';
import { createMockSupabase } from '../../helpers/mockSupabase';

const mockCreateClient = jest.mocked(createClient);
const USER_ID = 'user-1';

const makeReq = (body: any) =>
    new Request('http://localhost/api/inventory/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

beforeEach(() => jest.clearAllMocks());

describe('OPTIONS /api/inventory/bulk-import', () => {
    it('returns 204 for CORS preflight', async () => {
        const res = await OPTIONS();
        expect(res.status).toBe(204);
    });
});

describe('POST /api/inventory/bulk-import', () => {
    it('returns 401 when unauthenticated', async () => {
        mockCreateClient.mockResolvedValue(createMockSupabase({ user: null }) as any);
        const res = await POST(makeReq({ products: [] }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when products is not an array', async () => {
        mockCreateClient.mockResolvedValue(createMockSupabase({ user: { id: USER_ID } }) as any);
        const res = await POST(makeReq({ products: 'nope' }));
        expect(res.status).toBe(400);
    });

    it('maps Depop products into listings and reports the count', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID }, seed: { listings: [] } });
        mockCreateClient.mockResolvedValue(supabase as any);

        const products = [
            {
                id: 101,
                slug: 'vintage-nike-jacket',
                description: 'Nice jacket',
                price: { priceAmount: '45' },
                pictures: [[{ url: 'https://img/a.jpg' }]],
            },
            {
                id: 102,
                // no slug, no description, no price → exercises the fallbacks
                pictures: [{ url: 'https://img/b.jpg' }],
            },
        ];

        const res = await POST(makeReq({ products }));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.count).toBe(2);

        const rows = supabase._db.listings;
        expect(rows[0].title).toBe('vintage nike jacket');
        expect(rows[0].images).toEqual(['https://img/a.jpg']);
        expect(rows[0].external_id).toBe('101');
        expect(rows[0].status).toBe('draft');
        // fallbacks for the second product
        expect(rows[1].title).toBe('Untitled');
        expect(rows[1].description).toBe('');
        expect(rows[1].price).toBe(0);
        expect(rows[1].images).toEqual(['https://img/b.jpg']);
    });
});
