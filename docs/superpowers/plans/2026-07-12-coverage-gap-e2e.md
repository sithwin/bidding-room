# SonarCloud New-Code Coverage Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the SonarCloud Quality Gate on `main` green by raising new-code coverage from 44.4% to ≥ 80%, via `sonar-project.properties` measurement corrections, a Playwright E2E suite that emits lcov, and a handful of unit tests.

**Architecture:** Three independent workstreams. (1) Fix how Sonar counts lines — reclassify `.test.tsx` files as tests and exclude composition roots from coverage. (2) Add a `tests/e2e` Playwright package that drives both Next.js portals running on the CI host (not in Docker) against the existing `docker-compose.test.yml` backend stack, collecting client V8 coverage via Playwright and server V8 coverage via `NODE_V8_COVERAGE`, then converting the merged dump to lcov with `monocart-coverage-reports` mapped back to TypeScript sources. (3) Add unit tests for the few files E2E cannot reach.

**Tech Stack:** Playwright (Chromium only), `monocart-coverage-reports`, `@vitest/coverage-v8` (existing), Next.js production builds with `productionBrowserSourceMaps`, Docker Compose, GitHub Actions, SonarCloud.

## Global Constraints

Copied verbatim from the spec and repo `CLAUDE.md`. Every task's requirements implicitly include this section.

- **No service code changes.** If a flow cannot pass against the real stack, that is a product bug to surface and report, not to code around. The only production-code edits permitted are the two Next configs' `productionBrowserSourceMaps` flag (build config, not behaviour) and the Part 3 unit-test stragglers.
- **Coverage supplements, never replaces.** E2E lcov files are *appended* to `sonar.javascript.lcov.reportPaths`; the existing unit-test lcov paths stay.
- **`sonar.coverage.exclusions`, not `sonar.exclusions`** for `main.ts` / `next.config.mjs` — excluded files must stay analysed for bugs/vulnerabilities (the S5332 findings live in `main.ts`).
- **Graceful shutdown only** — portal processes must be stopped with `SIGTERM`/`SIGINT`, never `SIGKILL`, or the server-side V8 coverage dump is lost.
- **British English** in all comments and copy: "authorise", "cancelled", "fulfilment".
- **Named exports only** — never `export default`. **No `var`** — `const`/`let`. **Single quotes.** **TypeScript strict** — no implicit `any`, no `@ts-ignore` in production code. Boolean identifiers use `is`/`has`/`can`/`should`/`was`/`will`.
- **Test file co-location** — unit test files live beside their source as `<filename>.test.ts(x)`. (E2E spec files live under `tests/e2e/specs/` — a dedicated package, not co-located.)
- **The `tests/e2e` package has no `test` script** — only `test:e2e` — so `pnpm turbo test` never invokes it without a running stack.
- **Fresh stack per CI run** — `docker compose -f docker-compose.test.yml down -v` under `if: always()`.

### Verified repo facts (do not re-derive)

