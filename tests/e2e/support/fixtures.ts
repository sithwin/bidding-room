import { test as base, expect } from '@playwright/test';
import { collectClientCoverage } from './coverage';

const CLIENT_COVERAGE_DIR =
  process.env.CLIENT_COVERAGE_DIR ?? '/tmp/e2e-cov/user-portal/client';

/**
 * Every spec in tests/e2e/specs imports `test`/`expect` from here (not
 * '@playwright/test' directly) so that client-side V8 coverage is captured
 * automatically for every test, with no per-spec boilerplate. `coveredPage`
 * is declared `auto: true` so it runs even though no test destructures it by
 * name — it depends on Playwright's built-in `page` fixture, starts
 * collection before the test body runs, and flushes to CLIENT_COVERAGE_DIR
 * after (regardless of pass/fail, since `use()` is always followed by the
 * flush once the test finishes).
 */
export const test = base.extend<{ coveredPage: void }>({
  coveredPage: [
    async ({ page }, use) => {
      const coverage = collectClientCoverage(page, CLIENT_COVERAGE_DIR);
      await coverage.start();
      await use();
      await coverage.flush();
    },
    { auto: true },
  ],
});

export { expect };
