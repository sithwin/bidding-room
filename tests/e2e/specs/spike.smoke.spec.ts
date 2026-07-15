import { test, expect } from '@playwright/test';
import { collectClientCoverage } from '../support/coverage';

const CLIENT_COVERAGE_DIR = process.env.CLIENT_COVERAGE_DIR ?? '/tmp/e2e-client-cov';

test('spike: home page renders and an API route responds', async ({ page }) => {
  const coverage = collectClientCoverage(page, CLIENT_COVERAGE_DIR);
  await coverage.start();

  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();

  const res = await page.request.get('/api/catalogue/auctions');
  expect(res.status()).toBeLessThan(500);

  await coverage.flush();
});
