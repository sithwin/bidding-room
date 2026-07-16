# Session Summary — The Carat Room Auction Platform

**Date:** 2026-06-20
**Session cost:** ~$5.15

---

## What Was Built This Session

### 1. Design Specs (all approved)
Saved to `docs/superpowers/specs/`:

| File | Contents |
|---|---|
| `2026-06-20-architecture-design.md` | Services map, Docker Compose on Hetzner VM, RabbitMQ events, auth, repo structure |
| `2026-06-20-backend-user-portal-design.md` | User, Catalogue, Auction Engine, Payment, Notification, Shipping services |
| `2026-06-20-backend-admin-portal-design.md` | Admin Service API — all management endpoints |
| `2026-06-20-frontend-user-portal-design.md` | User-facing Next.js app — all pages, SSE, auth flow |
| `2026-06-20-frontend-admin-portal-design.md` | Admin Next.js app — all management pages |

### 2. Domain Folder Structure
Saved to `docs/superpowers/plans/`:

```
00-infrastructure/        README.md + plan.md  ✅ COMPLETE
01-shared-packages/       README.md + plan.md  ✅ COMPLETE
02-domain-user-auth/      README.md + plan.md  ✅ COMPLETE
03-domain-catalogue/      README.md + plan.md  ✅ COMPLETE
04-domain-auction-engine/ README.md + plan-part-a-core.md + plan-part-b-presentation.md  ✅ COMPLETE
05-domain-payment/        README.md + plan.md  ✅ COMPLETE
06-domain-shipping/       README.md + plan.md  ✅ COMPLETE
07-domain-notification/   README.md + plan.md  ✅ COMPLETE
08-domain-admin/          README.md + plan-part-a-backend.md + plan-part-b-frontend.md  ✅ COMPLETE
09-integration-testing/   README.md + plan.md  ✅ COMPLETE
```

### Consolidated Service Map (updated 2026-06-20)

| Consolidated Service | Port | Source Plans |
|---|---|---|
| `core-service` | 3001 | 02-domain-user-auth + 03-domain-catalogue |
| `auction-engine` | 3002 | 04-domain-auction-engine |
| `payment-service` | 3003 | 05-domain-payment |
| `fulfilment-service` | 3004 | 06-domain-shipping + 07-domain-notification |
| `admin-service` | 3005 | 08-domain-admin (backend) |

---

## Key Decisions Made

| Decision | Choice |
|---|---|
| Service grouping | 5 consolidated services — core, auction-engine, payment, fulfilment, admin |
| Platform type | Timed auctions only, business lists all lots (no sellers) |
| Anti-sniping | Auto-extend timer on late bids |
| Reserve price | Hidden — lot unsold if not met, no indicator shown to bidders |
| Payment | Pay-on-win invoicing via Stripe Checkout |
| Buyer verification | Email + phone OTP before first bid |
| Shipping | Ship or collect — buyer chooses post-payment |
| Geography | Multi-currency, international |
| Realtime | SSE (Server-Sent Events) for bid/timer updates |
| Search | PostgreSQL tsvector behind `SearchRepository` interface (swappable to Meilisearch) |
| Images | Cloudflare R2 (free egress) |
| Auction Engine pattern | Event Sourcing + CQRS (all other services: standard CRUD) |
| API framework | Hono (all services) |
| No API Gateway | Nginx routes by path prefix directly to services |
| Deployment | Docker Compose on single Hetzner CX22 VM (~$4.50/mo) |
| Monorepo | Turborepo + pnpm workspaces |
| Admin access | IP allowlist via Nginx |

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Backend services | Node.js 20, TypeScript 5.4, Hono |
| Frontend | Next.js (App Router), Tailwind CSS, Shadcn/ui |
| Databases | PostgreSQL 16 (one instance, separate DB per service) |
| Cache / timers | Redis 7 + BullMQ |
| Message broker | RabbitMQ 3.13 (topic exchange: `carat.events`) |
| Auth | JWT RS256 (15min access token + 30-day refresh token in httpOnly cookie) |
| Images | Cloudflare R2 |
| Email | Resend + React Email |
| SMS | Twilio (OTP only) |
| Payments | Stripe Checkout (multi-currency) |
| Testing | Vitest |
| CI/CD | GitHub Actions → SSH to Hetzner VM |
| SSL | Let's Encrypt via Certbot |

