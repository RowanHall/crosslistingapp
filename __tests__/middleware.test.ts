/** @jest-environment node */
import { NextRequest } from 'next/server';

const mockGetUser = jest.fn();
const mockSingle = jest.fn();
const mockEq = jest.fn(() => ({ single: mockSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

import { updateSession } from '@/utils/supabase/middleware';

const makeRequest = (path: string) =>
  new NextRequest(new URL(path, 'http://localhost:3000'));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateSession middleware', () => {
  it('passes through for pathname = "/"', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await updateSession(makeRequest('/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('passes through for /billing/success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await updateSession(makeRequest('/billing/success'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects to /login when no user and accessing /inventory', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await updateSession(makeRequest('/inventory'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('passes through when user has active subscription', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSingle.mockResolvedValue({ data: { status: 'active' } });

    const res = await updateSession(makeRequest('/inventory'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects to /#pricing when user has inactive subscription', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSingle.mockResolvedValue({ data: { status: 'inactive' } });

    const res = await updateSession(makeRequest('/inventory'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/#pricing');
  });

  it('redirects to /#pricing when user has no subscription row', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSingle.mockResolvedValue({ data: null });

    const res = await updateSession(makeRequest('/inventory'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/#pricing');
  });

  it('passes through for /api/* routes without redirecting', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await updateSession(makeRequest('/api/anything'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});
