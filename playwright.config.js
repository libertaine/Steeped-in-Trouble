import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against the production build served beneath the same
// /Steeped-in-Trouble/ base path that GitHub Pages uses, so broken asset
// references show up as 404s here rather than after deployment.
//
// Set BASE_URL to smoke-test an existing deployment instead, e.g.
//   BASE_URL=https://libertaine.github.io/Steeped-in-Trouble/ npm run test:browser
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const BASE_URL = process.env.BASE_URL;

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}/Steeped-in-Trouble/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile[^/\\]*\.spec\.js$/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /mobile[^/\\]*\.spec\.js$/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, testMatch: /mobile[^/\\]*\.spec\.js$/ },
  ],
  webServer: BASE_URL ? undefined : {
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: `http://localhost:${PORT}/Steeped-in-Trouble/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
