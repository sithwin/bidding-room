# CLAUDE.md — The Carat Room Auction Platform

## Output Token Limit — CRITICAL

**Never generate large file content in a single response.** Claude has a 32,000 output token limit. Writing a large plan or file in one `Write` call will exceed it and waste the entire response.

**Rule: Write large files in chunks using multiple sequential `Edit` calls.** Write the first section, then append the next section with another `Edit`, and so on. Each `Edit` call should stay well under 500 lines of output.

---

## Plan Writing — CRITICAL: Spec Coverage

**Never write a plan from memory.** After reading a spec once, important details are forgotten or skimmed. Always follow this process:

### Step 1 — Build a coverage checklist FIRST
Before writing any task, re-read the spec line by line. For every sentence that describes a feature, behaviour, component detail, or error state — extract it as a checklist item. Do not write a single plan task until the full checklist exists.

### Step 2 — Write tasks that tick off checklist items
Each task must reference which checklist items it satisfies. No checklist item may be left uncovered.

### Step 3 — Self-review from the spec, not the plan
The final self-review must open the spec file and go paragraph by paragraph asking "which task number covers this line?" Do NOT read the plan backwards and assume it is correct. Re-read the spec forward.

## Project Overview

The Carat Room is a timed online auction platform for premium goods (jewellery, designer bags, etc.). The business lists all lots — no third-party sellers. Buyers register, verify via phone OTP, and bid on timed auctions. Winners pay via Stripe Checkout and choose shipping or collection.

