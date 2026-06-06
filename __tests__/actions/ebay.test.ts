/** @jest-environment node */

jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn().mockResolvedValue({ getAll: () => [], set: () => {} }) }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

import { createServerClient } from '@supabase/ssr';
import {
    disconnectEbayAccount,
    getEbayConnectionStatus,
    publishToEbay,
} from '@/actions/ebay';

const mockCreateServerClient = jest.mocked(createServerClient);

interface SupabaseFixture {
    user: { id: string } | null;
    listing?: any;
    integration?: any;
}

function makeSupabase({ user, listing, integration }: SupabaseFixture) {
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const deleteMatch = jest.fn().mockResolvedValue({ error: null });

    const from = jest.fn((table: string) => {
        const builder: any = {
            select: jest.fn(() => builder),
            eq: jest.fn(() => builder),
            single: jest.fn(async () => {
                if (table === 'listings') {
                    return { data: listing ?? null, error: listing ? null : { message: 'not found' } };
                }
                if (table === 'user_integrations') {
                    return { data: integration ?? null, error: integration ? null : { message: 'not connected' } };
                }
                return { data: null, error: null };
            }),
            update: jest.fn(() => ({ eq: updateEq })),
            delete: jest.fn(() => ({ match: deleteMatch })),
        };
        return builder;
    });

    const client = {
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
        from,
    };
    return { client, from, updateEq, deleteMatch };
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('disconnectEbayAccount', () => {
    it('throws when the user is not authenticated', async () => {
        const sb = makeSupabase({ user: null });
        mockCreateServerClient.mockReturnValue(sb.client as any);
        await expect(disconnectEbayAccount()).rejects.toThrow(/not authenticated/i);
    });

    it('deletes the ebay integration for the current user', async () => {
        const sb = makeSupabase({ user: { id: 'user-1' } });
        mockCreateServerClient.mockReturnValue(sb.client as any);

        await expect(disconnectEbayAccount()).resolves.toEqual({ success: true });
        expect(sb.from).toHaveBeenCalledWith('user_integrations');
        expect(sb.deleteMatch).toHaveBeenCalledWith({ user_id: 'user-1', platform: 'ebay' });
    });
});

describe('getEbayConnectionStatus', () => {
    it('returns false when unauthenticated', async () => {
        const sb = makeSupabase({ user: null });
        mockCreateServerClient.mockReturnValue(sb.client as any);
        await expect(getEbayConnectionStatus()).resolves.toBe(false);
    });

    it('returns true when an integration row exists', async () => {
        const sb = makeSupabase({ user: { id: 'user-1' }, integration: { id: 'int-1' } });
        mockCreateServerClient.mockReturnValue(sb.client as any);
        await expect(getEbayConnectionStatus()).resolves.toBe(true);
    });

    it('returns false when no integration row exists', async () => {
        const sb = makeSupabase({ user: { id: 'user-1' } });
        mockCreateServerClient.mockReturnValue(sb.client as any);
        await expect(getEbayConnectionStatus()).resolves.toBe(false);
    });
});

describe('publishToEbay', () => {
    const listing = {
        id: 'listing-1',
        title: 'Cool Item',
        description: 'desc',
        price: 49,
        sku: 'SKU1',
        images: ['https://img/1.jpg'],
        platforms_status: {},
    };

    it('throws when unauthenticated', async () => {
        const sb = makeSupabase({ user: null });
        mockCreateServerClient.mockReturnValue(sb.client as any);
        await expect(publishToEbay('listing-1')).rejects.toThrow(/not authenticated/i);
    });

    it('throws when the listing is not found', async () => {
        const sb = makeSupabase({ user: { id: 'user-1' } });
        mockCreateServerClient.mockReturnValue(sb.client as any);
        await expect(publishToEbay('listing-1')).rejects.toThrow(/Listing not found/);
    });

    it('throws when the eBay integration is missing', async () => {
        const sb = makeSupabase({ user: { id: 'user-1' }, listing });
        mockCreateServerClient.mockReturnValue(sb.client as any);
        await expect(publishToEbay('listing-1')).rejects.toThrow(/Not connected to eBay/);
    });

    it('throws when a required selling policy is missing', async () => {
        const sb = makeSupabase({
            user: { id: 'user-1' },
            listing,
            integration: { access_token: 'tok' },
        });
        mockCreateServerClient.mockReturnValue(sb.client as any);
        // First policy fetch returns no policies
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ fulfillmentPolicies: [] }) }) as any;

        await expect(publishToEbay('listing-1')).rejects.toThrow(/No fulfillment Policy/);
    });

    it('runs the full create→offer→publish flow and updates the DB', async () => {
        const sb = makeSupabase({
            user: { id: 'user-1' },
            listing,
            integration: { access_token: 'tok' },
        });
        mockCreateServerClient.mockReturnValue(sb.client as any);

        global.fetch = jest
            .fn()
            // 3 policy lookups
            .mockResolvedValueOnce({ ok: true, json: async () => ({ fulfillmentPolicies: [{ fulfillmentPolicyId: 'f1' }] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ paymentPolicies: [{ paymentPolicyId: 'p1' }] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ returnPolicies: [{ returnPolicyId: 'r1' }] }) })
            // create inventory item (PUT, 204 no body)
            .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' })
            // create offer
            .mockResolvedValueOnce({ ok: true, json: async () => ({ offerId: 'offer-1' }) })
            // publish offer
            .mockResolvedValueOnce({ ok: true, json: async () => ({ listingId: 'ebay-999' }) }) as any;

        const result = await publishToEbay('listing-1');
        expect(result).toEqual({ success: true, ebay_item_id: 'ebay-999' });
        expect(sb.updateEq).toHaveBeenCalledWith('id', 'listing-1');
    });

    it('throws when offer creation fails', async () => {
        const sb = makeSupabase({
            user: { id: 'user-1' },
            listing,
            integration: { access_token: 'tok' },
        });
        mockCreateServerClient.mockReturnValue(sb.client as any);

        global.fetch = jest
            .fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ fulfillmentPolicies: [{ fulfillmentPolicyId: 'f1' }] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ paymentPolicies: [{ paymentPolicyId: 'p1' }] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ returnPolicies: [{ returnPolicyId: 'r1' }] }) })
            .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' })
            .mockResolvedValueOnce({ ok: false, json: async () => ({ errors: [{ message: 'offer rejected' }] }) }) as any;

        await expect(publishToEbay('listing-1')).rejects.toThrow(/offer rejected/);
    });
});
