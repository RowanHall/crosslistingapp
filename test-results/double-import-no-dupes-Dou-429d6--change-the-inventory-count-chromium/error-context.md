# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: double-import-no-dupes.spec.ts >> Double-import — no dupes >> running Grailed sync twice does not change the inventory count
- Location: e2e/double-import-no-dupes.spec.ts:12:9

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
  4  |  * Double-import safeguard at the UI layer: running the same sync twice should
  5  |  * NOT result in duplicate inventory rows. The DB-level dedup is verified by
  6  |  * the Jest integration tests in __tests__/api/integrations/* — this spec
  7  |  * just confirms the user-facing inventory grid reflects that.
  8  |  */
  9  | test.describe('Double-import — no dupes', () => {
  10 |     test.skip(({ }) => !process.env.E2E_AUTHED, 'Requires E2E_AUTHED=1 + seeded test user');
  11 | 
  12 |     test('running Grailed sync twice does not change the inventory count', async ({ page }) => {
  13 |         // Drive the same payload through twice. Use a stable product id so both runs upsert the same row.
  14 |         const fixedPayload = JSON.stringify({ success: true, count: 1 });
  15 |         await page.route('**/api/integrations/grailed/sync', async (route) => {
  16 |             await route.fulfill({ status: 200, contentType: 'application/json', body: fixedPayload });
  17 |         });
  18 | 
> 19 |         await page.goto('/inventory');
     |                    ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  20 |         const initialCount = await page.locator('[data-testid="inventory-card"]').count();
  21 | 
  22 |         await page.getByRole('button', { name: /sync grailed|import grailed/i }).click();
  23 |         await page.waitForTimeout(1500);
  24 |         const afterFirst = await page.locator('[data-testid="inventory-card"]').count();
  25 | 
  26 |         await page.getByRole('button', { name: /sync grailed|import grailed/i }).click();
  27 |         await page.waitForTimeout(1500);
  28 |         const afterSecond = await page.locator('[data-testid="inventory-card"]').count();
  29 | 
  30 |         // First sync may add a card; second should not
  31 |         expect(afterSecond).toBe(afterFirst);
  32 |         expect(afterFirst).toBeGreaterThanOrEqual(initialCount);
  33 |     });
  34 | });
  35 | 
```