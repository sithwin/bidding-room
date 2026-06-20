# Architecture Design — The Carat Room Auction Platform

**Date:** 2026-06-20
**Status:** Approved — Updated 2026-06-20 (service consolidation)

---

## Overview

The Carat Room is a timed online auction platform for premium goods (jewellery, designer bags, etc.). The business lists all lots — no third-party sellers. Buyers register, verify via phone, and bid on timed auctions. Winners pay via Stripe and choose shipping or collection.

---

## Core Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Auction format | Timed auction only | Focused scope for v1 |
| Anti-sniping | Auto-extend timer on late bids | Prevent last-second sniping |
| Reserve price | Hidden — lot unsold if not met | Standard auction house practice |
| Payment model | Pay-on-win invoicing | Simpler than pre-auth at this scale |
| Buyer verification | Phone OTP before first bid | Trust layer without heavy KYC |
| Shipping | Ship or collect — buyer chooses post-payment | Flexibility for international buyers |
| Geography | Multi-currency, international | Stripe handles currency |
| Realtime | SSE (Server-Sent Events) | Server pushes bid/timer updates; bids submitted via HTTP POST |
| Search | PostgreSQL tsvector behind repository interface | Swappable to Meilisearch without business logic changes |
| Image storage | Cloudflare R2 | Free egress, global CDN |
| Auction Engine pattern | Event Sourcing + CQRS | Full audit trail for bids; all other services use standard CRUD |

---

