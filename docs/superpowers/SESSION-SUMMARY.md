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

## Remaining Plans to Write

1. `09-integration-testing/plan.md` — requires all domains complete, prefer fresh session
