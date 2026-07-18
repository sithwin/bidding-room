# Admin-portal E2E coverage — design

**Date:** 2026-07-18
**Status:** Approved
**Scope:** First sub-project of a two-part effort to close Playwright coverage gaps
across both frontends. This spec covers **admin-portal only** (currently zero E2E
coverage). A follow-up spec will cover the remaining uncovered user-portal pages
(`/account/dashboard`, `/account/profile`, `/account/watchlist`, `/account/won`,
`/account/bids`, `/calendar`, `/sell`, `/auctions` list) — out of scope here.

## Background

`tests/e2e/specs/` has 7 specs, all driving `user-portal` against the real backend
stack (see `docs/superpowers/plans/2026-07-12-coverage-gap-e2e.md` and
`tests/e2e/README.md`). `admin-portal` (`apps/admin-portal`, 14 route trees under
`apps/admin-portal/src/app/admin/`) has never been driven by Playwright — no specs,
no CI step, no backend service in the test stack.

## Section 1 — Backend infra gap

The `admin` backend service (`apps/admin`, Hono, port 3007, proxied by
`apps/admin-portal/src/app/api/admin/[...path]/route.ts`) is fully implemented —
lots/categories/auctions/users/invoices/fulfilments/reports/enquiries routers all
exist — but is **absent from `docker-compose.test.yml`**. Its database
(`admin_test`) already exists in `tests/db-init/init.sql`, so this is purely a
missing compose service block, not a schema gap.

Add an `admin` service to `docker-compose.test.yml`, mirroring the existing
`auction-engine` block:

