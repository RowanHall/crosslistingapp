# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: import-grailed.spec.ts >> Import from Grailed >> newly synced product appears as an inventory card
- Location: e2e/import-grailed.spec.ts:12:9

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
  4  |  * E2E spec: Grailed sync flow.
  5  |  *
  6  |  * Verifies the user-facing import journey: trigger sync → see card appear in inventory.
  7  |  * Requires a seeded test user (see e2e/README.md).
  8  |  */
  9  | test.describe('Import from Grailed', () => {
  10 |     test.skip(({ }) => !process.env.E2E_AUTHED, 'Requires E2E_AUTHED=1 + seeded test user');
  11 | 
  12 |     test('newly synced product appears as an inventory card', async ({ page }) => {
  13 |         await page.route('**/api/integrations/grailed/sync', async (route) => {
  14 |             await route.fulfill({
  15 |                 status: 200,
  16 |                 contentType: 'application/json',
  17 |                 body: JSON.stringify({ success: true, count: 1 }),
  18 |             });
  19 |         });
  20 | 
> 21 |         await page.goto('/inventory');
     |                    ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  22 |         await page.getByRole('button', { name: /import|sync grailed/i }).click();
  23 |         await expect(page.getByText(/imported|synced/i)).toBeVisible({ timeout: 5000 });
  24 |     });
  25 | });
  26 | 
```