- Test backend stack (`docker-compose.test.yml`) exposes on the CI host: `user-auth` :3001, `catalogue` :3002, `auction-engine` :3003, `payment` :3004, `notification` :3005, `shipping` :3006, Postgres :5433→5432, Redis :6380→6379, RabbitMQ :5673→5672. **The `admin` service (:3007) is NOT in this stack** — E2E flows and seeding must not depend on it; seed lots/auctions via `catalogue`/`auction-engine` APIs directly.
- Portals: `apps/user-portal` (dev port 3000), `apps/admin-portal` (dev port 3008). Both: `build` = `next build`, `start` = `next start -p <port>`, `test` = `vitest run --coverage`.
- Portal service URLs are read from env in `next.config.mjs` (`USER_SERVICE_URL`, `CATALOGUE_SERVICE_URL`, `AUCTION_ENGINE_URL`, `PAYMENT_SERVICE_URL`, `SHIPPING_SERVICE_URL`, `ADMIN_SERVICE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
- Unit-test lcov is written to `apps/*/coverage/lcov.info` and `packages/*/coverage/lcov.info` via the shared `coverage` config in `vitest.shared`.
- `sonar-project.properties` current keys: `sonar.test.inclusions=**/*.test.ts`, `sonar.javascript.lcov.reportPaths=apps/*/coverage/lcov.info,packages/*/coverage/lcov.info`, and no `sonar.coverage.exclusions`.
- CI job that Sonar scans from: `.github/workflows/ci.yml` job `ci`. `integration-tests.yml` is a separate job and stays unchanged.

---

## Task 1: Sonar measurement corrections (Part 1)

Reclassify `.test.tsx` files as tests and exclude composition roots + Next config from *coverage measurement*. This alone should lift new-code coverage to ~52–53%. Ship it first — it is independent of everything else and de-risks the rest.

**Files:**
- Modify: `sonar-project.properties`

**Interfaces:**
- Consumes: nothing.
- Produces: an updated `sonar.javascript.lcov.reportPaths` line that Task 11 will further extend with the two E2E lcov paths. Later tasks must *append* to this line, not replace it.

- [ ] **Step 1: Edit `sonar-project.properties`**

Change the `sonar.test.inclusions` line and add a new `sonar.coverage.exclusions` line. Final file:

```properties
sonar.projectKey=sithwin_bidding-room
sonar.organization=sithwin
sonar.sources=apps,packages
sonar.exclusions=**/dist/**,**/node_modules/**,**/migrations/**,**/coverage/**,**/*.config.ts,**/.next/**
sonar.tests=apps,packages
sonar.test.inclusions=**/*.test.ts,**/*.test.tsx
sonar.coverage.exclusions=apps/*/src/main.ts,**/next.config.mjs
sonar.javascript.lcov.reportPaths=apps/*/coverage/lcov.info,packages/*/coverage/lcov.info
```

- [ ] **Step 2: Verify the properties parse and the globs are well-formed**

Run: `grep -E '^sonar\.(test\.inclusions|coverage\.exclusions)=' sonar-project.properties`
Expected output (both lines present):
```
sonar.test.inclusions=**/*.test.ts,**/*.test.tsx
sonar.coverage.exclusions=apps/*/src/main.ts,**/next.config.mjs
```

- [ ] **Step 3: Confirm the exclusion targets exist so the globs are not dead**

Run: `ls apps/*/src/main.ts apps/user-portal/next.config.mjs apps/admin-portal/next.config.mjs`
Expected: every path listed, no "No such file" error. (Confirms `sonar.coverage.exclusions` matches real files.)

- [ ] **Step 4: Commit**

```bash
git add sonar-project.properties
git commit -m "test(sonar): classify .test.tsx as tests, exclude composition roots from coverage"
```

---

## Task 2: Verify the compose stack builds and boots (dependency prerequisite)

The whole E2E design depends on `docker compose -f docker-compose.test.yml up -d --build` succeeding. The spec records a pre-existing `tsc --build` `MODULE_NOT_FOUND` failure locally (user-auth, shipping at minimum). Prove the stack boots **before** writing any flow. If a service fails to build or never becomes healthy, fixing *only what blocks boot* becomes part of this task (it is a declared dependency, not scope creep). Do not build flows on a stack that does not boot.

**Files:**
- Modify (only if a build is broken): the failing service's `Dockerfile` and/or its `tsconfig`/`package.json` build wiring. No behavioural source changes.
- Create: `tests/e2e/README.md` (start it here; Task 14 completes it) — record the exact boot + health-wait commands that worked.

**Interfaces:**
- Consumes: `docker-compose.test.yml` (unchanged), the health-wait loop from `.github/workflows/integration-tests.yml`.
- Produces: a proven-good boot command sequence, reused verbatim by Task 12's CI steps.

- [ ] **Step 1: Build all packages first (E2E later reuses these `.next` and `dist` outputs)**

Run: `pnpm install --frozen-lockfile && pnpm turbo build`
Expected: PASS. If a service's `tsc --build` fails with `MODULE_NOT_FOUND`, capture the exact module and failing project — that is the blocker to fix in Step 3.

- [ ] **Step 2: Boot the backend stack**

Run:
```bash
docker compose -f docker-compose.test.yml up -d --build
```
Then wait for health using the same loop `integration-tests.yml` uses:
```bash
timeout 180 bash -c '
  while docker compose -f docker-compose.test.yml ps --format json |
    jq -r "select(.Health != \"healthy\" and .Health != \"\") | .Service" | grep -q .; do
    sleep 5
  done' && sleep 10
```
Expected: command exits 0; `docker compose -f docker-compose.test.yml ps` shows all of `user-auth catalogue auction-engine payment notification shipping postgres redis rabbitmq` as `healthy`.

- [ ] **Step 3: If any service is unhealthy or failed to build, diagnose and fix the boot blocker only**

Run: `docker compose -f docker-compose.test.yml logs <service> --no-color | tail -40`
Fix the minimal build/wiring issue (e.g. a missing workspace dependency in the Dockerfile build stage). Re-run Step 1–2 until green. Record each fix in the commit body. **Do not** change service runtime behaviour.

- [ ] **Step 4: Smoke-check every service HTTP health endpoint from the host**

Run:
```bash
for p in 3001 3002 3003 3004 3005 3006; do
  echo -n "port $p: "; curl -fsS "http://localhost:$p/health" && echo; done
```
Expected: a success response from each port (no connection-refused, no non-2xx).

- [ ] **Step 5: Record the working commands in `tests/e2e/README.md`**

Create `tests/e2e/README.md` with a "Boot the backend stack" section containing the exact Step 1–2 commands that worked.

- [ ] **Step 6: Tear down**

Run: `docker compose -f docker-compose.test.yml down -v`
Expected: all containers and volumes removed.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/README.md docker-compose.test.yml apps
git commit -m "test(e2e): verify docker-compose.test.yml stack boots for E2E"
```
(If Step 3 made no changes, commit only `tests/e2e/README.md`.)

---

## Task 3: Scaffold the `tests/e2e` package, Playwright config, and portal source maps

Create the `@carat-room/e2e` package, wire it into the workspace globs, add Playwright (Chromium only), and enable production source maps on both portals so server/client V8 coverage maps back to `src/**`.

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `tests/e2e/package.json`
- Create: `tests/e2e/playwright.config.ts`
- Create: `tests/e2e/tsconfig.json`
- Modify: `apps/user-portal/next.config.mjs`
- Modify: `apps/admin-portal/next.config.mjs`

**Interfaces:**
- Produces:
  - Package name `@carat-room/e2e` with script `test:e2e` = `playwright test` and **no** `test` script.
  - `playwright.config.ts` exporting a config with `testDir: './specs'`, `projects: [{ name: 'chromium' }]`, `retries: process.env.CI ? 1 : 0`, `fullyParallel: false`, and a `baseURL` env indirection.
  - Both portals build with `productionBrowserSourceMaps: true`.

- [ ] **Step 1: Add `tests/*` to the workspace globs**

Edit `pnpm-workspace.yaml`, extend the `packages` list:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'tests/e2e'
```
(Leave `hoistPattern`, `allowBuilds`, `onlyBuiltDependencies`, `packageExtensions` unchanged.)

- [ ] **Step 2: Create `tests/e2e/package.json`**

```json
{
  "name": "@carat-room/e2e",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test:e2e": "playwright test",
    "coverage:report": "node ./scripts/build-lcov.mjs"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "monocart-coverage-reports": "^2.11.0",
    "pg": "^8.13.0"
  }
}
```
(No `test` script — deliberate, per Global Constraints. `pg` is for the SQL-only seeding step in Task 5. `coverage:report` is created in Task 11.)

- [ ] **Step 3: Create `tests/e2e/tsconfig.json`**

```json
{
  "extends": "../../packages/tsconfig/base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["node"],
    "noEmit": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 4: Create `tests/e2e/playwright.config.ts`**

```typescript
import { defineConfig } from '@playwright/test';

const USER_PORTAL_URL = process.env.USER_PORTAL_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: USER_PORTAL_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```
`fullyParallel: false` + `workers: 1` keeps V8 client-coverage collection deterministic and avoids cross-spec seed interference (the spec relies on per-spec unique identifiers, not isolated stacks per spec).

- [ ] **Step 5: Enable production source maps on the user portal**

Edit `apps/user-portal/next.config.mjs` — add one line inside `nextConfig` (top level, alongside `env`):

```javascript
const nextConfig = {
  productionBrowserSourceMaps: true,
  env: {
```
(Leave everything else in the file unchanged.)

- [ ] **Step 6: Enable production source maps on the admin portal**

Edit `apps/admin-portal/next.config.mjs` the same way:

```javascript
const nextConfig = {
  productionBrowserSourceMaps: true,
  env: {
```

- [ ] **Step 7: Install and register Chromium**

Run: `pnpm install && pnpm --filter @carat-room/e2e exec playwright install --with-deps chromium`
Expected: dependencies resolve; Chromium downloads.

- [ ] **Step 8: Verify Playwright sees the (empty) config and the `test` script is absent**

Run: `pnpm --filter @carat-room/e2e exec playwright test --list; node -e "const s=require('./tests/e2e/package.json').scripts; if (s.test) { throw new Error('e2e must not have a test script'); } console.log('ok: no test script');"`
Expected: `playwright test --list` reports 0 tests (no specs yet) without a config error, then `ok: no test script`.

- [ ] **Step 9: Verify both portals still build with source maps on**

Run: `pnpm turbo build --filter=user-portal --filter=admin-portal`
Expected: PASS; `apps/user-portal/.next` and `apps/admin-portal/.next` contain `.js.map` files (`find apps/user-portal/.next -name '*.js.map' | head` is non-empty).

- [ ] **Step 10: Commit**

```bash
git add pnpm-workspace.yaml tests/e2e apps/user-portal/next.config.mjs apps/admin-portal/next.config.mjs pnpm-lock.yaml
git commit -m "test(e2e): scaffold @carat-room/e2e package, Playwright, portal source maps"
```

---

## Task 4: Coverage spike — prove lcov fidelity for one route and one page

**This task gates the rest of the E2E work.** Before building five flows, prove the full coverage pipeline end-to-end for exactly one server API route and one client page: launch the user portal on the host with `NODE_V8_COVERAGE`, drive one page with Playwright while recording client V8 coverage, stop the portal with `SIGTERM`, and convert the merged V8 dump to lcov mapped back to `src/**`. If production-build mapping is unreliable, fall back to `next dev` mode (documented in Step 8) and record the decision.

**Files:**
- Create: `tests/e2e/support/portal.ts` (start/stop a portal process with coverage)
- Create: `tests/e2e/support/coverage.ts` (attach/collect Playwright client V8 coverage)
- Create: `tests/e2e/specs/spike.smoke.spec.ts`
- Create: `tests/e2e/scripts/build-lcov.mjs`
- Modify: `tests/e2e/README.md`

**Interfaces:**
- Consumes: the booted backend stack from Task 2; the portal `.next` build from Task 3.
- Produces (relied on by Tasks 6–11):
  - `startPortal(opts: { name: 'user-portal' | 'admin-portal'; port: number; coverageDir: string; env: Record<string, string> }): Promise<PortalHandle>` where `PortalHandle = { stop(): Promise<void> }` and `stop()` sends `SIGTERM` and awaits exit.
  - `collectClientCoverage(page: Page, outDir: string): { start(): Promise<void>; flush(): Promise<void> }` — wraps `page.coverage.startJSCoverage` / `stopJSCoverage`, writing raw V8 JSON into `outDir`.
  - `build-lcov.mjs` reads a V8 coverage dir + source root and writes `lcov.info` via `monocart-coverage-reports`.

- [ ] **Step 1: Write the portal launcher `tests/e2e/support/portal.ts`**

```typescript
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

export interface PortalHandle {
  stop(): Promise<void>;
}

interface StartPortalOptions {
  name: 'user-portal' | 'admin-portal';
  port: number;
  coverageDir: string;
  env: Record<string, string>;
}

export async function startPortal(opts: StartPortalOptions): Promise<PortalHandle> {
  const child: ChildProcess = spawn(
    'pnpm',
    ['--filter', opts.name, 'exec', 'next', 'start', '-p', String(opts.port)],
    {
      cwd: `${process.cwd()}/../..`,
      env: { ...process.env, ...opts.env, NODE_V8_COVERAGE: opts.coverageDir },
      stdio: 'inherit',
    },
  );

  const baseUrl = `http://localhost:${opts.port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok || res.status === 404) {
        break;
      }
    } catch {
      // portal not up yet — keep polling
    }
    await sleep(1000);
  }

  return {
    async stop(): Promise<void> {
      if (child.exitCode !== null) {
        return;
      }
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGTERM');
      await Promise.race([exited, sleep(15_000)]);
    },
  };
}
```
Note: `Date.now()` is fine in test support code (this repo runs it under Playwright, not the workflow engine). `stop()` uses `SIGTERM` only — never `SIGKILL` — so the `NODE_V8_COVERAGE` dump is flushed.

- [ ] **Step 2: Write the client-coverage helper `tests/e2e/support/coverage.ts`**

```typescript
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

let fileCounter = 0;

export function collectClientCoverage(page: Page, outDir: string) {
  return {
    async start(): Promise<void> {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    },
    async flush(): Promise<void> {
      const entries = await page.coverage.stopJSCoverage();
      await mkdir(outDir, { recursive: true });
      const payload = { result: entries };
      fileCounter += 1;
      const file = join(outDir, `client-${process.pid}-${fileCounter}.json`);
      await writeFile(file, JSON.stringify(payload), 'utf8');
    },
  };
}
```

- [ ] **Step 3: Write the spike spec `tests/e2e/specs/spike.smoke.spec.ts`**

```typescript
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
```

- [ ] **Step 4: Write the lcov builder `tests/e2e/scripts/build-lcov.mjs`**

```javascript
import { CoverageReport } from 'monocart-coverage-reports';

const serverDir = process.env.SERVER_COVERAGE_DIR ?? '/tmp/e2e-server-cov';
const clientDir = process.env.CLIENT_COVERAGE_DIR ?? '/tmp/e2e-client-cov';
const outDir = process.env.LCOV_OUT_DIR ?? './coverage/spike';
const sourceRoot = process.env.SOURCE_ROOT ?? '../../apps/user-portal';

const report = new CoverageReport({
  name: 'E2E Coverage',
  outputDir: outDir,
  reports: [['lcovonly', { file: 'lcov.info' }]],
  sourceFilter: (path) => path.includes('/src/') && !path.includes('/node_modules/'),
  sourcePath: (filePath) => filePath,
  entryFilter: (entry) => entry.url.includes(sourceRoot) || entry.url.includes('/_next/'),
});

await report.addFromDir(serverDir);
await report.addFromDir(clientDir);
const results = await report.generate();
console.log(`lcov written to ${outDir}/lcov.info — files: ${results.files?.length ?? 0}`);
if (!results.files || results.files.length === 0) {
  console.error('FIDELITY FAILURE: no source files mapped. See fallback in README.');
  process.exit(1);
}
```

- [ ] **Step 5: Run the spike end-to-end against the production build**

Run:
```bash
docker compose -f docker-compose.test.yml up -d --build
# wait-for-health loop from Task 2 Step 2
export SERVER_COVERAGE_DIR=/tmp/e2e-server-cov CLIENT_COVERAGE_DIR=/tmp/e2e-client-cov
rm -rf "$SERVER_COVERAGE_DIR" "$CLIENT_COVERAGE_DIR"
pnpm turbo build --filter=user-portal
node -e "import('./tests/e2e/support/portal.js')" 2>/dev/null || true
```
Then, from a small throwaway runner (or inline in the spec's `globalSetup`, wired properly in Task 6), start the portal with `NODE_V8_COVERAGE=$SERVER_COVERAGE_DIR` on port 3000 with env `USER_SERVICE_URL=http://localhost:3001 CATALOGUE_SERVICE_URL=http://localhost:3002 AUCTION_ENGINE_URL=http://localhost:3003 PAYMENT_SERVICE_URL=http://localhost:3004 SHIPPING_SERVICE_URL=http://localhost:3006`, run `pnpm --filter @carat-room/e2e test:e2e`, then `SIGTERM` the portal.

- [ ] **Step 6: Convert to lcov and inspect fidelity**

Run: `SOURCE_ROOT=apps/user-portal LCOV_OUT_DIR=./tests/e2e/coverage/spike node tests/e2e/scripts/build-lcov.mjs`
Expected: exit 0, "files: N" with N ≥ 1.

- [ ] **Step 7: Assert the lcov references real `src` paths, not bundle paths**

Run: `grep -E '^SF:' tests/e2e/coverage/spike/lcov.info | grep -E 'apps/user-portal/src/app/api/catalogue/auctions/route\.ts|apps/user-portal/src/app/page\.tsx' | head`
Expected: at least one `SF:` line pointing at a real `src/**/*.ts(x)` file (proves source-map mapping works). If empty, the production-build mapping failed → go to Step 8.

- [ ] **Step 8: Fallback decision (only if Step 7 is empty)**

If production-build server mapping is unreliable, switch the portal launcher to dev mode: change the `startPortal` spawn args from `exec next start -p` to `exec next dev -p` and drop the `pnpm turbo build` prerequisite for the portal. Dev-mode source maps are exact. Re-run Steps 5–7. Record in `tests/e2e/README.md` under "Coverage mode" which mode was chosen and why. Every later task uses whichever mode passed here.

- [ ] **Step 9: Record the working pipeline in `tests/e2e/README.md`**

Document: coverage mode (prod build vs `next dev`), the env vars for host portals, and the two-command local run (compose up, then `test:e2e`).

- [ ] **Step 10: Tear down and commit**

```bash
docker compose -f docker-compose.test.yml down -v
git add tests/e2e
git commit -m "test(e2e): prove lcov fidelity for one route and one page (coverage spike)"
```

---

## Task 5: Seeding harness and portal lifecycle (globalSetup/teardown)

Give every spec a way to seed its own data through the services' public APIs, and wire the portal(s) to start once (with `NODE_V8_COVERAGE`) before all specs and stop with `SIGTERM` after, capturing server coverage. Seeding uses real endpoints (verified: `POST /register`, `/verify-email`, `/login`, `/phone/request`, `/phone/verify` on :3001; `POST /api/lots` and `/api/categories` admin-only on :3002; `POST /api/auctions` admin-only and `POST /api/auctions/:lotId/bids` on :3003). Admin promotion has no API — use direct SQL against the `user_test` DB on host port 5433.

**Files:**
- Create: `tests/e2e/support/seed.ts`
- Create: `tests/e2e/support/env.ts`
- Create: `tests/e2e/global-setup.ts`
- Modify: `tests/e2e/playwright.config.ts` (register `globalSetup`)

**Interfaces:**
- Consumes: `startPortal` from Task 4.
- Produces (relied on by Tasks 6–10):
  - `SERVICE_URLS` (from `env.ts`): `{ userAuth: 'http://localhost:3001', catalogue: '…3002', auction: '…3003', payment: '…3004', shipping: '…3006' }`, each overridable by env.
  - `registerAndVerifyUser(opts?: { role?: 'BIDDER' | 'ADMIN' }): Promise<{ userId: string; email: string; password: string; accessToken: string; refreshCookie: string }>`.
  - `verifyPhone(accessToken: string): Promise<void>`.
  - `seedLot(adminToken: string, overrides?: Partial<LotSeed>): Promise<{ lotId: string }>`.
  - `seedAuction(adminToken: string, lotId: string, overrides?: Partial<AuctionSeed>): Promise<{ auctionId: string }>`.
  - `uniqueSuffix(): string` — collision-free per-spec identifier (uses a module counter + pid, **not** `Math.random`/`Date.now` at import time).

- [ ] **Step 1: Write `tests/e2e/support/env.ts`**

```typescript
export const SERVICE_URLS = {
  userAuth: process.env.USER_SERVICE_URL ?? 'http://localhost:3001',
  catalogue: process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002',
  auction: process.env.AUCTION_ENGINE_URL ?? 'http://localhost:3003',
  payment: process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3004',
  shipping: process.env.SHIPPING_SERVICE_URL ?? 'http://localhost:3006',
} as const;

export const USER_PORTAL_PORT = Number(process.env.USER_PORTAL_PORT ?? 3000);
export const ADMIN_PORTAL_PORT = Number(process.env.ADMIN_PORTAL_PORT ?? 3008);

export const SEED_DB_URL =
  process.env.SEED_USER_DB_URL ?? 'postgresql://carat:carat_test@localhost:5433/user_test';

let counter = 0;

export function uniqueSuffix(): string {
  counter += 1;
  return `${process.pid}-${counter}`;
}
```

- [ ] **Step 2: Read the real request/response shapes before writing `seed.ts`**

Run:
```bash
sed -n '44,210p' apps/user-auth/src/presentation/user-router.ts
sed -n '75,133p' apps/catalogue/src/main.ts
sed -n '123,160p' apps/auction-engine/src/presentation/auction-router.ts
```
Read: the exact JSON body each endpoint expects, the success envelope (`{ data }`), and how email-verification + phone-OTP tokens are surfaced in `NODE_ENV=test` (returned in the response, or must be read from DB). Match `seed.ts` to what you find — **do not** assume field names.

- [ ] **Step 3: Write `tests/e2e/support/seed.ts`**

Use the shapes confirmed in Step 2. Skeleton to fill in (replace the `/* from Step 2 */` markers with verified field names/token retrieval):

```typescript
import { Client } from 'pg';
import { SERVICE_URLS, SEED_DB_URL, uniqueSuffix } from './env';

export interface LotSeed {
  title: string;
  startingPrice: number;
  reservePrice: number;
}

export interface AuctionSeed {
  startsAt: string;
  endsAt: string;
}

async function postJson(url: string, body: unknown, token?: string) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${url} failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

export async function registerAndVerifyUser(opts?: { role?: 'BIDDER' | 'ADMIN' }) {
  const suffix = uniqueSuffix();
  const email = `e2e-${suffix}@carat-test.internal`;
  const password = 'Passw0rd!e2e';

  const registerRes = await postJson(`${SERVICE_URLS.userAuth}/register`, {
    email,
    password,
    /* remaining required fields from Step 2 */
  });
  const registered = await registerRes.json();
  const userId: string = registered.data.userId; /* confirm path in Step 2 */

  const emailToken = await retrieveEmailToken(userId); /* Step 2: response field or DB */
  await postJson(`${SERVICE_URLS.userAuth}/verify-email`, { token: emailToken });

  if (opts?.role === 'ADMIN') {
    await promoteToAdmin(userId);
  }

  const loginRes = await postJson(`${SERVICE_URLS.userAuth}/login`, { email, password });
  const setCookie = loginRes.headers.get('set-cookie') ?? '';
  const accessToken: string = (await loginRes.json()).data.accessToken; /* confirm */

  return { userId, email, password, accessToken, refreshCookie: setCookie };
}

export async function verifyPhone(accessToken: string): Promise<void> {
  await postJson(`${SERVICE_URLS.userAuth}/phone/request`, { /* body from Step 2 */ }, accessToken);
  const otp = await retrievePhoneOtp(accessToken); /* Step 2: test-mode retrieval */
  await postJson(`${SERVICE_URLS.userAuth}/phone/verify`, { code: otp }, accessToken);
}

export async function seedLot(adminToken: string, overrides: Partial<LotSeed> = {}) {
  const suffix = uniqueSuffix();
  const res = await postJson(
    `${SERVICE_URLS.catalogue}/api/lots`,
    { title: `E2E Lot ${suffix}`, startingPrice: 100, reservePrice: 150, ...overrides },
    adminToken,
  );
  return { lotId: (await res.json()).data.id as string };
}

export async function seedAuction(adminToken: string, lotId: string, overrides: Partial<AuctionSeed> = {}) {
  const res = await postJson(
    `${SERVICE_URLS.auction}/api/auctions`,
    { lotId, ...overrides },
    adminToken,
  );
  return { auctionId: (await res.json()).data.id as string };
}

async function promoteToAdmin(userId: string): Promise<void> {
  const client = new Client({ connectionString: SEED_DB_URL });
  await client.connect();
  try {
    await client.query('UPDATE users SET role = $1 WHERE id = $2', ['ADMIN', userId]);
  } finally {
    await client.end();
  }
}

// retrieveEmailToken / retrievePhoneOtp / promoteToAdmin column names: confirm in Step 2.
```
If any token cannot be retrieved in test mode without a service change, **stop and report it as a product-testability gap** — do not add a service code path (Global Constraints).

- [ ] **Step 4: Write the portal lifecycle `tests/e2e/global-setup.ts`**

Playwright runs `globalSetup` once before all specs; the returned function runs once after (this is where `SIGTERM` fires and server coverage flushes).

```typescript
import type { FullConfig } from '@playwright/test';
import { startPortal, type PortalHandle } from './support/portal';
import { SERVICE_URLS, USER_PORTAL_PORT, ADMIN_PORTAL_PORT } from './support/env';

export default async function globalSetup(_config: FullConfig) {
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
      coverageDir: process.env.USER_PORTAL_SERVER_COV_DIR ?? '/tmp/e2e-cov/user-portal/server',
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
```

- [ ] **Step 5: Register `globalSetup` in `tests/e2e/playwright.config.ts`**

Add to the config object: `globalSetup: './global-setup.ts',`.

- [ ] **Step 6: Verify seeding compiles and one seed round-trips against the live stack**

Run:
```bash
docker compose -f docker-compose.test.yml up -d --build   # + health wait
pnpm --filter @carat-room/e2e exec tsc --noEmit
node --experimental-strip-types -e "import('./tests/e2e/support/seed.ts').then(async m => { const a = await m.registerAndVerifyUser({ role: 'ADMIN' }); const { lotId } = await m.seedLot(a.accessToken); console.log('seeded lot', lotId); })"
```
Expected: `tsc --noEmit` passes; the script prints a seeded lot id (proves register → verify → promote → create-lot works against real services).

- [ ] **Step 7: Tear down and commit**

```bash
docker compose -f docker-compose.test.yml down -v
git add tests/e2e
git commit -m "test(e2e): seeding harness and portal lifecycle with server coverage"
```

---

## Task 6: Flow 1 — Auth (+ shared coverage fixture)

Register → verify email → login → session refresh. Covers `login-client.tsx`, `verify-email-client.tsx`, `verify-phone/page.tsx`, `api/auth/refresh/route.ts`. This task also introduces the shared Playwright fixture that auto-collects client V8 coverage for every spec, so Flows 2–5 just import `test` from it.

**Files:**
- Create: `tests/e2e/support/fixtures.ts`
- Create: `tests/e2e/specs/auth.spec.ts`

**Interfaces:**
- Produces: `export const test` (extended Playwright test that starts client coverage in a `page` fixture and flushes it on teardown into `CLIENT_COVERAGE_DIR`) and `export { expect }`. Flows 2–5 import both from `../support/fixtures`.
- Consumes: `collectClientCoverage` (Task 4), `registerAndVerifyUser` (Task 5).

- [ ] **Step 1: Write the coverage fixture `tests/e2e/support/fixtures.ts`**

```typescript
import { test as base, expect } from '@playwright/test';
import { collectClientCoverage } from './coverage';

const CLIENT_COVERAGE_DIR =
  process.env.CLIENT_COVERAGE_DIR ?? '/tmp/e2e-cov/user-portal/client';

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
```

- [ ] **Step 2: Write the failing auth spec `tests/e2e/specs/auth.spec.ts`**

```typescript
import { test, expect } from '../support/fixtures';
import { registerAndVerifyUser } from '../support/seed';

test('register, verify email, log in and refresh the session', async ({ page }) => {
  const user = await registerAndVerifyUser();

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /log in|sign in/i }).click();

  await expect(page).toHaveURL(/\/account|\/$/);

  const refresh = await page.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBeTruthy();
});
```

- [ ] **Step 3: Run against the live stack, confirm it exercises the real flow**

Run: `pnpm --filter @carat-room/e2e test:e2e specs/auth.spec.ts` (stack up + portal via globalSetup).
Expected: PASS. If the login selectors do not match, open `apps/user-portal/src/**/login-client.tsx` and align selectors to the real labels/roles — **do not** loosen the assertion to make a broken flow pass (that is the bug class this suite exists to catch).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/support/fixtures.ts tests/e2e/specs/auth.spec.ts
git commit -m "test(e2e): auth flow and shared client-coverage fixture"
```

