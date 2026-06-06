import { test, expect } from '@playwright/test';

test.describe('Crosslist guard (UI layer)', () => {
    test('shows "already listed" message when API returns 409 ALREADY_LISTED', async ({ page }) => {
        await page.route('**/api/crosslist/grailed', async (route) => {
            await route.fulfill({
                status: 409,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: 'Already listed on Grailed',
                    code: 'ALREADY_LISTED',
                    listingUrl: 'https://www.grailed.com/listings/old-id',
                }),
            });
        });
        test.skip(true, 'Requires authenticated session — enable with seeded test user');
    });

    test('bulk crosslist UI filters out already-listed items', async () => {
        test.skip(true, 'Requires authenticated session + seeded inventory');
    });

    test('double-import is idempotent at the inventory level', async () => {
        test.skip(true, 'Requires authenticated session + Supabase access for assertion');
    });
});
