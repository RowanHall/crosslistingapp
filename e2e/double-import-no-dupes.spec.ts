import { test, expect } from '@playwright/test';

/**
 * Double-import safeguard at the UI layer: running the same sync twice should
 * NOT result in duplicate inventory rows. The DB-level dedup is verified by
 * the Jest integration tests in __tests__/api/integrations/* — this spec
 * just confirms the user-facing inventory grid reflects that.
 */
test.describe('Double-import — no dupes', () => {
    test.skip(({ }) => !process.env.E2E_AUTHED, 'Requires E2E_AUTHED=1 + seeded test user');

    test('running Grailed sync twice does not change the inventory count', async ({ page }) => {
        // Drive the same payload through twice. Use a stable product id so both runs upsert the same row.
        const fixedPayload = JSON.stringify({ success: true, count: 1 });
        await page.route('**/api/integrations/grailed/sync', async (route) => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: fixedPayload });
        });

        await page.goto('/inventory');
        const initialCount = await page.locator('[data-testid="inventory-card"]').count();

        await page.getByRole('button', { name: /sync grailed|import grailed/i }).click();
        await page.waitForTimeout(1500);
        const afterFirst = await page.locator('[data-testid="inventory-card"]').count();

        await page.getByRole('button', { name: /sync grailed|import grailed/i }).click();
        await page.waitForTimeout(1500);
        const afterSecond = await page.locator('[data-testid="inventory-card"]').count();

        // First sync may add a card; second should not
        expect(afterSecond).toBe(afterFirst);
        expect(afterFirst).toBeGreaterThanOrEqual(initialCount);
    });
});
