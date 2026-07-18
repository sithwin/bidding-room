import { defineConfig } from '@playwright/test';

const ADMIN_PORTAL_URL = process.env.ADMIN_PORTAL_URL ?? 'http://localhost:3008';

export default defineConfig({
  testDir: './specs-admin',
  globalSetup: './global-setup.admin.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report-admin' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: ADMIN_PORTAL_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: !!process.env.CI,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