---

## Task 7: Flow 2 — Register-to-bid wizard

Identity-document upload → card authorisation with a Stripe test key. Covers the register-to-bid wizard remainder. Requires `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` as a repo secret (manual prerequisite, same pattern as `SONAR_TOKEN`) — if unset, the card step is skipped with a logged notice, never faked.

**Files:**
- Create: `tests/e2e/specs/register-to-bid.spec.ts`

**Interfaces:**
- Consumes: `test`/`expect` (Task 6), `registerAndVerifyUser`, `verifyPhone` (Task 5).

- [ ] **Step 1: Confirm the wizard route and step markup**

Run: `grep -rEn "register-to-bid|identity-document|stripe|CardElement|PaymentElement" apps/user-portal/src --include='*.tsx' | head`
Read the wizard's route path and the DOM hooks (step headings, file input, submit button) so the spec targets real elements.

- [ ] **Step 2: Write the failing spec `tests/e2e/specs/register-to-bid.spec.ts`**

```typescript
import { test, expect } from '../support/fixtures';
import { registerAndVerifyUser, verifyPhone } from '../support/seed';

const hasStripeKey = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

test('complete register-to-bid: identity document then card authorisation', async ({ page }) => {
  const user = await registerAndVerifyUser();
  await verifyPhone(user.accessToken);

  await page.goto('/register-to-bid'); // confirm exact path in Step 1

  await page
    .getByLabel(/identity document|upload/i)
    .setInputFiles({ name: 'id.png', mimeType: 'image/png', buffer: Buffer.from('fake-image') });
  await page.getByRole('button', { name: /continue|next|submit/i }).click();

  test.skip(!hasStripeKey, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set — card step skipped');

  const cardFrame = page.frameLocator('iframe[name*="card"], iframe[title*="card"]').first();
  await cardFrame.getByPlaceholder(/card number/i).fill('4242424242424242');
  await cardFrame.getByPlaceholder(/mm ?\/ ?yy/i).fill('12/34');
  await cardFrame.getByPlaceholder(/cvc/i).fill('123');
  await page.getByRole('button', { name: /authorise|save card|confirm/i }).click();

  await expect(page.getByText(/verified|ready to bid|complete/i)).toBeVisible();
});
```