---

## Shared Packages (plan 01 — complete)

| Package | Exports |
|---|---|
| `@carat-room/tsconfig` | `base`, `service`, `nextjs` tsconfig presets |
| `@carat-room/shared-types` | All domain types + event payload types + `ROUTING_KEYS` |
| `@carat-room/shared-events` | `EventPublisher`, `EventSubscriber`, `createAmqpConnection` |
| `@carat-room/shared-auth` | `authMiddleware`, `verifyJwt`, `JwtPayload` |

---

## RabbitMQ Routing Keys

```
user.registered
user.phone.verification.requested
auction.bid.placed
auction.closing.soon
auction.closed
payment.invoice.created
payment.received
payment.invoice.expired
shipping.item.dispatched
shipping.item.collected
```

---

## Implementation Status

All plans implemented:

| Plan | Status |
|---|---|
| 00-infrastructure | ✅ complete |
| 01-shared-packages | ✅ complete |
| 02-domain-user-auth | ✅ complete |
| 03-domain-catalogue | ✅ complete |
| 04-domain-auction-engine (A+B) | ✅ complete |
| 05-domain-payment | ✅ complete |
| 06-domain-shipping | ✅ complete |
| 07-domain-notification | ✅ complete |
| 08-domain-admin (A+B) | ✅ complete |
| 09-integration-testing | ✅ complete |

---

## API Contract Testing (2026-07-11)

Shared Zod schemas in `packages/shared-types/src/api/` are the single source of truth for cross-service JSON contracts. Producer router tests parse every asserted body through them; user-portal fetchers/proxies `safeParse` with graceful fallbacks.

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | catalogue schemas + user-portal catalogue seams | ✅ complete (earlier) |
| Phase 2 | user-auth, auction-engine, payment, shipping schemas + query/request builders; portal auth/bid/payment/shipping/calendar seams + lot detail | ✅ complete (branch `worktree-api-contracts-phase-2`) |
| Phase 3 | admin-portal consumer conversion | ⏳ pending — separate plan |
| Phase 4 | move user-auth repository tests onto `@carat-room/test-db` (PGlite); user-auth still hand-rolls its schema and its 2 repo integration tests need a live Postgres | ⏳ pending — separate plan |

**Phase 2 delivered:** 4 shared contract modules (`user-auth`, `auction-engine`, `payment`, `shipping`) with inferred types + typed query/request builders; producer-side schema enforcement across all four service router test suites; consumer-side parser libraries in the portal (`lib/auction.ts`, `lib/user-auth.ts`, `lib/payment.ts`, `lib/shipping.ts`, `lib/jwt.ts`, `lib/service-config.ts`) plus `parseLot`. Live bugs fixed (D1–D7): broken token refresh (wrong cookie + imagined shape), bid POST to a non-existent route, invoice-detail and checkout proxy paths, shipping choose-ship/choose-collect proxy paths, calendar's `{auctions}` vs `{data,meta}` mismatch, and the lot-detail runtime crash (`lot.currency.toUpperCase()` on an imagined type). Reality-wins correction: widened domain `UserStatus` to the 6 values the real user-auth service emits.

**Gaps flagged, NOT built (candidate future plans):**
- G1 — `/api/account/bids`, `/api/account/stats` proxy to auction-engine paths that don't exist.
- G2 — `/api/account/won` proxies to a non-existent payment path.
- G3 — watchlist routes: catalogue has no watchlist endpoints at all.
- G4 — `/api/auth/resend-verification`: user-auth has no resend endpoint.
- G5 — no service owns a lot's display currency; portal defaults to `'AUD'` via the shared `DISPLAY_CURRENCY` constant.

