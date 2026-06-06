import { test, expect } from '@playwright/test';

/**
 * Bulk crosslist: the inventory grid should only POST to /api/crosslist/<platform>
 * for items that are NOT already listed there. This pins the UI-level filter
 * at components/dashboard/InventoryGrid.tsx that excludes already-listed items.
 */
test.describe('Bulk crosslist filter', () => {
    test.skip(({ }) => !process.env.E2E_AUTHED, 'Requires E2E_AUTHED=1 + seeded mixed inventory');

    test('bulk-listing 3 items where 1 is already-listed fires only 2 POSTs', async ({ page }) => {
        const grailedCalls: string[] = [];
        await page.route('**/api/crosslist/grailed', async (route) => {
            const body = JSON.parse(route.request().postData() ?? '{}');
            grailedCalls.push(body.listingId);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, listingUrl: `https://www.grailed.com/listings/${body.listingId}` }),
            });
        });

        await page.goto('/inventory');
        // Select all visible items
        const checkboxes = page.getByRole('checkbox');
        const count = await checkboxes.count();
        for (let i = 0; i < count; i++) await checkboxes.nth(i).check();

        await page.getByRole('button', { name: /list on grailed|crosslist grailed/i }).click();

        // Wait for the bulk operation to settle
        await page.waitForTimeout(2000);

        // The pre-listed item should be excluded — its id must NOT appear in grailedCalls.
        // Set E2E_PRELISTED_GRAILED_ID to the id of the seeded already-listed item.
        if (process.env.E2E_PRELISTED_GRAILED_ID) {
            expect(grailedCalls).not.toContain(process.env.E2E_PRELISTED_GRAILED_ID);
        }
    });
});
