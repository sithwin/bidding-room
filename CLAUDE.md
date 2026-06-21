# CLAUDE.md — The Carat Room Auction Platform

## Project Overview

The Carat Room is a timed online auction platform for premium goods (jewellery, designer bags, etc.). The business lists all lots — no third-party sellers. Buyers register, verify via phone OTP, and bid on timed auctions. Winners pay via Stripe Checkout and choose shipping or collection.

Read `docs/superpowers/SESSION-SUMMARY.md` for the full decision log and plan status.
Read `docs/superpowers/specs/2026-06-20-architecture-design.md` for the full architecture.

---

## Monorepo Structure

Turborepo + pnpm workspaces:

```
apps/
  user-portal/          — Next.js (App Router) — user-facing frontend
  admin-portal/         — Next.js (App Router) + Shadcn/ui — admin frontend
  user-service/         — Hono — auth, JWT, phone verification
  catalogue-service/    — Hono — lots, categories, images (Cloudflare R2)
  auction-engine/       — Hono — Event Sourcing + CQRS, bidding, SSE, timers
  payment-service/      — Hono — Stripe Checkout, invoices, webhooks
  notification-service/ — Hono — Resend (email) + Twilio (SMS OTP)
  shipping-service/     — Hono — fulfilment, address, collection slots

packages/
  shared-types/         — All domain TypeScript types + RabbitMQ event payloads
  shared-events/        — EventPublisher, EventSubscriber, createAmqpConnection
  shared-auth/          — authMiddleware, verifyJwt, JwtPayload
  tsconfig/             — base, service, nextjs tsconfig presets
```

---

## Key Commands

```bash
# Install all dependencies
pnpm install

# Build all packages and apps
pnpm turbo build

# Build a single app
pnpm turbo build --filter=user-service

# Run all tests
pnpm turbo test

# Run tests for a single app
pnpm turbo test --filter=auction-engine

# Start all services in development mode (requires Docker Compose running)
pnpm turbo dev

# Lint all
pnpm turbo lint

# Start local infrastructure (PostgreSQL, Redis, RabbitMQ)
docker compose up -d

# Run integration tests (all services must be built first)
docker compose -f docker-compose.test.yml up -d --build
pnpm run test:integration

# Tear down test environment
docker compose -f docker-compose.test.yml down -v
```

---

## Service Ports

| Service              | Port |
|----------------------|------|
| User Service         | 3001 |
| Catalogue Service    | 3002 |
| Auction Engine       | 3003 |
| Payment Service      | 3004 |
| Notification Service | 3005 |
| Shipping Service     | 3006 |
| Admin Service        | 3007 |
| PostgreSQL (dev)     | 5432 |
| PostgreSQL (test)    | 5433 |
| Redis                | 6379 |
| RabbitMQ AMQP        | 5672 |
| RabbitMQ Management  | 15672 |

Nginx routes by path prefix in production — no API gateway service.

---

## Architecture Patterns

### Event Sourcing (Auction Engine only)
Only the Auction Engine uses Event Sourcing + CQRS. All other services use standard CRUD with PostgreSQL. Never write directly to auction aggregate state — always replay events via the event store.

### RabbitMQ Domain Events
Services communicate state changes via RabbitMQ topic exchange `carat.events`. No direct database access across service boundaries. No direct service-to-service HTTP calls for state mutations.

Key routing keys:
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

### Authentication
- JWT RS256 — issued by User Service on login
- Access token: 15 min | Refresh token: 30 days (httpOnly cookie)
- JWT payload: `{ userId, email, verificationStatus, role }`
- Each service validates JWT independently — no gateway
- Admin routes require `role: ADMIN`

### Realtime (User Portal)
SSE (Server-Sent Events) for bid and timer updates on the lot detail page. Bids submitted via HTTP POST. Admin portal uses SWR polling every 5 seconds — no SSE.

---

## Tech Stack

| Layer            | Technology                                        |
|------------------|---------------------------------------------------|
| Runtime          | Node.js 20                                        |
| Language         | TypeScript 5.4                                    |
| Package manager  | pnpm 9                                            |
| Monorepo         | Turborepo                                         |
| Backend services | Hono                                              |
| Frontend         | Next.js (App Router), Tailwind CSS, Shadcn/ui     |
| Databases        | PostgreSQL 16 (one instance, one DB per service)  |
| Cache / queues   | Redis 7 + BullMQ                                  |
| Message broker   | RabbitMQ 3.13                                     |
| Images           | Cloudflare R2                                     |
| Email            | Resend + React Email                              |
| SMS              | Twilio (OTP only)                                 |
| Payments         | Stripe Checkout (multi-currency)                  |
| Testing          | Vitest                                            |
| CI/CD            | GitHub Actions → SSH to Hetzner VM                |

---

## Code Standards

- **British English** in all comments and copy: "authorise" not "authorize", "cancelled" not "canceled", "fulfilment" not "fulfillment"
- **Named exports only** — never `export default`
- **No `var`** — always `const` or `let`
- **TypeScript strict mode** — no implicit `any`, no `@ts-ignore` in production code
- **Single quotes** for string literals
- **No `_` prefix** on private fields — use TypeScript `private` keyword
- **No `Manager`, `Helper`, `Utils`** class names
- Boolean variables must use `is`, `has`, `can`, `should`, `was`, or `will` prefix
- **Test file co-location** — test files live in the same folder as the source file they test, named `<filename>.test.ts` (e.g. `user.service.ts` → `user.service.test.ts`). No separate `__tests__` directories.

---

## Task Completion

When a task or plan step is completed, mark its checkbox in the relevant `plan.md` immediately:
- Change `- [ ]` to `- [x]` for each completed step
- When all steps in a plan are done, commit the updated `plan.md` with `chore: mark all plan NN tasks complete`

---

## Plans & Specs

All implementation plans and design specs live in `docs/superpowers/`:

```
docs/superpowers/
  SESSION-SUMMARY.md               — master status tracker
  specs/                           — approved design documents
  plans/
    00-infrastructure/plan.md      ✅ complete
    01-shared-packages/plan.md     ✅ complete
    02-domain-user-auth/plan.md    ✅ complete
    03-domain-catalogue/plan.md    ✅ complete
    04-domain-auction-engine/
      plan-part-a-core.md          ✅ complete
      plan-part-b-presentation.md  ✅ complete
    05-domain-payment/plan.md      ✅ complete
    06-domain-shipping/plan.md     ✅ complete
    07-domain-notification/plan.md ✅ complete
    08-domain-admin/
      plan-part-a-backend.md       ✅ complete
      plan-part-b-frontend.md      ✅ complete
    09-integration-testing/plan.md ✅ complete
```

Before implementing any domain, read its plan file in full.
