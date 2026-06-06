/** @jest-environment node */

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/facebook-marketplace', () => ({
    createFBMarketplaceListing: jest.fn(),
    uploadFBPhoto: jest.fn(),
    mapConditionToFB: jest.fn(() => 'USED_GOOD'),
}));

import { createClient } from '@/utils/supabase/server';
import { createFBMarketplaceListing, uploadFBPhoto } from '@/lib/facebook-marketplace';
import { POST } from '@/app/api/crosslist/facebook/route';
import { createMockSupabase } from '../../helpers/mockSupabase';
import { seedFacebookIntegration } from '../../helpers/mockPlatforms';

const mockCreateClient = jest.mocked(createClient);
const mockCreateFB = jest.mocked(createFBMarketplaceListing);
const mockUploadPhoto = jest.mocked(uploadFBPhoto);

const USER_ID = 'user-1';
const LISTING_ID = 'listing-1';
const FB_LISTING_ID = '1545306466555706';

const makeReq = (body: any) =>
    new Request('http://localhost/api/crosslist/facebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

function seedActiveListing(extra: Partial<any> = {}) {
    return {
        id: LISTING_ID,
        user_id: USER_ID,
        title: 'Vintage Levi',
        description: 'Size 32',
        price: 86,
        condition: 'USED_GOOD',
        currency: 'CAD',
        images: ['https://example.com/img.jpg'],
        platforms_status: {},
        facebook_listing_url: null,
        ...extra,
    };
}

function happyPathMocks() {
    mockUploadPhoto.mockResolvedValue('photo-id-1');
    mockCreateFB.mockResolvedValue({
        data: {
            marketplace_listing_create: {
                listing: { id: FB_LISTING_ID, story: { url: `https://www.facebook.com/marketplace/item/${FB_LISTING_ID}/` } },
            },
        },
    });
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/crosslist/facebook', () => {
    it('happy path: creates listing and updates DB', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [seedActiveListing()],
                user_integrations: [seedFacebookIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        happyPathMocks();

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.listingUrl).toContain('facebook.com/marketplace');

        const row = supabase._db.listings[0];
        expect(row.facebook_listing_url).toContain(FB_LISTING_ID);
        expect(row.platforms_status.facebook).toBe('listed');
        expect(mockCreateFB).toHaveBeenCalledTimes(1);
    });

    it('returns 409 ALREADY_LISTED when platforms_status.facebook === "listed" (no platform API call)', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    seedActiveListing({
                        platforms_status: { facebook: 'listed' },
                        facebook_listing_url: 'https://www.facebook.com/marketplace/item/old/',
                    }),
                ],
                user_integrations: [seedFacebookIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        happyPathMocks();

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        const json = await res.json();

        expect(res.status).toBe(409);
        expect(json.code).toBe('ALREADY_LISTED');
        expect(mockCreateFB).not.toHaveBeenCalled();
        expect(mockUploadPhoto).not.toHaveBeenCalled();
    });

    it('returns 409 when facebook_listing_url is set even if status missing', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    seedActiveListing({
                        facebook_listing_url: 'https://www.facebook.com/marketplace/item/old/',
                    }),
                ],
                user_integrations: [seedFacebookIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        happyPathMocks();

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        expect(res.status).toBe(409);
        expect(mockCreateFB).not.toHaveBeenCalled();
    });

    it('bypasses guard when force=true', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [
                    seedActiveListing({
                        platforms_status: { facebook: 'listed' },
                        facebook_listing_url: 'https://www.facebook.com/marketplace/item/old/',
                    }),
                ],
                user_integrations: [seedFacebookIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        happyPathMocks();

        const res = await POST(makeReq({ listingId: LISTING_ID, force: true }));

        expect(res.status).toBe(200);
        expect(mockCreateFB).toHaveBeenCalledTimes(1);
    });

    it('returns 401 when unauthenticated', async () => {
        const supabase = createMockSupabase({ user: null });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when no images succeed uploading', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [seedActiveListing()],
                user_integrations: [seedFacebookIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        mockUploadPhoto.mockRejectedValue(new Error('upload failed'));

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        expect(res.status).toBe(400);
        expect(mockCreateFB).not.toHaveBeenCalled();
    });

    it('translates session-expired error (1357054) to 401', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [seedActiveListing()],
                user_integrations: [seedFacebookIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        mockUploadPhoto.mockResolvedValue('photo-1');
        mockCreateFB.mockRejectedValue(new Error('Facebook error 1357054'));

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        const json = await res.json();

        expect(res.status).toBe(401);
        expect(json.error).toMatch(/session expired/i);

        // DB is unchanged
        expect(supabase._db.listings[0].facebook_listing_url).toBeNull();
    });

    // --- Additional error-path branches -----------------------------------

    it('returns 400 when listingId is missing', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID } });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({}));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toMatch(/listingId is required/);
    });

    it('returns 404 when the listing is not found / not owned', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID }, seed: { listings: [] } });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        expect(res.status).toBe(404);
    });

    it('returns 400 when the Facebook integration is missing', async () => {
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

    it('returns 400 with a "no images" message when the listing has no photos', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [seedActiveListing({ images: [] })],
                user_integrations: [seedFacebookIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        const json = await res.json();
        expect(res.status).toBe(400);
        expect(json.error).toMatch(/no images/i);
        expect(mockUploadPhoto).not.toHaveBeenCalled();
    });

    it('returns a generic 500 when the platform error is not a session error', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [seedActiveListing()],
                user_integrations: [seedFacebookIntegration(USER_ID)],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);
        mockUploadPhoto.mockResolvedValue('photo-1');
        mockCreateFB.mockRejectedValue(new Error('Boom 500'));

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        const json = await res.json();
        expect(res.status).toBe(500);
        expect(json.error).toBe('Boom 500');
        // DB is left untouched on failure
        expect(supabase._db.listings[0].facebook_listing_url).toBeNull();
    });

    it('returns 500 from the outer catch when stored credentials are corrupt', async () => {
        const supabase = createMockSupabase({
            user: { id: USER_ID },
            seed: {
                listings: [seedActiveListing()],
                user_integrations: [
                    { ...seedFacebookIntegration(USER_ID), access_token: 'not-valid-json' },
                ],
            },
        });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(makeReq({ listingId: LISTING_ID }));
        expect(res.status).toBe(500);
    });
});
