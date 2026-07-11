# Closing the SonarCloud New-Code Coverage Gap — Design

**Date:** 2026-07-12
**Status:** Approved
**Goal:** Turn the SonarCloud Quality Gate green by raising coverage on new code from 44.4% to ≥ 80%, using measurement corrections plus a Playwright E2E suite that produces lcov coverage, supplemented by a handful of unit tests.

## Context

The Quality Gate on `main` fails on exactly one condition: `new_coverage` is 44.4% against a required 80%. All other conditions (reliability A, security A, maintainability A, duplication 0%, hotspots 100% reviewed) pass.

The gap is 391 uncovered new lines (out of ~703 new lines to cover), measured over the 30-day new-code period. Analysis of the per-file breakdown (SonarCloud `measures/component_tree` API) shows three distinct clusters:

1. **~107 lines are test files miscounted as production code.** `sonar-project.properties` declares `sonar.test.inclusions=**/*.test.ts`, which does not match `.test.tsx`. Files such as `apps/admin-portal/src/components/image-uploader.test.tsx` (59 lines), `lot-detail-client.test.tsx` (30) and `calendar/page.test.tsx` (16) are therefore treated as source needing coverage.
2. **~12 lines are composition roots and build config** — `apps/*/src/main.ts` bootstrap files and `apps/user-portal/next.config.mjs`. These are wiring (env reads, dependency injection), conventionally excluded from coverage.
3. **~272 lines are genuinely untested code**, almost entirely in `apps/user-portal`: the invoice detail page (63), fulfilment detail page (35), lot-detail client (33), lot detail page (17), nine API proxy routes (~59 combined), the register-to-bid wizard remainder (12), `InvoiceDetail` (14), auth client components (16), plus small remainders in `admin-portal`, `catalogue`, and `shared-types`.

## Decisions made during brainstorming

- **Scope:** measurement corrections *and* tests, covering everything testable (not just enough to scrape past 80%).
- **Test style:** browser E2E (Playwright) as the primary coverage mechanism, chosen deliberately over the existing mocked-unit-test pattern. Rationale: this repo's recorded lessons repeatedly document mocked tests passing while real flows were broken ("drive the actual flow in the browser", "proxy tests that mock the downstream client pass even when the endpoint was never implemented"). E2E is the test style that would have caught those bugs.
- **CI placement:** the E2E suite runs inside `ci.yml` (the job Sonar scans from), not in a separate workflow with artifact hand-off.
- **No additional local coverage guard:** the Sonar gate itself is the enforcement mechanism; no vitest thresholds.

## Part 1 — Measurement corrections (`sonar-project.properties`)

Two changes, no code behaviour affected:

```properties
sonar.test.inclusions=**/*.test.ts,**/*.test.tsx
sonar.coverage.exclusions=apps/*/src/main.ts,**/next.config.mjs
```

- The first classifies `.tsx` test files as tests, removing ~107 phantom uncovered lines.
- The second excludes composition roots and Next config **from coverage only**. It deliberately uses `sonar.coverage.exclusions`, not `sonar.exclusions`, so these files remain analysed for bugs and vulnerabilities (the recently fixed S5332 findings live in `main.ts`; they must stay scanned).

Expected effect: new-code coverage rises to ~52–53% purely from measuring correctly.

## Part 2 — Playwright E2E suite with coverage

### Workspace

New package `tests/e2e` (`@carat-room/e2e`), added to `pnpm-workspace.yaml`'s `packages` globs. It has **no `test` script** — `pnpm turbo test` never attempts it without a stack — and exposes `test:e2e`, invoked explicitly by CI and locally. Playwright with Chromium only; `retries: 1` in CI for flake tolerance.

### Runtime topology

- Backend services, Postgres, Redis, RabbitMQ: the existing `docker-compose.test.yml` stack, unchanged.
- The two Next.js portals run **on the CI host, not in Docker**, started from the `.next` builds that `pnpm turbo build` already produced earlier in the job, with service-URL env vars pointing at the compose-mapped localhost ports. Host-side execution is what makes coverage collection possible.

### Coverage collection

Two collection points, merged per portal:

| Code | Mechanism |
|---|---|
| Client (pages, client components) | Playwright's Chromium coverage API records V8 coverage per page session |
| Server (API proxy routes, server components) | Portal processes start with `NODE_V8_COVERAGE=<dir>`; Node writes V8 coverage on graceful shutdown — the CI step must stop the portals with SIGTERM/SIGINT (never SIGKILL) or the dump is lost |

