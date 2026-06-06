# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bulk-crosslist-filter.spec.ts >> Bulk crosslist filter >> bulk-listing 3 items where 1 is already-listed fires only 2 POSTs
- Location: e2e/bulk-crosslist-filter.spec.ts:11:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3000/inventory", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Bulk crosslist: the inventory grid should only POST to /api/crosslist/<platform>
  5  |  * for items that are NOT already listed there. This pins the UI-level filter
  6  |  * at components/dashboard/InventoryGrid.tsx that excludes already-listed items.
  7  |  */
  8  | test.describe('Bulk crosslist filter', () => {
  9  |     test.skip(({ }) => !process.env.E2E_AUTHED, 'Requires E2E_AUTHED=1 + seeded mixed inventory');
  10 | 
  11 |     test('bulk-listing 3 items where 1 is already-listed fires only 2 POSTs', async ({ page }) => {
  12 |         const grailedCalls: string[] = [];
  13 |         await page.route('**/api/crosslist/grailed', async (route) => {
  14 |             const body = JSON.parse(route.request().postData() ?? '{}');
  15 |             grailedCalls.push(body.listingId);
  16 |             await route.fulfill({
  17 |                 status: 200,
  18 |                 contentType: 'application/json',
  19 |                 body: JSON.stringify({ success: true, listingUrl: `https://www.grailed.com/listings/${body.listingId}` }),
  20 |             });
  21 |         });
  22 | 
> 23 |         await page.goto('/inventory');
     |                    ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  24 |         // Select all visible items
  25 |         const checkboxes = page.getByRole('checkbox');
  26 |         const count = await checkboxes.count();
  27 |         for (let i = 0; i < count; i++) await checkboxes.nth(i).check();
  28 | 
  29 |         await page.getByRole('button', { name: /list on grailed|crosslist grailed/i }).click();
  30 | 
  31 |         // Wait for the bulk operation to settle
  32 |         await page.waitForTimeout(2000);
  33 | 
  34 |         // The pre-listed item should be excluded — its id must NOT appear in grailedCalls.
  35 |         // Set E2E_PRELISTED_GRAILED_ID to the id of the seeded already-listed item.
  36 |         if (process.env.E2E_PRELISTED_GRAILED_ID) {
  37 |             expect(grailedCalls).not.toContain(process.env.E2E_PRELISTED_GRAILED_ID);
  38 |         }
  39 |     });
  40 | });
  41 | 
```