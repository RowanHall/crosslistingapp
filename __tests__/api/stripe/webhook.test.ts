/** @jest-environment node */

jest.mock('@/lib/stripe', () => ({
    stripe: {
        webhooks: { constructEvent: jest.fn() },
        subscriptions: { retrieve: jest.fn() },
    },
}));
jest.mock('@/utils/supabase/admin', () => ({ createAdminClient: jest.fn() }));

import { POST } from '@/app/api/stripe/webhook/route';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/utils/supabase/admin';

const mockConstructEvent = jest.mocked(stripe.webhooks.constructEvent);
const mockRetrieve = jest.mocked(stripe.subscriptions.retrieve);
const mockCreateAdmin = jest.mocked(createAdminClient);

/** Minimal chainable admin client capturing upsert/update payloads. */
function makeAdmin() {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ upsert, update }));
    return { client: { from } as any, from, upsert, update, eq };
}

function makeReq(body = '{}', sig: string | null = 'sig_test') {
    return {
        text: async () => body,
        headers: { get: (k: string) => (k === 'stripe-signature' ? sig : null) },
    } as any;
}

beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
});

describe('POST /api/stripe/webhook', () => {
    it('returns 400 when signature verification fails', async () => {
        mockConstructEvent.mockImplementation(() => {
            throw new Error('bad signature');
        });

        const res = await POST(makeReq());
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toMatch(/bad signature/);
    });

    it('upserts a subscription on checkout.session.completed', async () => {
        const admin = makeAdmin();
        mockCreateAdmin.mockReturnValue(admin.client);
        mockConstructEvent.mockReturnValue({
            type: 'checkout.session.completed',
            data: {
                object: {
                    mode: 'subscription',
                    customer: 'cus_1',
                    subscription: 'sub_1',
                    metadata: { supabase_user_id: 'user-1' },
                },
            },
        } as any);
        mockRetrieve.mockResolvedValue({
            status: 'active',
            items: { data: [{ current_period_end: 1800000000 }] },
        } as any);

        const res = await POST(makeReq());
        expect(res.status).toBe(200);
        expect(admin.from).toHaveBeenCalledWith('subscriptions');
        expect(admin.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: 'user-1',
                stripe_customer_id: 'cus_1',
                stripe_subscription_id: 'sub_1',
                status: 'active',
            }),
            { onConflict: 'user_id' }
        );
    });

    it('ignores non-subscription checkout sessions', async () => {
        const admin = makeAdmin();
        mockCreateAdmin.mockReturnValue(admin.client);
        mockConstructEvent.mockReturnValue({
            type: 'checkout.session.completed',
            data: { object: { mode: 'payment' } },
        } as any);

        const res = await POST(makeReq());
        expect(res.status).toBe(200);
        expect(admin.upsert).not.toHaveBeenCalled();
        expect(mockRetrieve).not.toHaveBeenCalled();
    });

    it('skips upsert when supabase_user_id metadata is missing', async () => {
        const admin = makeAdmin();
        mockCreateAdmin.mockReturnValue(admin.client);
        mockConstructEvent.mockReturnValue({
            type: 'checkout.session.completed',
            data: {
                object: { mode: 'subscription', customer: 'cus_1', subscription: 'sub_1', metadata: {} },
            },
        } as any);

        const res = await POST(makeReq());
        expect(res.status).toBe(200);
        expect(admin.upsert).not.toHaveBeenCalled();
        expect(mockRetrieve).not.toHaveBeenCalled();
    });

    it('updates status + period end on customer.subscription.updated', async () => {
        const admin = makeAdmin();
        mockCreateAdmin.mockReturnValue(admin.client);
        mockConstructEvent.mockReturnValue({
            type: 'customer.subscription.updated',
            data: { object: { id: 'sub_1', status: 'past_due', items: { data: [{ current_period_end: 1700000000 }] } } },
        } as any);

        const res = await POST(makeReq());
        expect(res.status).toBe(200);
        expect(admin.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'past_due' })
        );
        expect(admin.eq).toHaveBeenCalledWith('stripe_subscription_id', 'sub_1');
    });

    it('marks a subscription canceled on customer.subscription.deleted', async () => {
        const admin = makeAdmin();
        mockCreateAdmin.mockReturnValue(admin.client);
        mockConstructEvent.mockReturnValue({
            type: 'customer.subscription.deleted',
            data: { object: { id: 'sub_1' } },
        } as any);

        const res = await POST(makeReq());
        expect(res.status).toBe(200);
        expect(admin.update).toHaveBeenCalledWith({ status: 'canceled' });
        expect(admin.eq).toHaveBeenCalledWith('stripe_subscription_id', 'sub_1');
    });

    it('acknowledges unhandled event types without touching the DB', async () => {
        const admin = makeAdmin();
        mockCreateAdmin.mockReturnValue(admin.client);
        mockConstructEvent.mockReturnValue({
            type: 'invoice.paid',
            data: { object: {} },
        } as any);

        const res = await POST(makeReq());
        expect(res.status).toBe(200);
        expect(admin.upsert).not.toHaveBeenCalled();
        expect(admin.update).not.toHaveBeenCalled();
    });
});
