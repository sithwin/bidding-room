import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, expect } from '@playwright/test';
import { collectClientCoverage } from './coverage';

// Mirrors support/fixtures.ts exactly, but pointed at the admin-portal client
// coverage directory — see that file's doc comment for why os.tmpdir() (not a
// literal '/tmp/...') is used, and global-setup.admin.ts for the matching
// ADMIN_PORTAL_SERVER_COV_DIR default this pairs with on the server side.
const CLIENT_COVERAGE_DIR =
  process.env.CLIENT_COVERAGE_DIR ?? join(tmpdir(), 'e2e-cov', 'admin-portal', 'client');

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