- [ ] **Step 3: Run and align selectors to the real wizard**

Run: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY pnpm --filter @carat-room/e2e test:e2e specs/register-to-bid.spec.ts`
Expected: PASS (card step runs when the key is present, skips with a notice otherwise).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/register-to-bid.spec.ts
git commit -m "test(e2e): register-to-bid wizard flow"
```

---

## Task 8: Flow 3 — Browse & bid

Auctions list → lot detail → live SSE updates → place a bid. Covers `lot-detail-client.tsx`, lot `page.tsx`, `api/auctions/[lotId]/stream/route.ts`, `api/auctions/[lotId]/bids/route.ts`, `api/account/bids` and `api/account/stats` routes.

**Files:**
- Create: `tests/e2e/specs/browse-and-bid.spec.ts`

**Interfaces:**
- Consumes: `test`/`expect`, `registerAndVerifyUser`, `verifyPhone`, `seedLot`, `seedAuction`.

- [ ] **Step 1: Confirm the auctions/lot routes and the SSE hook**

Run: `grep -rEn "auctions/\[auctionId\]|lots/\[lotId\]|use-lot-sse|place.*bid|EventSource" apps/user-portal/src --include='*.tsx' | head`
Note the lot-detail URL shape and the bid-submit control.

- [ ] **Step 2: Write the failing spec `tests/e2e/specs/browse-and-bid.spec.ts`**

