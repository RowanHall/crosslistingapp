/** @jest-environment node */

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));

import { createClient } from '@/utils/supabase/server';
import { GET } from '@/app/auth/callback/route';

const mockCreateClient = jest.mocked(createClient);

function makeExchangeMock(error: Error | null = null) {
  return jest.fn().mockResolvedValue({ error });
}

const makeRequest = (search: string) => new Request(`http://localhost${search}`);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /auth/callback', () => {
  it('redirects to /?checkout=true when returnTo=purchase and exchange succeeds', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession: makeExchangeMock() },
    } as any);

    const res = await GET(makeRequest('/auth/callback?code=abc&returnTo=purchase'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/?checkout=true');
  });

  it('redirects to /inventory by default when exchange succeeds', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession: makeExchangeMock() },
    } as any);

    const res = await GET(makeRequest('/auth/callback?code=abc'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/inventory');
  });

  it('redirects to custom next param when provided', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession: makeExchangeMock() },
    } as any);

    const res = await GET(makeRequest('/auth/callback?code=abc&next=/account'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/account');
  });

  it('redirects to /login?message=... when exchange returns an error', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession: makeExchangeMock(new Error('fail')) },
    } as any);

    const res = await GET(makeRequest('/auth/callback?code=abc'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'http://localhost/login?message=Could%20not%20login%20with%20magic%20link'
    );
  });

  it('redirects to error page when no code param', async () => {
    const res = await GET(makeRequest('/auth/callback'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'http://localhost/login?message=Could%20not%20login%20with%20magic%20link'
    );
  });
});