`monocart-coverage-reports` converts the combined V8 dumps to lcov, mapped back to TypeScript sources via source maps (`productionBrowserSourceMaps: true` added to both portals' Next configs). Output: `tests/e2e/coverage/user-portal/lcov.info` and `tests/e2e/coverage/admin-portal/lcov.info`, appended to `sonar.javascript.lcov.reportPaths`. Sonar merges these with the existing unit-test lcov — E2E coverage supplements, never replaces.

### Flows

Chosen so that every uncovered production file is executed:

1. **Auth** — register → verify email → login → session refresh. Covers `login-client.tsx`, `verify-email-client.tsx`, `verify-phone/page.tsx`, `api/auth/refresh/route.ts`.
2. **Register-to-bid** — identity document upload → card authorisation with a Stripe test key. Covers the wizard remainder. Requires `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` as a repo secret (manual prerequisite, same pattern as `SONAR_TOKEN`).
3. **Browse & bid** — auctions list → lot detail → live SSE updates → place a bid. Covers `lot-detail-client.tsx`, lot `page.tsx`, `api/auctions/[lotId]/stream/route.ts`, `api/auctions/[lotId]/bids/route.ts`, `api/account/bids` and `stats` routes.
4. **Invoice & checkout** — won-lot invoice page → Stripe Checkout redirect, asserting the redirect URL without completing payment. Covers `account/invoices/[id]/page.tsx` (63 lines), `InvoiceDetail.tsx`, `api/payments/invoices/[id]/checkout/route.ts`, `api/account/invoices/[id]/route.ts`.
5. **Fulfilment** — choose shipping address, choose collection slot. Covers `account/fulfilments/[id]/page.tsx`, both shipping proxy routes.

### Seeding

Each spec seeds its own data through the services' public APIs (register its own user, create its own lot/auction via admin endpoints), with direct SQL used only where no API exists (e.g. promoting the seed user to `ADMIN` role). Unique per-spec identifiers avoid cross-spec interference. A fresh stack per CI run (`docker compose down -v`) keeps runs deterministic.

### Known risk and fallback

Mapping server-side V8 coverage through Next's production bundles back to `src/**` is the finicky part of this design. The implementation plan must front-load a **spike task** proving lcov fidelity for one API route and one page before the flows are built. Fallback if production-build mapping is unreliable: run the portals in `next dev` mode during E2E — slower, but dev-mode source maps are exact.

## Part 3 — Unit-test stragglers

E2E through the portals cannot execute everything. Small unit tests in the existing repo patterns cover the remainder:

- `packages/shared-types/src/events/index.ts` (3 lines) — test the event exports.
- `apps/catalogue/src/presentation/catalogue-router.ts` (3 lines) — extend the existing router tests for the branches added by the image-processing PR.
- `apps/user-portal/src/lib/auction.ts` (3) and `src/lib/jwt.ts` (2) — branch tests added to existing test files.
- `apps/admin-portal/src/components/image-uploader.tsx` (7, error branches) — extend its existing unit test file.
- `apps/admin-portal/src/app/admin/lots/[id]/page.tsx` (3) — extend/add a unit test.

## Part 4 — CI wiring (`ci.yml`)

New steps between `pnpm turbo test` and the SonarCloud scan:

1. `docker compose -f docker-compose.test.yml up -d --build`, followed by the same health-wait loop `integration-tests.yml` already uses.
2. Install Playwright Chromium, cached with `actions/cache` keyed on the Playwright version.
3. Start both portals from their existing `.next` builds with `NODE_V8_COVERAGE` set and service URLs pointing at compose ports.
4. `pnpm --filter @carat-room/e2e test:e2e`, then the lcov conversion.
5. `docker compose -f docker-compose.test.yml down -v` under `if: always()`.

The Sonar step itself is unchanged — it simply finds more lcov files via the updated `sonar.javascript.lcov.reportPaths`. An E2E failure fails the job before Sonar runs, exactly like a unit-test failure. Estimated cost: 6–10 minutes per CI run (service image builds dominate). `integration-tests.yml` stays as-is.

## Success criteria

- SonarCloud Quality Gate on `main`: all six conditions OK, `new_coverage ≥ 80%` (projected ~95% based on the line budget below).
- `ci.yml` green end-to-end including the E2E step.
- E2E runnable locally with two documented commands (compose up, then `test:e2e`).
- **No service code changes.** If a flow cannot pass against the real stack, that is a product bug to surface and report, not to code around.

### Line budget

| Cluster | Uncovered lines reclaimed |
|---|---|
| Test-file reclassification | ~107 |
| Coverage exclusions (main.ts, next.config.mjs) | ~10 |
| E2E flows | ~250 |
| Unit-test stragglers | ~21 |
| **Total** | **~388 of 391** |

## Dependency: the compose stack must actually build

Service Docker builds have shown a pre-existing `tsc --build` MODULE_NOT_FOUND failure locally (user-auth, shipping at minimum). The E2E design depends on `docker compose -f docker-compose.test.yml up -d --build` succeeding, so the spike task must validate the stack boots in CI first. If builds fail there too, **fixing them becomes an explicit prerequisite task in the implementation plan** — a dependency of this work, handled before any flow is written, not silent scope creep.

## Out of scope

- Root-causing the Docker build failures beyond what the E2E stack needs (see the dependency note above — the plan fixes them only if and where they block the compose stack from booting).
- Raising coverage of *old* code (the gate measures new code only).
- Visual regression testing, cross-browser matrices, or performance testing in the E2E suite.