```typescript
import { test, expect } from '../support/fixtures';
import { registerAndVerifyUser, verifyPhone, seedLot, seedAuction } from '../support/seed';

test('browse to a lot, receive SSE updates and place a bid', async ({ page }) => {
  const admin = await registerAndVerifyUser({ role: 'ADMIN' });
  const { lotId } = await seedLot(admin.accessToken, { startingPrice: 100 });
  await seedAuction(admin.accessToken, lotId);

  const bidder = await registerAndVerifyUser();
  await verifyPhone(bidder.accessToken);

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(bidder.email);
  await page.getByLabel(/password/i).fill(bidder.password);
  await page.getByRole('button', { name: /log in|sign in/i }).click();

  await page.goto(`/auctions/any/lots/${lotId}`); // confirm exact path in Step 1
  await expect(page.getByRole('heading')).toBeVisible();

  await page.getByRole('button', { name: /place bid|bid now/i }).click();
  await page.getByRole('button', { name: /confirm/i }).click();

  await expect(page.getByText(/highest bidder|bid placed|you are winning/i)).toBeVisible();

  const bids = await page.request.get('/api/account/bids');
  expect(bids.ok()).toBeTruthy();
  const stats = await page.request.get('/api/account/stats');
  expect(stats.ok()).toBeTruthy();
});
```

