/**
 * Helpers for stubbing platform-side lib modules in route-handler integration tests.
 *
 * We mock `@/lib/{grailed,facebook-marketplace,shopify,storage}` at the module level
 * (in each test file via jest.mock), then use these factories to drive their
 * return values per-test.
 */

export const fakeStoragePassthrough = (_supabase: unknown, url: string) => Promise.resolve(url);

export const fakeStorageFail = (_supabase: unknown, _url: string) => Promise.resolve(null);

export interface CallLog<T> {
    calls: T[];
    reset: () => void;
}

export function makeCallLog<T>(): CallLog<T> {
    const log: CallLog<T> = {
        calls: [],
        reset: () => { log.calls.length = 0; },
    };
    return log;
}

/**
 * Build a fake Grailed integration row (matching what the crosslist route reads).
 */
export function seedGrailedIntegration(userId: string) {
    return {
        user_id: userId,
        platform: 'grailed',
        access_token: JSON.stringify({
            user_id: 99,
            device_id: 'device-uuid',
            csrf_token: 'csrf-abc',
        }),
        refresh_token: 'cookie-string',
        created_at: '2026-01-01T00:00:00Z',
    };
}

export function seedFacebookIntegration(userId: string) {
    return {
        user_id: userId,
        platform: 'facebook',
        access_token: JSON.stringify({
            fb_dtsg: 'dtsg',
            lsd: 'lsd',
            user_id: '12345',
        }),
        refresh_token: 'fb-cookies',
        created_at: '2026-01-01T00:00:00Z',
    };
}

export function seedShopifyIntegration(userId: string) {
    return {
        user_id: userId,
        platform: 'shopify',
        access_token: JSON.stringify({
            store_url: 'test-shop.myshopify.com',
            access_token: 'shpat_test',
        }),
        refresh_token: null,
        created_at: '2026-01-01T00:00:00Z',
    };
}
