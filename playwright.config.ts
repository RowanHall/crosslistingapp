import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for crosslist app E2E tests.
 *
 * Requires:
 *  - Local Supabase running: `supabase start` (matches .env.local)
 *  - Dev server (auto-started by Playwright):  npm run dev
 *  - NEXT_PUBLIC_ENABLE_MOCKS=1 so platform-side fetches resolve against MSW handlers
 *    instead of real Grailed/FB/Shopify APIs.
 *
 * For a quickstart without Supabase, the suite uses Playwright's route mocking
 * (page.route('**\/api/...')) in each spec — see e2e/_helpers/mockRoutes.ts.
 */
export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    expect: { timeout: 5_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
        ? undefined
        : {
              command: 'npm run dev',
              port: 3000,
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
              env: { NEXT_PUBLIC_ENABLE_MOCKS: '1' },
          },
});