- [ ] **Step 3: Run and align to the real lot-detail UI**

Run: `pnpm --filter @carat-room/e2e test:e2e specs/browse-and-bid.spec.ts`
Expected: PASS, including the SSE-driven "highest bidder" update. If the bid is rejected by a business rule (e.g. increment), fix the seed values in Step 2, not the assertion.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/browse-and-bid.spec.ts
git commit -m "test(e2e): browse and bid flow"
```

---

## Task 9: Flow 4 — Invoice & checkout

Won-lot invoice page → Stripe Checkout redirect, asserting the redirect URL without completing payment. Covers `account/invoices/[id]/page.tsx` (63 lines), `InvoiceDetail.tsx`, `api/payments/invoices/[id]/checkout/route.ts`, `api/account/invoices/[id]/route.ts` — the single largest uncovered cluster.

**Files:**
- Create: `tests/e2e/specs/invoice-checkout.spec.ts`
- Modify: `tests/e2e/support/seed.ts` (add the auction-close → invoice helper)

**Interfaces:**
- Consumes: seeding helpers; needs an invoice to exist. An invoice is created by the payment service reacting to `auction.closed`. Prefer driving a real auction close; if closing an auction on demand has no public trigger, seed a won lot via the fastest real path confirmed in Step 1.
- Produces: `closeAuctionAndAwaitInvoice(adminToken: string, lotId: string, winnerUserId: string): Promise<{ invoiceId: string }>` in `seed.ts`.

- [ ] **Step 1: Determine how an invoice comes to exist for a user**

Run: `grep -rEn "invoice|auction.closed|payment.invoice.created" apps/payment/src apps/auction-engine/src | grep -iE "created|close|consume|handler" | head`
Establish the real chain: how to close an auction so `payment` issues an invoice, and the invoice-list endpoint the portal reads. Record the shortest real trigger.

- [ ] **Step 2: Write the failing spec `tests/e2e/specs/invoice-checkout.spec.ts`**

```typescript
import { test, expect } from '../support/fixtures';
import {
  registerAndVerifyUser,
  verifyPhone,
  seedLot,
  seedAuction,
  closeAuctionAndAwaitInvoice,
} from '../support/seed';

test('view a won-lot invoice and start Stripe checkout', async ({ page }) => {
  const admin = await registerAndVerifyUser({ role: 'ADMIN' });
  const { lotId } = await seedLot(admin.accessToken);
  await seedAuction(admin.accessToken, lotId);

  const winner = await registerAndVerifyUser();
  await verifyPhone(winner.accessToken);
  // ...log in as winner, place the winning bid (reuse browse-and-bid steps), then:
  const { invoiceId } = await closeAuctionAndAwaitInvoice(admin.accessToken, lotId, winner.userId);

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(winner.email);
  await page.getByLabel(/password/i).fill(winner.password);
  await page.getByRole('button', { name: /log in|sign in/i }).click();

  await page.goto(`/account/invoices/${invoiceId}`);
  await expect(page.getByText(/invoice|amount due/i)).toBeVisible();

  const [checkout] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/payments/invoices/') && r.url().includes('/checkout')),
    page.getByRole('button', { name: /pay|checkout/i }).click(),
  ]);
  expect(checkout).toBeTruthy();
  await expect(page).toHaveURL(/checkout\.stripe\.com|\/account\/invoices\//);
});
```

- [ ] **Step 3: Run — do not complete payment, only assert the redirect starts**

Run: `pnpm --filter @carat-room/e2e test:e2e specs/invoice-checkout.spec.ts`
Expected: PASS. The Checkout redirect URL is asserted; payment is never completed.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/invoice-checkout.spec.ts tests/e2e/support/seed.ts
git commit -m "test(e2e): invoice detail and Stripe checkout redirect flow"
```

---

## Task 10: Flow 5 — Fulfilment

Choose shipping address, choose collection slot. Covers `account/fulfilments/[id]/page.tsx` and both shipping proxy routes (`api/shipping/fulfilments/[id]/address/route.ts`, `api/shipping/fulfilments/[id]/collection-slot/route.ts`).

**Files:**
- Create: `tests/e2e/specs/fulfilment.spec.ts`
- Modify: `tests/e2e/support/seed.ts` (add the fulfilment seed helper)

**Interfaces:**
- Consumes: seeding helpers; a fulfilment record follows a paid invoice / closed auction. Confirm the real trigger in Step 1.
- Produces: `seedFulfilmentForUser(user: Awaited<ReturnType<typeof registerAndVerifyUser>>): Promise<{ fulfilmentId: string }>` in `seed.ts`.

- [ ] **Step 1: Determine how a fulfilment record is created and listed**

Run: `grep -rEn "fulfilment|collection.slot|address|shipping.item" apps/shipping/src | grep -iE "created|consume|handler|route" | head`
Record how a fulfilment id becomes available to the winning user and the collection-slot options endpoint.

- [ ] **Step 2: Write the failing spec `tests/e2e/specs/fulfilment.spec.ts`**

```typescript
import { test, expect } from '../support/fixtures';
import { registerAndVerifyUser, verifyPhone, seedFulfilmentForUser } from '../support/seed';

test('choose a shipping address then switch to a collection slot', async ({ page }) => {
  const user = await registerAndVerifyUser();
  await verifyPhone(user.accessToken);
  const { fulfilmentId } = await seedFulfilmentForUser(user);

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /log in|sign in/i }).click();

  await page.goto(`/account/fulfilments/${fulfilmentId}`);

  await page.getByRole('radio', { name: /ship|delivery/i }).check();
  await page.getByLabel(/address line 1/i).fill('1 Test Street');
  await page.getByLabel(/city|town/i).fill('London');
  await page.getByLabel(/postcode|postal/i).fill('SW1A 1AA');
  await page.getByRole('button', { name: /save|confirm address/i }).click();
  await expect(page.getByText(/address saved|dispatch/i)).toBeVisible();

  await page.getByRole('radio', { name: /collect|collection/i }).check();
  await page.getByRole('button', { name: /choose slot|book slot/i }).first().click();
  await expect(page.getByText(/collection booked|slot confirmed/i)).toBeVisible();
});
```

