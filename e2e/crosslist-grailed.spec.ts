import { test, expect } from '@playwright/test';

/**
 * E2E spec: Crosslist to Grailed happy path.
 * Mocks the platform-side response so we don't hit live Grailed.
 */
test.describe('Crosslist to Grailed', () => {
    test.skip(({ }) => !process.env.E2E_AUTHED, 'Requires E2E_AUTHED=1 + seeded test user with a listing');

    test('clicking "List on Grailed" calls API and flips button to listed state', async ({ page }) => {
        const calls: any[] = [];
        await page.route('**/api/crosslist/grailed', async (route) => {
            try { calls.push(JSON.parse(route.request().postData() ?? '{}')); } catch {}
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    listingUrl: 'https://www.grailed.com/listings/new-test-id',
                }),
            });
        });

        await page.goto(`/listing/${process.env.E2E_LISTING_ID ?? 'TODO'}`);
        await page.getByRole('button', { name: /list on grailed|crosslist grailed/i }).click();

        await expect(page.getByText(/listed|success|grailed\.com/i)).toBeVisible({ timeout: 5000 });
        expect(calls).toHaveLength(1);
        expect(calls[0].force).toBeFalsy();
    });
});
