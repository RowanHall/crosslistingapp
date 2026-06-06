/** @jest-environment node */
import { NextRequest } from 'next/server';

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    subscriptions: { list: jest.fn().mockResolvedValue({ data: [] }) },
  }))
);

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/supabase/admin', () => ({ createAdminClient: jest.fn() }));

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { POST } from '@/app/api/stripe/sync/route';
import Stripe from 'stripe';

const mockCreateClient = jest.mocked(createClient);
const mockCreateAdminClient = jest.mocked(createAdminClient);

let stripeInstance: any;
beforeAll(() => {
  stripeInstance = (Stripe as unknown as jest.Mock).mock.results[0].value;
});

const makeRequest = () =>
  new NextRequest(new URL('http://localhost:3000/api/stripe/sync'), { method: 'POST' });

function makeAdminMock(singleResult: unknown) {
  const mockSingle = jest.fn().mockResolvedValue({ data: singleResult });
  const mockEq = jest.fn(() => ({ single: mockSingle }));
  const mockSelect = jest.fn(() => ({ eq: mockEq }));
  const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
  const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));
  const mockFrom = jest.fn(() => ({ select: mockSelect, update: mockUpdate }));
  return { from: mockFrom, mockUpdate };
}

beforeEach(() => {
  jest.clearAllMocks();
  stripeInstance.subscriptions.list.mockResolvedValue({ data: [] });
});

describe('POST /api/stripe/sync', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    } as any);

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when no stripe_customer_id in DB', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    } as any);
    mockCreateAdminClient.mockReturnValue(makeAdminMock(null) as any);

    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns { status: "inactive" } when Stripe returns no subscriptions', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    } as any);
    mockCreateAdminClient.mockReturnValue(makeAdminMock({ stripe_customer_id: 'cus_test' }) as any);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('inactive');
  });

  it('updates Supabase with status: active and stripe_subscription_id when sub is active', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    } as any);
    const admin = makeAdminMock({ stripe_customer_id: 'cus_test' });
    mockCreateAdminClient.mockReturnValue(admin as any);
    stripeInstance.subscriptions.list.mockResolvedValue({
      data: [{
        id: 'sub_123',
        status: 'active',
        items: { data: [{ current_period_end: 1800000000 }] },
      }],
    });

    await POST(makeRequest());
    expect(admin.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_subscription_id: 'sub_123', status: 'active' })
    );
  });

  it('returns { status: "active" } when Stripe sub is active', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    } as any);
    mockCreateAdminClient.mockReturnValue(makeAdminMock({ stripe_customer_id: 'cus_test' }) as any);
    stripeInstance.subscriptions.list.mockResolvedValue({
      data: [{
        id: 'sub_123',
        status: 'active',
        items: { data: [{ current_period_end: 1800000000 }] },
      }],
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('active');
  });
});
