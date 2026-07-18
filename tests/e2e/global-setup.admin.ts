import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullConfig } from '@playwright/test';
import { startPortal, type PortalHandle } from './support/portal';
import { SERVICE_URLS, ADMIN_PORTAL_PORT } from './support/env';

// Admin-only counterpart to global-setup.ts — boots just admin-portal, no
// mock Google server (admin login is email/password only, no OAuth).
export default async function globalSetup(_config: FullConfig): Promise<() => Promise<void>> {
  const portalEnv: Record<string, string> = {
    USER_SERVICE_URL: SERVICE_URLS.userAuth,
    CATALOGUE_SERVICE_URL: SERVICE_URLS.catalogue,
    AUCTION_ENGINE_URL: SERVICE_URLS.auction,
    PAYMENT_SERVICE_URL: SERVICE_URLS.payment,
    SHIPPING_SERVICE_URL: SERVICE_URLS.shipping,
    ADMIN_SERVICE_URL: SERVICE_URLS.adminService,
    ADMIN_LOGIN_INTERNAL_SECRET: process.env.ADMIN_LOGIN_INTERNAL_SECRET ?? 'test-admin-login-secret',
  };

  const handle: PortalHandle = await startPortal({
    name: 'admin-portal',
    port: ADMIN_PORTAL_PORT,
    // Windows-specific: see tests/e2e/README.md "A Windows-specific pitfall"
    // — os.tmpdir() avoids a native node.exe resolving a leading '/tmp/...'
    // to the wrong drive root.
    coverageDir: process.env.ADMIN_PORTAL_SERVER_COV_DIR ?? join(tmpdir(), 'e2e-cov', 'admin-portal', 'server'),
    env: portalEnv,
  });

  return async () => {
    await handle.stop();
  };
}