**Known pre-existing test failures (out of Phase 2 scope, confirmed present before this work):**
- user-portal: `src/app/page.test.tsx` (1) and `src/app/auctions/[auctionId]/catalogue-lots.test.tsx` (2) — Phase-1 catalogue consumers not enumerated in the Phase 2 plan.
- user-auth: 2 `PostgresUserRepository` integration tests need a live Postgres on :5432 (Phase 4 debt).

## Coverage-Gap E2E Testing (2026-07-12 → 2026-07-16)

Plan: `docs/superpowers/plans/2026-07-12-coverage-gap-e2e.md` — ✅ **complete**
(all 14 tasks). Spec: `docs/superpowers/specs/2026-07-12-coverage-gap-e2e-design.md`.
Branch `test/coverage-gap-e2e-v2` (worktree `.worktrees/coverage-gap-e2e`),
draft PR #17 → `main`.

**Goal:** turn the SonarCloud Quality Gate green by raising new-code
coverage from 44.4% via `sonar-project.properties` measurement corrections,
a new Playwright E2E package (`@carat-room/e2e`) driving both real
production-built portals against the real `docker-compose.test.yml` backend
stack with merged server + client V8 coverage, and unit-test stragglers.

**Delivered:**
- `sonar-project.properties` corrections (test-file reclassification,
  composition-root coverage exclusions).
- `tests/e2e` package: 7 Playwright specs (spike smoke, auth, register-to-bid,
  browse-and-bid, invoice-checkout, fulfilment ×2) covering all 5 required
  flows, with a from-scratch coverage pipeline (`NODE_V8_COVERAGE` +
  `page.coverage` → `monocart-coverage-reports` → per-portal lcov) and a
  Windows-safe IPC-based graceful portal shutdown.
- 6 unit-test straggler files added/extended for coverage E2E cannot reach.
- CI wiring in `.github/workflows/ci.yml`: full E2E suite with coverage runs
  between `pnpm turbo test` and the SonarCloud scan.
- `tests/e2e/README.md` and `CLAUDE.md`'s Key Commands document the
  two-command local run.

**Real bugs found and fixed along the way** (10 total, each on its own PR,
merged to `main` independently of this plan's branch — see
`.superpowers/sdd/progress.md` for full detail): a BullMQ colon-jobId bug
(PR #11), a proxy refresh-cookie bug (PR #12), a phone-OTP request-body key
mismatch that blocked all bidding (PR #13), a Sonar test-file
misclassification (PR #14), a payment-profile `res.ok` robustness gap (PR
#15), a missing `/api/account/bids`/`/api/account/stats` feature in
auction-engine (PR #16), plus 4 more Stripe/R2 test-infra bugs surfaced once
real credentials were added as repo secrets (identity+card steps never
driven, R2 env-var-naming mismatch, a Playwright-process env-var removal
that masked a real bug, and a missing postal-code field for Stripe's
CardElement).

**Quality Gate result:** this branch/PR's own SonarCloud analysis
(`ci` run `29496584658`, commit `c1cb608`) is **PASSED** —
confirmed both from the CI log (`QUALITY GATE STATUS: PASSED`,
`-Dsonar.qualitygate.wait=true` exited 0) and directly from the SonarCloud
API. `main`'s own rolling quality gate is still `ERROR` at `new_coverage =
62.7%` as of this writing — expected, because `main`'s 30-day new-code
window already includes 6 of this plan's fix PRs but not yet this branch's
own E2E-lcov coverage contribution, which only lands when PR #17 merges.
Merging PR #17 (with the whole-branch review that follows) is the next step,
outside this plan's scope. Full detail: `tests/e2e/README.md`'s "Quality
Gate verification (Task 14)" section and `.superpowers/sdd/task-14-report.md`.
