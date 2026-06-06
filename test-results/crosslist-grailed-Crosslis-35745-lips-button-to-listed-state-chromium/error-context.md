# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: crosslist-grailed.spec.ts >> Crosslist to Grailed >> clicking "List on Grailed" calls API and flips button to listed state
- Location: e2e/crosslist-grailed.spec.ts:10:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3000/listing/TODO", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * E2E spec: Crosslist to Grailed happy path.
  5  |  * Mocks the platform-side response so we don't hit live Grailed.
  6  |  */
  7  | test.describe('Crosslist to Grailed', () => {
  8  |     test.skip(({ }) => !process.env.E2E_AUTHED, 'Requires E2E_AUTHED=1 + seeded test user with a listing');
  9  | 
  10 |     test('clicking "List on Grailed" calls API and flips button to listed state', async ({ page }) => {
  11 |         const calls: any[] = [];
  12 |         await page.route('**/api/crosslist/grailed', async (route) => {
  13 |             try { calls.push(JSON.parse(route.request().postData() ?? '{}')); } catch {}
  14 |             await route.fulfill({
  15 |                 status: 200,
  16 |                 contentType: 'application/json',
  17 |                 body: JSON.stringify({
  18 |                     success: true,
  19 |                     listingUrl: 'https://www.grailed.com/listings/new-test-id',
  20 |                 }),
  21 |             });
  22 |         });
  23 | 
> 24 |         await page.goto(`/listing/${process.env.E2E_LISTING_ID ?? 'TODO'}`);
     |                    ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  25 |         await page.getByRole('button', { name: /list on grailed|crosslist grailed/i }).click();
  26 | 
  27 |         await expect(page.getByText(/listed|success|grailed\.com/i)).toBeVisible({ timeout: 5000 });
  28 |         expect(calls).toHaveLength(1);
  29 |         expect(calls[0].force).toBeFalsy();
  30 |     });
  31 | });
  32 | 
```