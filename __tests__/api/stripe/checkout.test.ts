/** @jest-environment node */
import { NextRequest } from 'next/server';

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'cus_existing' }),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/pay/test' }),
      },
    },
  }))
);

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/supabase/admin', () => ({ createAdminClient: jest.fn() }));

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { POST } from '@/app/api/stripe/checkout/route';
import Stripe from 'stripe';

const mockCreateClient = jest.mocked(createClient);
const mockCreateAdminClient = jest.mocked(createAdminClient);

// Stripe constructor is called at module load; capture instance before clearAllMocks wipes it
let stripeInstance: any;
beforeAll(() => {
  stripeInstance = (Stripe as unknown as jest.Mock).mock.results[0].value;
});

const makeRequest = () =>
  new NextRequest(new URL('http://localhost:3000/api/stripe/checkout'), { method: 'POST' });

function makeAdminMock(singleResult: unknown) {
  const mockSingle = jest.fn().mockResolvedValue({ data: singleResult });
  const mockEq = jest.fn(() => ({ single: mockSingle }));
  const mockSelect = jest.fn(() => ({ eq: mockEq }));
  const mockUpsert = jest.fn().mockResolvedValue({ error: null });
  const mockFrom = jest.fn(() => ({ select: mockSelect, upsert: mockUpsert }));
  return { from: mockFrom, mockUpsert };
}

beforeEach(() => {
  jest.clearAllMocks();
  stripeInstance.customers.create.mockResolvedValue({ id: 'cus_test' });
  stripeInstance.customers.retrieve.mockResolvedValue({ id: 'cus_existing' });
  stripeInstance.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/test' });
});

describe('POST /api/stripe/checkout', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    } as any);

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns checkout url when customer already exists in DB', async () => {
    const user = { id: 'user-1', email: 'a@b.com' };
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    } as any);
    const admin = makeAdminMock({ stripe_customer_id: 'cus_existing' });
    mockCreateAdminClient.mockReturnValue(admin as any);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://checkout.stripe.com/pay/test');
    expect(stripeInstance.customers.create).not.toHaveBeenCalled();
  });

  it('creates a new Stripe customer and upserts to DB when none found', async () => {
    const user = { id: 'user-2', email: 'new@b.com' };
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    } as any);
    const admin = makeAdminMock(null);
    mockCreateAdminClient.mockReturnValue(admin as any);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(stripeInstance.customers.create).toHaveBeenCalledWith({ email: 'new@b.com' });
    expect(admin.mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_customer_id: 'cus_test', status: 'inactive' }),
      expect.anything()
    );
  });

  it('passes supabase_user_id metadata to stripe.checkout.sessions.create', async () => {
    const user = { id: 'user-3', email: 'c@b.com' };
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    } as any);
    const admin = makeAdminMock({ stripe_customer_id: 'cus_existing' });
    mockCreateAdminClient.mockReturnValue(admin as any);

    await POST(makeRequest());
    expect(stripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { supabase_user_id: 'user-3' } })
    );
  });
});
