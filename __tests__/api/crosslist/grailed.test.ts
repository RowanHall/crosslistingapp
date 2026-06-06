/** @jest-environment node */

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/grailed', () => ({
    getGrailedReturnAddressId: jest.fn(),
    searchGrailedDesigner: jest.fn(),
    presignGrailedPhoto: jest.fn(),
    uploadPhotoToGrailed: jest.fn(),
    createGrailedListing: jest.fn(),
}));

import { createClient } from '@/utils/supabase/server';
import {
    getGrailedReturnAddressId,
    searchGrailedDesigner,
    presignGrailedPhoto,
    uploadPhotoToGrailed,
    createGrailedListing,
} from '@/lib/grailed';
import { POST } from '@/app/api/crosslist/grailed/route';
import { createMockSupabase } from '../../helpers/mockSupabase';
import { seedGrailedIntegration } from '../../helpers/mockPlatforms';

const mockCreateClient = jest.mocked(createClient);
const mockGetReturnAddr = jest.mocked(getGrailedReturnAddressId);
const mockSearchDesigner = jest.mocked(searchGrailedDesigner);
const mockPresign = jest.mocked(presignGrailedPhoto);
const mockUploadPhoto = jest.mocked(uploadPhotoToGrailed);
const mockCreate = jest.mocked(createGrailedListing);

const USER_ID = 'user-1';
const LISTING_ID = 'listing-1';

const makeReq = (body: any) =>
    new Request('http://localhost/api/crosslist/grailed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

function seedActiveListing(extra: Partial<any> = {}) {
    return {
        id: LISTING_ID,
        user_id: USER_ID,
        title: 'Bape Hoodie',
        description: 'Nice',
        price: 219,
        condition: 'USED_EXCELLENT',
        brand: 'Bape',
        size: 'M',
        currency: 'USD',
        images: ['https://example.com/img.jpg'],
        platforms_status: {},
        grailed_listing_url: null,
        ...extra,
    };
}

function happyPathMocks() {
    mockGetReturnAddr.mockResolvedValue('addr-1');
    mockSearchDesigner.mockResolvedValue({ id: 38, name: 'Bape', slug: 'bape' } as any);
    mockPresign.mockResolvedValue({} as any);
    mockUploadPhoto.mockResolvedValue({ cdnUrl: 'https://media-assets.grailed.com/x.jpg' } as any);
    mockCreate.mockResolvedValue({ url: 'https://www.grailed.com/listings/new-listing-id' } as any);
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/crosslist/grailed', () => {
    it('happy path: creates listing and updates DB', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [seedActiveListing()],
                user_integrations: [seedGrailedIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        happyPathMocks();

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.listingUrl).toContain('grailed.com');

        const row = supabase._db.listings[0];
        expect(row.grailed_listing_url).toBe('https://www.grailed.com/listings/new-listing-id');
        expect(row.platforms_status.grailed).toBe('listed');
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('returns 409 ALREADY_LISTED when platforms_status.grailed === "listed" (no platform API call)', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    seedActiveListing({
                        platforms_status: { grailed: 'listed' },
                        grailed_listing_url: 'https://www.grailed.com/listings/old',
                    }),
                ],
                user_integrations: [seedGrailedIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        happyPathMocks();

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        const json = await res.json();

        expect(res.status).toBe(409);
        expect(json.code).toBe('ALREADY_LISTED');
        expect(json.listingUrl).toBe('https://www.grailed.com/listings/old');

        // Critical assertion: no outbound Grailed call was made
        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockGetReturnAddr).not.toHaveBeenCalled();
    });

    it('returns 409 ALREADY_LISTED when grailed_listing_url is set even if status is missing', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    seedActiveListing({
                        grailed_listing_url: 'https://www.grailed.com/listings/old',
                        platforms_status: {}, // status not set, but URL is
                    }),
                ],
                user_integrations: [seedGrailedIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        happyPathMocks();

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        expect(res.status).toBe(409);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('bypasses guard when force=true (re-post / "Update" flow)', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    seedActiveListing({
                        platforms_status: { grailed: 'listed' },
                        grailed_listing_url: 'https://www.grailed.com/listings/old',
                    }),
                ],
                user_integrations: [seedGrailedIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        happyPathMocks();

        const res = await POST(makeReq({ listingId: LISTING_ID, force: true }));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.listingUrl).toBe('https://www.grailed.com/listings/new-listing-id');
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('returns 401 when unauthenticated', async () => {
        const supabase = createMockSupabase({ user: null });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when listingId missing', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID } });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({}));
        expect(res.status).toBe(400);
    });

    it('returns 404 when listing not owned by user', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID }, seed: { listings: [] } });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        expect(res.status).toBe(404);
    });

    it('returns 400 when Grailed integration is missing', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: { listings: [seedActiveListing()], user_integrations: [] },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        const json = await res.json();
        expect(res.status).toBe(400);
        expect(json.error).toMatch(/not connected/i);
    });

    it('platform error does NOT mutate the DB', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [seedActiveListing()],
                user_integrations: [seedGrailedIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        mockGetReturnAddr.mockResolvedValue('addr-1');
        mockSearchDesigner.mockResolvedValue({ id: 38, name: 'Bape' } as any);
        mockPresign.mockResolvedValue({} as any);
        mockUploadPhoto.mockResolvedValue({ cdnUrl: 'x' } as any);
        mockCreate.mockRejectedValue(new Error('Grailed 500'));

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        expect(res.status).toBe(500);

        const row = supabase._db.listings[0];
        expect(row.grailed_listing_url).toBeNull();
        expect(row.platforms_status).toEqual({});
    });
});
