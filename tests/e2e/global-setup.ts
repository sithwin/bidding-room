import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullConfig } from '@playwright/test';
import { startPortal, type PortalHandle } from './support/portal';
import { SERVICE_URLS, USER_PORTAL_PORT } from './support/env';

export default async function globalSetup(_config: FullConfig): Promise<() => Promise<void>> {
  const portalEnv: Record<string, string> = {
    USER_SERVICE_URL: SERVICE_URLS.userAuth,
    CATALOGUE_SERVICE_URL: SERVICE_URLS.catalogue,
    AUCTION_ENGINE_URL: SERVICE_URLS.auction,
    PAYMENT_SERVICE_URL: SERVICE_URLS.payment,
    SHIPPING_SERVICE_URL: SERVICE_URLS.shipping,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  };

  const handles: PortalHandle[] = [];
  handles.push(
    await startPortal({
      name: 'user-portal',
      port: USER_PORTAL_PORT,
      // Windows-specific: a leading '/' path (e.g. '/tmp/...') is resolved
      // relative to the current drive root by a native node.exe child
      // process, not the Git-Bash /tmp mount — use os.tmpdir() instead (see
      // tests/e2e/README.md "Env vars for host portals").
      coverageDir: process.env.USER_PORTAL_SERVER_COV_DIR ?? join(tmpdir(), 'e2e-cov', 'user-portal', 'server'),
      env: portalEnv,
    }),
  );
  // admin-portal only needed if an admin-portal flow is added; user flows do not require it.

  return async () => {
    for (const handle of handles) {
      await handle.stop();
    }
  };
}
