/** @jest-environment node */

jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn().mockResolvedValue({ getAll: () => [], set: () => {} }) }));

import { createServerClient } from '@supabase/ssr';
import { GET } from '@/app/api/ebay/auth/callback/route';

const mockCreateServerClient = jest.mocked(createServerClient);

function makeSupabase({ user, dbError = null }: { user: { id: string } | null; dbError?: any }) {
    const upsert = jest.fn().mockResolvedValue({ error: dbError });
    const client = {
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: user ? null : { message: 'no session' } }) },
        from: jest.fn(() => ({ upsert })),
    };
    return { client, upsert };
}

const makeReq = (params: Record<string, string> = {}) => {
    const url = new URL('http://localhost:3000/api/ebay/auth/callback');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return new Request(url.toString());
};

const location = (res: Response) => decodeURIComponent(res.headers.get('location') ?? '');

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.EBAY_APP_ID = 'app';
    process.env.EBAY_CERT_ID = 'cert';
    process.env.EBAY_REDIRECT_URI = 'https://app/cb';
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/ebay/auth/callback', () => {
    it('redirects with an error when no code is present', async () => {
        const res = await GET(makeReq());
        expect(location(res)).toContain('/account?error=No code provided');
    });

    it('redirects to login when there is no user session', async () => {
        mockCreateServerClient.mockReturnValue(makeSupabase({ user: null }).client as any);
        const res = await GET(makeReq({ code: 'abc' }));
        expect(location(res)).toContain('/login');
    });

    it('redirects with an error when token exchange fails', async () => {
        mockCreateServerClient.mockReturnValue(makeSupabase({ user: { id: 'user-1' } }).client as any);
        global.fetch = jest.fn().mockResolvedValue({ ok: false, text: async () => 'invalid_grant' }) as any;

        const res = await GET(makeReq({ code: 'abc' }));
        expect(location(res)).toContain('error=Failed to exchange token');
    });

    it('redirects with an error when the DB upsert fails', async () => {
        const sb = makeSupabase({ user: { id: 'user-1' }, dbError: { message: 'db down' } });
        mockCreateServerClient.mockReturnValue(sb.client as any);
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 7200 }),
        }) as any;

        const res = await GET(makeReq({ code: 'abc' }));
        expect(location(res)).toContain('error=Failed to save connection');
    });

    it('stores tokens and redirects with success on the happy path', async () => {
        const sb = makeSupabase({ user: { id: 'user-1' } });
        mockCreateServerClient.mockReturnValue(sb.client as any);
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 7200 }),
        }) as any;

        const res = await GET(makeReq({ code: 'abc' }));
        expect(location(res)).toContain('success=eBay connected');
        expect(sb.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ user_id: 'user-1', platform: 'ebay', access_token: 'a', refresh_token: 'r' }),
            { onConflict: 'user_id,platform' }
        );
    });

    it('redirects with an internal error when the token fetch throws', async () => {
        mockCreateServerClient.mockReturnValue(makeSupabase({ user: { id: 'user-1' } }).client as any);
        global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;

        const res = await GET(makeReq({ code: 'abc' }));
        expect(location(res)).toContain('error=Internal server error');
    });
});
