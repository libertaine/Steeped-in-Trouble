import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Real DEV-only shortcuts need Vite's development server, rather than preview.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4193);
export default defineConfig({
  ...base,
  testDir: './tests/dev-browser',
  projects: base.projects.filter((p) => p.name === 'chromium'),
  use: { ...base.use, baseURL: `http://localhost:${port}/Steeped-in-Trouble/` },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}/Steeped-in-Trouble/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
