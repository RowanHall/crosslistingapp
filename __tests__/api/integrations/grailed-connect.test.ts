/** @jest-environment node */

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));

import { createClient } from '@/utils/supabase/server';
import { POST, OPTIONS } from '@/app/api/integrations/grailed/route';
import { createMockSupabase } from '../../helpers/mockSupabase';

const mockCreateClient = jest.mocked(createClient);
const USER_ID = 'user-1';

const makeReq = (body: any) =>
    new Request('http://localhost/api/integrations/grailed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('OPTIONS /api/integrations/grailed', () => {
    it('returns 204 with CORS headers', async () => {
        const res = await OPTIONS();
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
});

describe('POST /api/integrations/grailed', () => {
    it('returns 401 when unauthenticated', async () => {
        mockCreateClient.mockResolvedValue(createMockSupabase({ user: null }) as any);
        const res = await POST(makeReq({ cookies: 'c', user_id: '1' }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when cookies or user_id are missing', async () => {
        mockCreateClient.mockResolvedValue(createMockSupabase({ user: { id: USER_ID } }) as any);
        const res = await POST(makeReq({ cookies: 'c' }));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toMatch(/required/);
    });

    it('upserts grailed credentials and returns success', async () => {
        const supabase = createMockSupabase({ user: { id: USER_ID }, seed: { user_integrations: [] } });
        mockCreateClient.mockResolvedValue(supabase as any);

        const res = await POST(
            makeReq({ cookies: 'cookie-str', user_id: '99', device_id: 'dev', csrf_token: 'tok' })
        );
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);

        const row = supabase._db.user_integrations[0];
        expect(row.platform).toBe('grailed');
        expect(row.refresh_token).toBe('cookie-str');
        expect(JSON.parse(row.access_token)).toEqual({ user_id: '99', device_id: 'dev', csrf_token: 'tok' });
    });
});
