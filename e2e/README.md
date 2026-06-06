# E2E tests (Playwright)

These specs drive the real app in a Chromium browser and verify the listing flows end-to-end.

## Prerequisites

1. **Local Supabase running**:
   ```
   supabase start
   ```
2. **Test user seeded** with credentials matching what's in `e2e/_helpers/auth.ts` (or update `PLAYWRIGHT_TEST_EMAIL` / `PLAYWRIGHT_TEST_PASSWORD` env vars).
3. **Listings table seeded** — the specs that need pre-existing rows will insert them via the Supabase REST API at startup. See `e2e/_helpers/seed.ts`.

## Running

```
npm run test:e2e               # headless
npm run test:e2e -- --headed   # with browser visible
npm run test:e2e -- --debug    # step through with the inspector
```

The Playwright config auto-starts `npm run dev` with `NEXT_PUBLIC_ENABLE_MOCKS=1`.
You can opt out by setting `PLAYWRIGHT_SKIP_WEBSERVER=1` and running your own dev server.

## Strategy

The specs use Playwright's `page.route()` to intercept outbound HTTP at the browser:

- `/api/crosslist/*` routes are still hit by the *browser* (we want to exercise the
  hook → fetch → response → UI flow), so we mock the *platform-side* lib calls
  by relying on `NEXT_PUBLIC_ENABLE_MOCKS=1` in the dev server.
- DB state is verified via the Supabase REST API after each action.

## When the DB isn't available

You can still run `crosslist-guard.spec.ts` and other "UI-only" specs that mock
the API responses directly — see the spec header comments for which need DB.
