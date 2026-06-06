/** @jest-environment node */

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));

import { createClient } from '@/utils/supabase/server';
import { saveUniversalListings } from '@/actions/listing';
import type { UniversalListingData } from '@/lib/universal-listing';
import { createMockSupabase } from '../helpers/mockSupabase';

const mockCreateClient = jest.mocked(createClient);

const USER_ID = 'user-abc';

function makeListing(overrides: Partial<UniversalListingData> = {}): UniversalListingData {
    return {
        id: 'ext-1',
        title: 'A Jacket',
        description: 'Nice jacket',
        price: 100,
        currency: 'USD',
        images: ['a.jpg'],
        condition: 'USED_GOOD',
        brand: 'Levi',
        size: 'M',
        source: 'grailed',
        originalData: { raw: true },
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('saveUniversalListings', () => {
    it('throws when user is not authenticated', async () => {
        const supabase = createMockSupabase({ user: null });
        mockCreateClient.mockResolvedValue(supabase as any);

        await expect(saveUniversalListings([makeListing()])).rejects.toThrow('User not authenticated');
    });

    it('short-circuits with count 0 on empty input', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID } });
        mockCreateClient.mockResolvedValue(supabase as any);

        const result = await saveUniversalListings([]);

        expect(result).toEqual({ success: true, count: 0 });
        expect(supabase._counts.listings).toBeUndefined();
    });

    it('inserts new listings with platforms_status = { source: "listed" }', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID }, seed: { listings: [] } });
        mockCreateClient.mockResolvedValue(supabase as any);

        const result = await saveUniversalListings([
            makeListing({ id: 'g-1', source: 'grailed' }),
            makeListing({ id: 'g-2', source: 'grailed' }),
        ]);

        expect(result).toEqual({ success: true, count: 2 });
        expect(supabase._db.listings).toHaveLength(2);
        expect(supabase._db.listings[0].platforms_status).toEqual({ grailed: 'listed' });
        expect(supabase._db.listings[0].user_id).toBe(USER_ID);
        expect(supabase._db.listings[0].external_id).toBe('g-1');
    });

    it('does NOT create duplicate rows on re-sync (same external_id)', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    {
                        user_id: USER_ID,
                        external_id: 'g-1',
                        title: 'Old title',
                        platforms_status: { grailed: 'listed' },
                    },
                ],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        await saveUniversalListings([makeListing({ id: 'g-1', title: 'New title', source: 'grailed' })]);

        expect(supabase._db.listings).toHaveLength(1);
        expect(supabase._db.listings[0].title).toBe('New title');
    });

    it('preserves cross-platform status when re-syncing from a different source', async () => {
        // Listing already crosslisted to grailed; a Facebook sync should not clobber that.
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    {
                        user_id: USER_ID,
                        external_id: 'fb-1',
                        title: 'X',
                        platforms_status: { grailed: 'listed' },
                    },
                ],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        await saveUniversalListings([makeListing({ id: 'fb-1', source: 'facebook' })]);

        expect(supabase._db.listings).toHaveLength(1);
        expect(supabase._db.listings[0].platforms_status).toEqual({
            grailed: 'listed',
            facebook: 'listed',
        });
    });

    it('does not overwrite an existing same-source status (e.g. "sold")', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    {
                        user_id: USER_ID,
                        external_id: 'g-1',
                        title: 'X',
                        platforms_status: { grailed: 'sold' },
                    },
                ],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        await saveUniversalListings([makeListing({ id: 'g-1', source: 'grailed' })]);

        expect(supabase._db.listings[0].platforms_status.grailed).toBe('sold');
    });
});
