/** @jest-environment node */

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));

import { createClient } from '@/utils/supabase/server';
import { POST } from '@/app/api/integrations/facebook/delete/route';
import { createMockSupabase } from '../../helpers/mockSupabase';

const mockCreateClient = jest.mocked(createClient);
const USER_ID = 'user-1';

const makeReq = (body: any) =>
    new Request('http://localhost/api/integrations/facebook/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

function seedRow(extra: Partial<any> = {}) {
    return {
        id: 'listing-1',
        user_id: USER_ID,
        external_id: 'fb-123',
        source: 'facebook',
        platforms_status: {},
        grailed_listing_url: null,
        facebook_listing_url: 'https://facebook.com/marketplace/item/fb-123',
        ...extra,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/integrations/facebook/delete', () => {
    it('returns 401 when unauthenticated', async () => {
        mockCreateClient.mockResolvedValue(createMockSupabase({ user: null }) as any);
        const res = await POST(makeReq({ platformId: 'fb-123' }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when platformId is missing', async () => {
        mockCreateClient.mockResolvedValue(createMockSupabase({ user: { id: USER_ID } }) as any);
        const res = await POST(makeReq({}));
        expect(res.status).toBe(400);
    });

    it('returns noop when no matching row exists', async () => {
        mockCreateClient.mockResolvedValue(
            createMockSupabase({ user: { id: USER_ID }, seed: { listings: [] } }) as any
        );
        const res = await POST(makeReq({ platformId: 'fb-999' }));
        const json = await res.json();
        expect(json.action).toBe('noop');
    });

    it('hard-deletes an FB-native row with no active cross-lists', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: { listings: [seedRow()] },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ platformId: 'fb-123' }));
        const json = await res.json();
        expect(json.action).toBe('deleted');
        expect(supabase._db.listings).toHaveLength(0);
    });

    it('soft-marks FB as deleted when the FB-native row is cross-listed elsewhere', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    seedRow({
                        grailed_listing_url: 'https://grailed.com/listings/9',
                        platforms_status: { grailed: 'listed' },
                    }),
                ],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ platformId: 'fb-123' }));
        const json = await res.json();
        expect(json.action).toBe('status_updated');
        expect(supabase._db.listings[0].platforms_status.facebook).toBe('deleted');
    });

    it('clears facebook_listing_url for a row that originated elsewhere', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    seedRow({
                        external_id: 'depop-1',
                        source: 'depop',
                        platforms_status: { facebook: 'listed', depop: 'listed' },
                    }),
                ],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ platformId: 'fb-123' }));
        const json = await res.json();
        expect(json.action).toBe('crosslist_cleared');
        const row = supabase._db.listings[0];
        expect(row.facebook_listing_url).toBeNull();
        expect(row.platforms_status.facebook).toBeUndefined();
        expect(row.platforms_status.depop).toBe('listed');
    });
});