Read `docs/superpowers/SESSION-SUMMARY.md` for the full decision log and plan status.
Read `docs/superpowers/specs/2026-06-20-architecture-design.md` for the full architecture.
See `docs/architecture.md` for the architecture diagram as built (the spec's service consolidation was not implemented — the diagram reflects the actual services).

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

# Lint all (includes Clean Architecture layer-boundary checks — see eslint.config.mjs)
pnpm lint

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

## Engineering Principles — apply on EVERY change

### Boy Scout Rule
Always leave the code you touch cleaner than you found it. When editing any file:
- Fix nearby code smells you touch: dead code, misleading names, duplicated literals, missing types, violations of the Code Standards above.
- Keep the cleanup **small and in the same commit only if it is in the file(s) you are already changing**. Larger refactors get their own commit (prefix `refactor:`), never mixed into a feature/fix commit.
- Never let a cleanup change behaviour without a test proving the behaviour is preserved.
- If you spot a problem too big to fix now, record it as a one-line note in the relevant `plan.md` or raise it to the user — do not silently ignore it.

### Clean Architecture
Services follow the `domain / application / infrastructure / presentation` layering (see `apps/catalogue`). Dependencies point **inwards only**:
- `domain/` — entities and repository **interfaces**. No imports from any other layer or any framework (Hono, pg, amqplib).
- `application/` — use cases. May import `domain/` only; defines ports (e.g. `image-storage.ts`) that infrastructure implements.
- `infrastructure/` — repository implementations (e.g. `postgres-*-repository.ts`), external clients. Implements domain/application interfaces; never imports presentation.
- `presentation/` — Hono routers, request/response mapping, validation. Depends on application/domain interfaces; receives implementations by injection from `src/main.ts` (the composition root), never imports `infrastructure/` directly.
- Business rules live in `domain/`, never in routers or repositories. SQL never appears outside `infrastructure/`.
- New code in a service must fit this layering; when touching a file that violates it, move the logic to the correct layer (Boy Scout Rule).

**Enforced by ESLint** — `pnpm lint` (root `eslint.config.mjs`) fails on any cross-layer import. Pre-existing violations are grandfathered in a "legacy debt" block in that config; the list may only shrink — never add a file to it, fix the layering instead.

### SOLID
- **S — Single responsibility**: one reason to change per module. A router routes; a repository persists; a domain service decides. If a file needs "and" to describe it, split it.
- **O — Open/closed**: extend behaviour by adding implementations of existing interfaces, not by adding flags/branches to existing classes.
- **L — Liskov substitution**: any implementation of a repository interface must honour its full contract (including error behaviour) — test doubles too.
- **I — Interface segregation**: keep repository/domain interfaces narrow and per-consumer; don't force a reader to depend on write methods it never uses.
- **D — Dependency inversion**: high-level code depends on interfaces defined in `domain/`; concrete implementations are wired at the composition root (app entry point). Never `new` an infrastructure class inside domain or presentation logic.

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


## Self-learning
When I correct you, or you catch yourself making a mistake before continuing, add the lesson as a one-line rule

## Lessons
- Never hard-code values that another service owns (e.g. token TTLs) — derive them from the source of truth (the JWT `exp` claim) and extract repeated literals (cookie names) into a shared constant.
- Never write a frontend consumer from an assumed API shape — open the backend router first and match its actual envelope (`{ data, meta }` in this repo); an `as` cast on `res.json()` validates nothing.
- Guard cross-service responses at runtime (`Array.isArray`) — `data?.lots.map` still crashes when `data` exists but `lots` doesn't.
- A `catch` that returns a fallback can mask contract bugs: a 200 with the wrong shape is not an error, so validate the success path too.
- Declare a service's response types and mappers once in a shared module (e.g. `apps/user-portal/src/lib/catalogue.ts`) — per-file inline types drift independently.
- Query param names must match the backend exactly (`offset` not `page`, `minValue` not `minPrice`) — unrecognised params are silently ignored, never rejected.
- Verify SQL column names against the migrations; a unit test asserting the query string contains the code's own column name proves nothing when both share the wrong assumption.
- Never put SQL in a presentation-layer router — define a domain repository interface and an infrastructure implementation, even for small endpoints; the service already has that layering, so follow it.
- When adding a migration, mirror its schema changes into `tests/db-init/init.sql` — the test DB bootstrap does not run service migrations, so it silently drifts.
- A form must render an error slot for every field its schema validates, plus a general server-error message — an error that is returned but never displayed looks like a dead submit button.
- Never ask users to type an entity ID — fetch the owning service's list and render a select; a free-text "UUID" input guarantees validation failures.
- Every mutation action needs a reachable UI entry point, including from an empty state — a per-row "add child" button is useless when the list is empty; always provide a root-level "New" button.
- `z.string().datetime()` rejects what `<input type='datetime-local'>` emits (`2026-07-09T14:30` — no seconds, no timezone); validate with the format the HTML control actually produces (`{ local: true }` or a transform) and unit-test the schema with a real sample value from the control.
- Before writing a proxy route, grep the downstream service for the exact target path and pass the client of the service that owns it — a proxy to a non-existent endpoint compiles fine and fails only at runtime.
- A fetch wrapper must check `res.ok` before trusting the body shape — parsing an error envelope as the success type moves the crash into rendering code.
- Schema unit tests are not verification for a UI flow — before marking a frontend plan step complete, drive the actual flow in the browser (submit the form, click the menu) at least once.
- A bug report names symptoms, not scope — after root-causing the reported items, audit the entire functional chain they live in (create → schedule → bid → close → invoice → fulfil); the worst breaks were adjacent to, not inside, the reported pages.
- An asserted RabbitMQ queue with no binding consumes nothing and raises no error — queue bindings must be explicit and required (never optional parameters), and queue/exchange names must be diffed against `infra/rabbitmq/definitions.json`.
- Event producers and consumers must both type their payloads against `@carat-room/shared-types` — an inline payload object on either side drifts silently (`finalAmount` vs `highestAmount` broke invoicing with zero errors logged).
- Infra declarations are part of the contract: an exchange name in `definitions.json` that differs from the code constant (`platform.events` vs `carat.events`) means every pre-provisioned binding is dead.
- Diff every service's `process.env` reads against its `docker-compose.yml` block — env-name drift (`AMQP_URL` vs `RABBITMQ_URL`) and wrong fallback hostnames (`auction-service` vs `auction-engine`) crash or isolate services only at deploy time.
- SQL referencing a table proves nothing about the table existing — every table named in an INSERT/SELECT needs DDL in a migration and in `tests/db-init/init.sql`; `valuation_enquiries` had neither.
- A service must not fabricate another service's numbers — never hard-code placeholder values (`pendingInvoices: 0`) in a cross-service response; report only what you own, aggregate at the composition point, and fail soft to `null` (rendered '—'), not to a fake zero.
- A backend feature without a reachable UI entry point is not shipped — when adding a router, add the page and navigation link in the same plan, or the feature silently doesn't exist.


