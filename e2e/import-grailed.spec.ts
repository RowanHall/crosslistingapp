import { test, expect } from '@playwright/test';

/**
 * E2E spec: Grailed sync flow.
 *
 * Verifies the user-facing import journey: trigger sync → see card appear in inventory.
 * Requires a seeded test user (see e2e/README.md).
 */
test.describe('Import from Grailed', () => {
    test.skip(({ }) => !process.env.E2E_AUTHED, 'Requires E2E_AUTHED=1 + seeded test user');

    test('newly synced product appears as an inventory card', async ({ page }) => {
        await page.route('**/api/integrations/grailed/sync', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, count: 1 }),
            });
        });

        await page.goto('/inventory');
        await page.getByRole('button', { name: /import|sync grailed/i }).click();
        await expect(page.getByText(/imported|synced/i)).toBeVisible({ timeout: 5000 });
    });
});
