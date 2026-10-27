import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against the production build served beneath the same
// /Storm-in-a-Teacup/ base path that GitHub Pages uses, so broken asset
// references show up as 404s here rather than after deployment.
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/Storm-in-a-Teacup/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /mobile/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://localhost:${PORT}/Storm-in-a-Teacup/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