- `ADMIN_DATABASE_URL` → `postgresql://carat:carat_test@postgres:5432/admin_test`
- `CATALOGUE_SERVICE_URL`, `AUCTION_ENGINE_URL`, `USER_SERVICE_URL`,
  `PAYMENT_SERVICE_URL`, `SHIPPING_SERVICE_URL` (internal Docker hostnames, matching
  the other services' blocks)
- `RABBITMQ_URL`, `REDIS_HOST`/`REDIS_PORT`
- `JWT_PUBLIC_KEY` (shared `*jwt-public-key` anchor already used by every service)
- `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME`
  (reuse the same test-bucket values `user-auth`'s block already sets)
- `PORT: '3007'`, host port mapping `3007:3007`
- Healthcheck against `/health` (already implemented: `{ status: 'ok', service:
  'admin' }`), `depends_on` postgres/redis/rabbitmq with `service_healthy`

Add `admin` to every health-wait loop and the `/health` smoke-check table in
`tests/e2e/README.md`, and to the `docker compose ... restart <service>` retry note
if it exhibits the same startup race the other services do.

## Section 2 — Playwright harness for admin-portal

- `tests/e2e/playwright.admin.config.ts` — same shape as `playwright.config.ts`,
  with `baseURL` from `ADMIN_PORTAL_URL` (default `http://localhost:3008`),
  `testDir: './specs-admin'`, `globalSetup: './global-setup.admin.ts'`. Same
  `use` block (trace, screenshot, headless-in-CI) and single `chromium` project.
- `tests/e2e/global-setup.admin.ts` — boots only `admin-portal` via the existing
  `startPortal()` helper (`support/portal.ts`, already generic over `{ name, port,
  coverageDir, env }` — no changes needed there). Passes the five existing
  `*_SERVICE_URL` vars plus a new `ADMIN_SERVICE_URL`. No mock-Google-server: admin
  login is email/password only. Uses `ADMIN_PORTAL_PORT` from `support/env.ts`,
  which already exists (unused today).
- `tests/e2e/support/env.ts` — add `adminService: process.env.ADMIN_SERVICE_URL ??
  'http://localhost:3007'` to `SERVICE_URLS`.
- `tests/e2e/package.json` (the `@carat-room/e2e` package) — add script
  `"test:e2e:admin": "playwright test -c playwright.admin.config.ts"`.
- Seeding reuses `support/seed.ts`'s existing `registerAndVerifyUser({ role:
  'ADMIN' })` unchanged — it already promotes via direct SQL and logs in through the
  real `/api/users/login` endpoint. Specs then drive the actual `/admin/login` form
  with those credentials (not a cookie injection), so the login page itself gets
  real coverage.
- `scripts/build-lcov.mjs` already reads `PORTAL` (default `user-portal`) and
  derives `SOURCE_ROOT` as `apps/<portal>/src` — no changes needed.
  `PORTAL=admin-portal pnpm --filter @carat-room/e2e coverage:report` works as-is.

## Section 3 — Spec breakdown

Nine spec files under `tests/e2e/specs-admin/`, one per `apps/admin`
presentation-layer router, each driving real UI actions (create/edit forms, not
just navigation) to generate meaningful line coverage:

| Spec | Flow | Backend router |
|---|---|---|
| `admin-auth.spec.ts` | Login (valid/invalid creds, non-admin role rejected), logout, dashboard loads | `api/auth` route (admin-portal itself) |
| `admin-lots.spec.ts` | Create lot via `/admin/lots/new`, appears in `/admin/lots` list, edit via `/admin/lots/[id]` | `lots-router` |
| `admin-categories.spec.ts` | Create/edit category on `/admin/categories` | `categories-router` |
| `admin-auctions.spec.ts` | Schedule auction for a seeded lot via `/admin/auctions/new`, view/edit via `/admin/auctions/[lotId]` | `auctions-router` |
| `admin-users.spec.ts` | View seeded bidder in `/admin/users` list, view detail `/admin/users/[id]`, create new admin user via `/admin/users/new` | `users-router` |
| `admin-invoices.spec.ts` | View `/admin/invoices` list and a seeded invoice's detail page | `invoices-router` |
| `admin-fulfilments.spec.ts` | View `/admin/fulfilments` list and detail, update status where the UI supports it | `fulfilments-router` |
| `admin-enquiries.spec.ts` | Seed/submit a valuation enquiry, view/respond to it in `/admin/enquiries` | `enquiries-router` |
| `admin-reports.spec.ts` | Load `/admin/reports`, assert real (non-placeholder) figures render | `reports-router` |

Seeding uses `support/seed.ts`'s existing helpers (`registerAndVerifyUser`,
`LotSeed`/`AuctionSeed` POST helpers) for prerequisite data only; the spec under
test always drives the admin UI for the action being verified.

## Section 4 — CI wiring, error handling, and known gaps

**CI (`.github/workflows/ci.yml`)**: new step after the existing user-portal E2E
step — rebuild `admin-portal` with real service URLs (same pattern as the existing
"Rebuild user-portal with real service URLs" step), run `pnpm --filter
@carat-room/e2e test:e2e:admin`, then `PORTAL=admin-portal pnpm --filter
@carat-room/e2e coverage:report`. Both lcov reports (`coverage/user-portal/lcov.info`,
`coverage/admin-portal/lcov.info`) registered in `sonar.javascript.lcov.reportPaths`.
A separate, later CI step runs the `@visual` spec only (`--grep @visual`, see
Section 5) — isolated so a pixel-diff flake can't fail the functional-coverage
signal the two steps above produce.

**Required error-state assertions** (not just happy paths):
- Invalid login credentials → form error shown, no navigation.
- A non-ADMIN authenticated user hitting `/admin/login` → rejected (the 401/FORBIDDEN
  branch already implemented in `apps/admin-portal/src/app/api/auth/route.ts`).
- Create forms (lot, category, user) → validation errors render for empty required
  fields — every field the schema validates gets an error slot, per the existing
  "form must render an error slot for every field" project lesson.

**Known pre-existing gaps this work will likely surface, not fix**: per memory
(`admin-reports-endpoints-missing.md`, `admin-lots-status-edit-gaps.md`), the admin
reports endpoints and the lot-status edit path have known backend gaps. The
corresponding specs (`admin-reports.spec.ts`, the edit portion of
`admin-lots.spec.ts`) are expected to fail against real backend gaps rather than be
softened to pass around them — each such failure gets called out explicitly in the
task/plan report, not silently worked around.

**Explicitly out of scope**: remaining user-portal page gaps (dashboard, profile,
watchlist, won, bids, calendar, sell, auctions list page) — separate follow-up
design, per the two-part scoping decision made during brainstorming.

## Section 5 — QA depth: locators, accessibility, visual regression

Beyond "the action succeeded," each admin spec applies three additional layers so
the suite catches UX regressions, not just functional ones:

**1. User-facing locators + explicit outcome assertions.** Every spec locates
elements the way a user perceives them — `getByRole`, `getByLabel`,
`getByPlaceholder`, `getByText` — never CSS classes or DOM structure. Every
mutating action (create/edit/update-status/logout) asserts the actual user-visible
outcome text (e.g. `getByRole('status').getByText('Lot created')`), not just a URL
change or absence of a thrown error. This is a lint-by-convention rule applied
across all nine specs in Section 3, not a separate spec file.

**2. Accessibility scan per page (`@axe-core/playwright`).** New dev dependency
`@axe-core/playwright` in `tests/e2e/package.json`. A shared `support/a11y.ts`
exports one `runA11yScan(page)` fixture wrapping `AxeBuilder(...).analyze()`,
scoped with `.include()` to the main content region so nav chrome shared across
every page isn't scanned redundantly. Each of the nine specs calls it once per
distinct page reached (after navigation, and again after opening any dialog/form
overlay that changes the DOM materially) and asserts zero `serious`/`critical`
violations — `moderate`/`minor` are logged (console.warn from the fixture) but not
failed on, so the suite doesn't drown in pre-existing minor issues on day one.
This is the closest thing to automatic "what did we forget" discovery: it flags
un-labelled inputs, missing accessible names on icon-only buttons (e.g. a bare "←"
back control with no `aria-label`), and unreachable focus — the structural pattern
behind "form with no way back."

**3. Visual regression (`toHaveScreenshot`).** Tagged `@visual` and run as a
**separate** CI step/job from the functional specs (`playwright test -c
playwright.admin.config.ts --grep @visual`), so a pixel-diff flake never blocks
the functional-coverage signal Section 4's CI step depends on. Scope to
element-level captures of the main content region per page (not full-page), not
per-action — one visual spec `admin-visual.spec.ts` that navigates to each of the
14 admin routes and takes one stable screenshot each, rather than adding
screenshot assertions inside the nine CRUD specs. Required config:
`animations: 'disabled'`, `maxDiffPixelRatio: 0.01`, dynamic content (timestamps,
seeded IDs) masked via `mask: [...]`. Baselines are generated once in CI (the same
environment/OS/browser that will later compare against them, per the "generate
baselines in the same environment CI uses" rule) and committed under
`tests/e2e/specs-admin/admin-visual.spec.ts-snapshots/`; updating a baseline is a
deliberate, reviewed diff in its own commit, never an incidental part of a feature
change.

**Scope note:** layers 1–2 apply to all nine specs from day one. Layer 3
(`admin-visual.spec.ts`) is a tenth, additive spec — it does not block the
Section 3 specs and can land in the same plan as a separate task so a flaky
baseline never holds up the functional-coverage work that's this design's primary
goal.