- [ ] **Step 3: Run and align to the real fulfilment page**

Run: `pnpm --filter @carat-room/e2e test:e2e specs/fulfilment.spec.ts`
Expected: PASS for both the address and collection-slot branches.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/fulfilment.spec.ts tests/e2e/support/seed.ts
git commit -m "test(e2e): fulfilment address and collection-slot flow"
```

---

## Task 11: Merge V8 coverage to per-portal lcov and register with Sonar

Finalise the lcov builder to emit `tests/e2e/coverage/user-portal/lcov.info` (and `admin-portal/lcov.info` if an admin flow exists), then append those paths to `sonar.javascript.lcov.reportPaths`.

**Files:**
- Modify: `tests/e2e/scripts/build-lcov.mjs` (generalise the spike script)
- Modify: `sonar-project.properties`
- Modify: `tests/e2e/package.json` (`coverage:report` script args if needed)

**Interfaces:**
- Consumes: server V8 dump dir `/tmp/e2e-cov/user-portal/server` and client dir `/tmp/e2e-cov/user-portal/client` (from Tasks 5 & 6).
- Produces: `tests/e2e/coverage/user-portal/lcov.info` with `SF:` lines rooted at `apps/user-portal/src/**`.

- [ ] **Step 1: Generalise `build-lcov.mjs` to take a portal name**

```javascript
import { CoverageReport } from 'monocart-coverage-reports';

const portal = process.env.PORTAL ?? 'user-portal';
const serverDir = `/tmp/e2e-cov/${portal}/server`;
const clientDir = `/tmp/e2e-cov/${portal}/client`;
const outDir = `./coverage/${portal}`;
const sourceRoot = `apps/${portal}/src`;

const report = new CoverageReport({
  name: `E2E Coverage (${portal})`,
  outputDir: outDir,
  reports: [['lcovonly', { file: 'lcov.info' }]],
  sourceFilter: (path) => path.includes(`apps/${portal}/src/`) && !path.includes('/node_modules/'),
});

await report.addFromDir(serverDir);
await report.addFromDir(clientDir);
const results = await report.generate();
const mapped = (results.files ?? []).filter((f) => f.sourcePath?.includes(sourceRoot));
console.log(`[${portal}] mapped src files: ${mapped.length}`);
if (mapped.length === 0) {
  console.error(`FIDELITY FAILURE for ${portal}: no ${sourceRoot} files in lcov`);
  process.exit(1);
}
```

- [ ] **Step 2: Run the full suite once and build the lcov**

Run:
```bash
docker compose -f docker-compose.test.yml up -d --build   # + health wait
rm -rf /tmp/e2e-cov
pnpm turbo build --filter=user-portal
pnpm --filter @carat-room/e2e test:e2e
PORTAL=user-portal pnpm --filter @carat-room/e2e coverage:report
```
Expected: suite passes; "[user-portal] mapped src files: N" with N covering the flow targets.

- [ ] **Step 3: Confirm the invoice page (largest cluster) appears covered**

Run: `grep -E 'SF:.*account/invoices/\[id\]/page' tests/e2e/coverage/user-portal/lcov.info`
Expected: an `SF:` line present, with non-zero `DA:` hits following it.

- [ ] **Step 4: Append the E2E lcov paths to `sonar-project.properties`**

Edit the `sonar.javascript.lcov.reportPaths` line to:
```properties
sonar.javascript.lcov.reportPaths=apps/*/coverage/lcov.info,packages/*/coverage/lcov.info,tests/e2e/coverage/user-portal/lcov.info,tests/e2e/coverage/admin-portal/lcov.info
```
(Keep the admin-portal path even if no admin flow exists yet — Sonar ignores a missing report path with a warning, and it is ready when an admin flow is added.)

- [ ] **Step 5: Ensure generated coverage is not committed as a source**

Add `tests/e2e/coverage/` and `tests/e2e/test-results/` and `tests/e2e/playwright-report/` to `.gitignore` (create/append). Confirm: `git check-ignore tests/e2e/coverage/user-portal/lcov.info` prints the path.

- [ ] **Step 6: Tear down and commit**

```bash
docker compose -f docker-compose.test.yml down -v
git add tests/e2e/scripts/build-lcov.mjs tests/e2e/package.json sonar-project.properties .gitignore
git commit -m "test(e2e): merge V8 coverage to lcov and register with SonarCloud"
```

---

## Task 12: CI wiring in `ci.yml`

Insert the E2E steps between `pnpm turbo test` and the SonarCloud scan, in the same `ci` job Sonar scans from. `integration-tests.yml` stays unchanged.

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the boot commands from Task 2, the `test:e2e` + `coverage:report` scripts, and the env vars from Task 5's `globalSetup`.

- [ ] **Step 1: Add the E2E steps to the `ci` job**

Insert after the `- run: pnpm turbo test` step and before the `SonarCloud Scan` step:

```yaml
      - name: Start test stack
        run: docker compose -f docker-compose.test.yml up -d --build
        env:
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
          STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET }}

      - name: Wait for services to be healthy
        run: |
          timeout 180 bash -c '
            while docker compose -f docker-compose.test.yml ps --format json |
              jq -r "select(.Health != \"healthy\" and .Health != \"\") | .Service" | grep -q .; do
              sleep 5
            done'
          sleep 10

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - name: Install Playwright Chromium
        run: pnpm --filter @carat-room/e2e exec playwright install --with-deps chromium

      - name: Run E2E suite with coverage
        run: pnpm --filter @carat-room/e2e test:e2e
        env:
          USER_SERVICE_URL: http://localhost:3001
          CATALOGUE_SERVICE_URL: http://localhost:3002
          AUCTION_ENGINE_URL: http://localhost:3003
          PAYMENT_SERVICE_URL: http://localhost:3004
          SHIPPING_SERVICE_URL: http://localhost:3006
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY }}
          SEED_USER_DB_URL: postgresql://carat:carat_test@localhost:5433/user_test

      - name: Build E2E lcov
        run: PORTAL=user-portal pnpm --filter @carat-room/e2e coverage:report

      - name: Upload E2E artifacts on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-report
          path: |
            tests/e2e/playwright-report
            tests/e2e/test-results
          retention-days: 3

      - name: Tear down test stack
        if: always()
        run: docker compose -f docker-compose.test.yml down -v
```
The portal itself is started by Playwright's `globalSetup` (Task 5) using the `.next` build from the earlier `pnpm turbo build` step — no separate portal step needed. The SonarCloud step is unchanged; it now finds the extra lcov via the Task 11 `reportPaths`.

- [ ] **Step 2: Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` as a repo secret (manual prerequisite)**

Document in `tests/e2e/README.md` that this secret must exist (same pattern as `SONAR_TOKEN`, `STRIPE_SECRET_KEY`). Without it, Flow 2's card step self-skips — the job still passes.

- [ ] **Step 3: Validate the workflow YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ci.yml valid')"`
Expected: `ci.yml valid`.

- [ ] **Step 4: Confirm step order — E2E before Sonar, after build/test**

Run: `grep -nE 'pnpm turbo build|pnpm turbo test|Run E2E suite|SonarCloud Scan' .github/workflows/ci.yml`
Expected: line numbers ascend in the order build → test → E2E → Sonar.

- [ ] **Step 5: Commit and push to trigger CI**

```bash
git add .github/workflows/ci.yml tests/e2e/README.md
git commit -m "ci: run Playwright E2E suite with coverage before SonarCloud scan"
git push
```

- [ ] **Step 6: Watch the CI run end-to-end**

Run: `gh run watch $(gh run list --branch $(git branch --show-current) --limit 1 --json databaseId -q '.[0].databaseId')`
Expected: the `ci` job is green including the E2E step. If the E2E step fails, it fails the job before Sonar runs (exactly like a unit-test failure) — download the `e2e-report` artifact to diagnose.

---

## Task 13: Unit-test stragglers (Part 3)

Cover the files E2E through the portals cannot reach. Each extends an existing co-located test file in the repo's established vitest pattern. Small, TDD, one commit.

**Files (all Modify unless the test file is absent, then Create beside the source):**
- `packages/shared-types/src/events/index.test.ts` — event exports (3 lines)
- `apps/catalogue/src/presentation/catalogue-router.test.ts` — branches added by the image-processing PR (3 lines)
- `apps/user-portal/src/lib/auction.test.ts` — branch (3 lines)
- `apps/user-portal/src/lib/jwt.test.ts` — branch (2 lines) [Create if absent — no `jwt.test.ts` exists today]
- `apps/admin-portal/src/components/image-uploader.test.tsx` — error branches (7 lines)
- `apps/admin-portal/src/app/admin/lots/[id]/page.test.tsx` — (3 lines) [Create if absent]

- [ ] **Step 1: Read each target to find the exact uncovered branches**

Run:
```bash
cat packages/shared-types/src/events/index.ts apps/user-portal/src/lib/jwt.ts apps/user-portal/src/lib/auction.ts
sed -n '55,80p' apps/catalogue/src/presentation/catalogue-router.ts
```
Identify the specific untested export/branch in each (e.g. the error path in `image-uploader.tsx`, the fallback branch in `auction.ts`).

- [ ] **Step 2: For each file — write the failing test, run it red, implement nothing (code exists), run green**

The code already exists; these are coverage tests, so the cycle is: write test → run → it should pass (or reveal a genuine bug). Example for `jwt.ts` (adapt to the real signature found in Step 1):

```typescript
import { describe, it, expect } from 'vitest';
import { decodeJwtPayload } from './jwt';

describe('decodeJwtPayload', () => {
  it('should_returnNull_when_tokenIsMalformed', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
  });
});
```
Repeat per file, targeting the specific uncovered branch. Follow Arrange/Act/Assert with blank-line separation and `should_..._when_...` naming.

- [ ] **Step 3: Run each package's tests with coverage and confirm the target lines are hit**

Run (per package):
```bash
pnpm --filter shared-types test
pnpm --filter catalogue test
pnpm --filter user-portal test
pnpm --filter admin-portal test
```
Expected: all pass. Spot-check one lcov: `grep -A2 'jwt.ts' apps/user-portal/coverage/lcov.info` shows the previously-zero lines now hit.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types apps/catalogue apps/user-portal apps/admin-portal
git commit -m "test: cover straggler branches for new-code coverage"
```

---

## Task 14: Local run docs and final Quality Gate verification

Finish `tests/e2e/README.md` and confirm the gate is green.

**Files:**
- Modify: `tests/e2e/README.md`
- Modify: `CLAUDE.md` (add the two E2E run commands under Key Commands)
- Modify: `docs/superpowers/SESSION-SUMMARY.md` (mark the coverage-gap work status)

- [ ] **Step 1: Document the two-command local run**

`tests/e2e/README.md` must state exactly:
```bash
docker compose -f docker-compose.test.yml up -d --build   # + wait for health
pnpm --filter @carat-room/e2e test:e2e
```
plus the coverage mode chosen in Task 4, the env vars, and the `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` secret note.

- [ ] **Step 2: Add the commands to `CLAUDE.md` Key Commands**

Append an "E2E (Playwright, coverage)" subsection mirroring the README two commands.

- [ ] **Step 3: Verify the full local pipeline once, exactly as CI runs it**

Run:
```bash
pnpm install --frozen-lockfile && pnpm turbo build && pnpm lint && pnpm turbo test
docker compose -f docker-compose.test.yml up -d --build   # + health wait
pnpm --filter @carat-room/e2e exec playwright install chromium
pnpm --filter @carat-room/e2e test:e2e
PORTAL=user-portal pnpm --filter @carat-room/e2e coverage:report
docker compose -f docker-compose.test.yml down -v
```
Expected: every step green; `tests/e2e/coverage/user-portal/lcov.info` produced.

- [ ] **Step 4: Confirm the SonarCloud Quality Gate on `main`**

After the CI run on `main` completes, check the gate. Expected: all six conditions OK and `new_coverage ≥ 80%` (projected ~95% per the spec line budget). If still short, read the SonarCloud `measures/component_tree` breakdown for the remaining uncovered new lines and map each to the flow/unit test that should have hit it — do not add exclusions to mask genuinely untested code.

- [ ] **Step 5: Mark the plan complete and commit the status update**

Update `docs/superpowers/SESSION-SUMMARY.md`, then:
```bash
git add tests/e2e/README.md CLAUDE.md docs/superpowers/SESSION-SUMMARY.md docs/superpowers/plans/2026-07-12-coverage-gap-e2e.md
git commit -m "docs: E2E run docs and mark coverage-gap plan complete"
```

---

## Self-review against the spec

Checked paragraph-by-paragraph against `docs/superpowers/specs/2026-07-12-coverage-gap-e2e-design.md`:

- Part 1 (test.inclusions + coverage.exclusions, `sonar.coverage.exclusions` not `sonar.exclusions`) → **Task 1**.
- Part 2 workspace (`tests/e2e`, `@carat-room/e2e`, no `test` script, Chromium, `retries: 1` in CI) → **Task 3**.
- Runtime topology (backend in compose, portals on host from `.next`, service URLs to localhost ports) → **Tasks 3, 5, 12**.
- Coverage collection (Playwright client V8 + `NODE_V8_COVERAGE` server, SIGTERM, monocart → lcov, `productionBrowserSourceMaps`, per-portal lcov appended to reportPaths) → **Tasks 3, 4, 5, 11**.
- Five flows (Auth, Register-to-bid, Browse & bid, Invoice & checkout, Fulfilment) with named file targets → **Tasks 6–10**.
- Seeding via public APIs + SQL for admin promotion, unique per-spec ids, fresh stack per run → **Task 5** (+ down -v in Tasks 11/12/14).
- Known risk + fallback (spike proving lcov fidelity for one route + one page; `next dev` fallback) → **Task 4** (gates the flows).
- Part 3 unit stragglers (6 named files) → **Task 13**.
- Part 4 CI wiring (steps between `pnpm turbo test` and Sonar, health-wait loop, Playwright cache, down -v `if: always()`, Sonar step unchanged) → **Task 12**.
- Dependency (compose stack must build; fix build blockers as a prerequisite, not scope creep) → **Task 2**.
- Success criteria (gate green, CI green, two documented commands, no service code changes) → **Task 14** + Global Constraints.
- Line budget totals (~388 of 391) is descriptive, not a build step — no task needed.
- Out-of-scope items (deep Docker root-causing, old-code coverage, visual/cross-browser/perf) are respected: no task pursues them.