## Services Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        VM (Hetzner CX22)                        │
│                                                                 │
│  Nginx (reverse proxy + SSL via Let's Encrypt)                  │
│    ├── /* ──────────────────→ Frontend (Next.js - User Portal)  │
│    ├── /admin/* ────────────→ Frontend (Next.js - Admin Portal) │
│    ├── /api/users/* ─────┐                                      │
│    ├── /api/lots/* ──────┴──→ Core Service (Hono)               │
│    ├── /api/auctions/* ─────→ Auction Engine (Hono)             │
│    ├── /api/payments/* ─────→ Payment Service (Hono)            │
│    ├── /api/shipping/* ──┐                                      │
│    ├── /api/notifications/*┴→ Fulfilment Service (Hono)         │
│    └── /api/admin/* ────────→ Admin Service (Hono)              │
│                                                                 │
│  Infrastructure                                                 │
│    ├── PostgreSQL (one instance, separate DB per service group) │
│    ├── Redis (Auction Engine timer state + BullMQ)              │
│    └── RabbitMQ (async domain events between services)          │
└─────────────────────────────────────────────────────────────────┘
```

**Admin portal** is served from the same VM but restricted at Nginx level — accessible via VPN or IP whitelist only.

### Service Consolidation Rationale

| Consolidated Service | Originally | Reason |
|---|---|---|
| `core-service` | user-service + catalogue-service | Both pure CRUD, no events between them, share same deployment lifecycle |
| `fulfilment-service` | notification-service + shipping-service | Both fire-and-forget side effects triggered by RabbitMQ events, no public HTTP surface |
| `auction-engine` | auction-engine | Kept separate — Event Sourcing + CQRS + Redis timers + SSE is architecturally distinct |
| `payment-service` | payment-service | Kept separate — Stripe webhooks and invoice logic deserve isolation |
| `admin-service` | admin-service | Kept separate — thin proxy, no DB, different access control (IP allowlist) |

---

## Service Inventory

| Service | Port | Language | Framework | Database | Contains |
|---|---|---|---|---|---|
| Core Service | 3001 | TypeScript | Hono | Postgres (`core_db`) + R2 | User auth, JWT, phone OTP, lots, categories, images |
| Auction Engine | 3002 | TypeScript | Hono | Postgres (`auction_db`) + Redis | Event Sourcing + CQRS, bidding, timers, SSE |
| Payment Service | 3003 | TypeScript | Hono | Postgres (`payment_db`) | Stripe Checkout, invoices, webhooks |
| Fulfilment Service | 3004 | TypeScript | Hono | Postgres (`fulfilment_db`) | Shipping, address, collection slots, email, SMS |
| Admin Service | 3005 | TypeScript | Hono | — (no DB) | Thin proxy to all services, IP-restricted |
| Frontend (User) | — | TypeScript | Next.js | — | App Router, Tailwind CSS |
| Frontend (Admin) | — | TypeScript | Next.js | — | Shadcn/ui, SWR polling |

---

## Domain Events (RabbitMQ)

All services communicate state changes via domain events published to RabbitMQ. No direct service-to-service calls for state mutations.

| Event | Publisher | Subscribers |
|---|---|---|
| `UserRegistered` | Core Service | Fulfilment Service (welcome email) |
| `PhoneVerificationRequested` | Core Service | Fulfilment Service (SMS OTP) |
| `PhoneVerified` | Core Service | — |
| `BidPlaced` | Auction Engine | Fulfilment Service (outbid alert) |
| `TimerExtended` | Auction Engine | — (SSE pushes to frontend directly) |
| `AuctionClosingSoon` | Auction Engine | Fulfilment Service |
| `AuctionClosed` | Auction Engine | Payment Service, Fulfilment Service |
| `InvoiceCreated` | Payment Service | Fulfilment Service (invoice email) |
| `PaymentReceived` | Payment Service | Fulfilment Service (payment confirmed + create fulfilment record) |
| `InvoiceExpired` | Payment Service | Fulfilment Service (expiry email) |
| `ItemDispatched` | Fulfilment Service | — (internal state change) |
| `ItemCollected` | Fulfilment Service | — (internal state change) |

---

## Authentication & Authorisation

- **JWT** issued by User Service on login
- Short-lived access token (15 min) + refresh token (30 days, httpOnly cookie)
- JWT payload: `{ userId, email, verificationStatus, role }`
- Each service validates JWT signature independently — no gateway service
- Nginx routes requests; services enforce auth
- Admin routes require `role: ADMIN` claim
- Admin portal additionally restricted by Nginx IP allowlist

---

## Deployment

**Local development:** Docker Compose — single `docker-compose.yml` runs all services.

**Production:** Docker Compose on a single Hetzner CX22 (~$4.50/mo).

```
hetzner-vm/
├── docker-compose.yml
├── nginx/
│   └── nginx.conf
├── services/
│   ├── core-service/
│   ├── auction-engine/
│   ├── payment-service/
│   ├── fulfilment-service/
│   └── admin-service/
└── frontends/
    ├── user-portal/
    └── admin-portal/
```

**CI/CD:** GitHub Actions → SSH into VM → `docker compose pull && docker compose up -d`

**SSL:** Let's Encrypt via Certbot (auto-renew).

**Backups:** Postgres daily dump to Cloudflare R2.

---

## Scalability Path

When traffic grows:

1. Move Postgres to Hetzner Managed Database ($15/mo) — zero code changes
2. Extract Auction Engine to its own VM — highest traffic service
3. Add a second VM + Nginx load balancer for remaining services
4. Migrate to Railway/Render per-service if team grows

---

## Repository Structure

Monorepo (Turborepo):

```
apps/
  user-portal/          — Next.js user-facing frontend
  admin-portal/         — Next.js admin frontend
  core-service/         — Hono (user auth + catalogue)
  auction-engine/       — Hono (Event Sourcing + CQRS + SSE)
  payment-service/      — Hono (Stripe + invoices)
  fulfilment-service/   — Hono (shipping + notifications)
  admin-service/        — Hono (thin proxy, no DB)
packages/
  shared-types/         — Shared TypeScript types and interfaces
  shared-events/        — RabbitMQ event schemas
  shared-auth/          — JWT validation middleware (shared across services)
  ui/                   — Shared UI components (if any overlap between portals)
```
