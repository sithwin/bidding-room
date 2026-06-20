# Backend Design — User Portal Services

**Date:** 2026-06-20
**Status:** Approved

---

## Overview

Five backend services power the user-facing portal. Each owns its own PostgreSQL database and communicates via RabbitMQ domain events. All services are written in TypeScript with Hono framework and follow Clean Architecture — domain logic is isolated from infrastructure adapters.

---

## Clean Architecture Layers (per service)

```
src/
  domain/           — Entities, value objects, repository interfaces, domain events
  application/      — Use cases (commands + queries), service interfaces
  infrastructure/   — Repository implementations, DB, external APIs, RabbitMQ adapters
  presentation/     — Hono route handlers, request/response DTOs
```

Dependencies point inward only. Infrastructure implements interfaces defined in the domain layer.

---

## 1. User Service

**Responsibility:** Registration, authentication, JWT issuance, phone verification.

### User Lifecycle

```
REGISTERED → EMAIL_VERIFIED → PHONE_VERIFIED (= APPROVED_BIDDER)
```

### Database Schema

```sql
users
  id              UUID PRIMARY KEY
  email           TEXT UNIQUE NOT NULL
  password_hash   TEXT NOT NULL
  phone           TEXT
  status          TEXT NOT NULL  -- REGISTERED | EMAIL_VERIFIED | APPROVED_BIDDER | SUSPENDED
  role            TEXT NOT NULL DEFAULT 'BUYER'  -- BUYER | ADMIN
  country         TEXT
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

verification_tokens
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  type            TEXT NOT NULL  -- EMAIL | PHONE
  code            TEXT NOT NULL
  expires_at      TIMESTAMPTZ NOT NULL
  used_at         TIMESTAMPTZ

refresh_tokens
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  token_hash      TEXT NOT NULL
  expires_at      TIMESTAMPTZ NOT NULL
  revoked_at      TIMESTAMPTZ
```

### API Endpoints

```
POST /api/users/register          — create account, send email verification
POST /api/users/verify-email      — verify email token
POST /api/users/login             — issue JWT + refresh token
POST /api/users/refresh           — exchange refresh token for new access token
POST /api/users/logout            — revoke refresh token
POST /api/users/phone/request     — send SMS OTP via Twilio
POST /api/users/phone/verify      — verify OTP, set status APPROVED_BIDDER
GET  /api/users/me                — get current user profile (auth required)
PATCH /api/users/me               — update profile (auth required)
```

### Auth Flow

- Access token: JWT, 15-minute expiry, signed with RS256
- Refresh token: opaque token, stored as hash in DB, 30-day expiry, httpOnly cookie
- Phone OTP: 6-digit code, 10-minute expiry, max 3 attempts then 15-minute lockout

### Domain Events Published

- `UserRegistered` → Notification Service (send email verification link)
- `PhoneVerificationRequested` → Notification Service (send SMS OTP)

---

## 2. Catalogue Service

**Responsibility:** Lot content, images, categories. Owns presentation data only — no auction state.

### Database Schema

```sql
categories
  id              UUID PRIMARY KEY
  name            TEXT NOT NULL
  slug            TEXT UNIQUE NOT NULL
  parent_id       UUID REFERENCES categories(id)
  display_order   INT NOT NULL DEFAULT 0

lots
  id              UUID PRIMARY KEY
  title           TEXT NOT NULL
  description     TEXT
  category_id     UUID REFERENCES categories(id)
  condition       TEXT  -- NEW | EXCELLENT | VERY_GOOD | GOOD
  estimated_value NUMERIC(12,2)
  search_vector   TSVECTOR  -- maintained via Postgres trigger
  created_by      UUID
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

lot_images
  id              UUID PRIMARY KEY
  lot_id          UUID REFERENCES lots(id)
  url             TEXT NOT NULL
  thumbnail_url   TEXT NOT NULL
  display_order   INT NOT NULL DEFAULT 0
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE
```

### Search

`search_vector` updated via Postgres trigger on `title` + `description`. Queries use `search_vector @@ plainto_tsquery(...)`.

Search sits behind a `SearchRepository` interface — swapping to Meilisearch means a new adapter only, zero changes to use cases:

```typescript
interface SearchRepository {
  search(query: string, filters: LotFilters): Promise<LotSearchResult[]>
}
```

### Image Upload Flow

1. Admin requests pre-signed upload URL from Catalogue Service
2. Service generates pre-signed PUT URL for Cloudflare R2
3. Admin uploads image directly to R2 — no binary data passes through the service
4. Admin confirms upload — service stores the R2 URL
5. Thumbnail + medium variants generated via Sharp on upload

### API Endpoints

```
GET  /api/lots                    — paginated list (filters: category, status, price range)
GET  /api/lots/:id                — full lot detail
GET  /api/lots/search?q=          — full-text search
GET  /api/categories              — category tree
```

---

## 3. Auction Engine

**Responsibility:** Lot lifecycle, bidding, timer management, reserve enforcement.

### Pattern: Event Sourcing + CQRS

- **Write model:** Append-only event store. State never updated in place.
- **Read model:** Projected Postgres tables rebuilt from events.
- **Commands:** `PlaceBid`, `ScheduleAuction`, `CancelAuction`
- **Queries:** `GetLotStatus`, `GetBidHistory`, `GetActiveLots`

### Lot Lifecycle

```
DRAFT → SCHEDULED → LIVE → CLOSING → CLOSED → SOLD | UNSOLD
```

- `CLOSING` — entered when a bid lands within the auto-extend window (configurable, e.g. 3 minutes)
- Timer extended by configurable duration per late bid
- On `CLOSED`: highest bid checked against reserve
  - Bid ≥ reserve → `SOLD`, emit `AuctionClosed` with winner
  - Bid < reserve → `UNSOLD`, emit `AuctionClosed` without winner

### Event Store Schema

```sql
auction_events
  id              UUID PRIMARY KEY
  lot_id          UUID NOT NULL
  sequence        BIGINT NOT NULL
  event_type      TEXT NOT NULL
  payload         JSONB NOT NULL
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  UNIQUE(lot_id, sequence)
```

### Event Types

- `AuctionScheduled` — start_at, end_at, reserve_price, min_bid_increment, auto_extend_window_minutes, auto_extend_duration_minutes
- `AuctionStarted`
- `BidPlaced` — bid_id, user_id, amount, placed_at
- `TimerExtended` — new_end_at, extended_by_minutes
- `AuctionClosed` — highest_bid_id, highest_amount, reserve_met, winner_user_id (nullable)
- `AuctionCancelled` — reason

### Read Projection Schema

```sql
lot_status
  lot_id              UUID PRIMARY KEY
  status              TEXT NOT NULL
  current_highest_bid NUMERIC(12,2)
  bid_count           INT NOT NULL DEFAULT 0
  end_at              TIMESTAMPTZ NOT NULL
  winner_user_id      UUID
  updated_at          TIMESTAMPTZ NOT NULL

bids
  id                  UUID PRIMARY KEY
  lot_id              UUID NOT NULL
  user_id             UUID NOT NULL
  amount              NUMERIC(12,2) NOT NULL
  placed_at           TIMESTAMPTZ NOT NULL
```

Reserve price stored in `auction_events` only — never projected or exposed via API.

### Bidding Rules

- Bid must exceed current highest bid by at least `min_bid_increment`
- User cannot outbid themselves
- Redis lock per `lot_id` prevents concurrent bid race conditions (TTL: 5 seconds)
- Late bid triggers timer extension

### Timer Management

- BullMQ job per lot scheduled at `end_at`
- On extension: existing job cancelled, new job scheduled at new `end_at`
- Job fires → close logic runs → `AuctionClosed` event emitted to RabbitMQ

### SSE (Server-Sent Events)

- `GET /api/auctions/:lotId/stream` — client subscribes
- Pushed events: `bid_placed`, `timer_extended`, `auction_closed`
- Payload per event: `{ highestBid, bidCount, endAt, status }`
- Browser auto-reconnects on disconnect

### API Endpoints

```
GET  /api/auctions                     — active/upcoming auctions
GET  /api/auctions/:lotId              — current auction state
GET  /api/auctions/:lotId/bids         — bid history (paginated, amounts only)
GET  /api/auctions/:lotId/stream       — SSE realtime stream
POST /api/auctions/:lotId/bids         — place a bid (APPROVED_BIDDER required)
```

### Domain Events Published

- `BidPlaced` → Notification Service
- `AuctionClosingSoon` → Notification Service
- `AuctionClosed` → Payment Service + Notification Service

---

## 4. Payment Service

**Responsibility:** Invoice generation, Stripe Checkout, payment status, expiry enforcement.

### Payment Lifecycle

```
INVOICE_CREATED → AWAITING_PAYMENT → PAID → FULFILLED
                                   ↓
                              EXPIRED
```

### Database Schema

```sql
invoices
  id                    UUID PRIMARY KEY
  lot_id                UUID NOT NULL
  winner_user_id        UUID NOT NULL
  amount                NUMERIC(12,2) NOT NULL
  currency              TEXT NOT NULL
  status                TEXT NOT NULL  -- AWAITING_PAYMENT | PAID | EXPIRED | CANCELLED
  stripe_checkout_id    TEXT
  stripe_payment_intent TEXT
  due_at                TIMESTAMPTZ NOT NULL
  paid_at               TIMESTAMPTZ
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()

payment_events
  id                    UUID PRIMARY KEY
  invoice_id            UUID REFERENCES invoices(id)
  stripe_event_id       TEXT UNIQUE
  event_type            TEXT NOT NULL
  payload               JSONB NOT NULL
  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### Stripe Integration

- Stripe Checkout hosted page — no card data touches the service
- Webhook signatures verified before processing
- `payment_events` idempotent via `stripe_event_id` unique constraint

### Payment Window

- 3-day window (configurable)
- BullMQ job fires at `due_at` → invoice marked `EXPIRED`, event emitted

### API Endpoints

```
GET  /api/payments/invoices/:id           — get invoice (own only)
POST /api/payments/invoices/:id/checkout  — create Stripe Checkout session
POST /api/payments/webhooks/stripe        — Stripe webhook (signature verified)
```

### Domain Events Consumed / Published

- Consumes: `AuctionClosed` (with winner) → create invoice
- Publishes: `InvoiceCreated`, `PaymentReceived`, `InvoiceExpired`

---

## 5. Notification Service

**Responsibility:** Event-driven email and SMS delivery. No business logic, no HTTP endpoints.

### Database Schema

```sql
notification_log
  id            UUID PRIMARY KEY
  user_id       UUID NOT NULL
  type          TEXT NOT NULL
  channel       TEXT NOT NULL  -- EMAIL | SMS
  status        TEXT NOT NULL  -- SENT | FAILED
  error         TEXT
  sent_at       TIMESTAMPTZ
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### Event → Action Map

| Event | Action |
|---|---|
| `UserRegistered` | Email: verify your email |
| `PhoneVerificationRequested` | SMS: OTP code via Twilio |
| `BidPlaced` | Email: you've been outbid (to previous highest bidder) |
| `AuctionClosingSoon` | Email: closing in 15 minutes (to active bidders) |
| `AuctionClosed` (won) | Email: you won — invoice link |
| `AuctionClosed` (unsold) | Email: lot did not sell |
| `InvoiceCreated` | Email: invoice with Stripe Checkout link |
| `PaymentReceived` | Email: payment confirmed |
| `InvoiceExpired` | Email: payment window closed |
| `ItemDispatched` | Email: dispatched + tracking number |
| `ItemCollected` | Email: collection confirmed |

Email templates built with React Email, delivered via Resend.

---

## 6. Shipping Service

**Responsibility:** Delivery preference capture and fulfilment tracking post-payment.

### Database Schema

```sql
fulfilments
  id              UUID PRIMARY KEY
  lot_id          UUID NOT NULL
  user_id         UUID NOT NULL
  method          TEXT  -- SHIP | COLLECT (null until chosen)
  status          TEXT NOT NULL  -- PENDING_CHOICE | PENDING_DISPATCH | DISPATCHED | COLLECTED
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

shipping_addresses
  id              UUID PRIMARY KEY
  fulfilment_id   UUID REFERENCES fulfilments(id)
  full_name       TEXT NOT NULL
  line1           TEXT NOT NULL
  line2           TEXT
  city            TEXT NOT NULL
  state           TEXT
  postcode        TEXT NOT NULL
  country         TEXT NOT NULL  -- ISO 3166-1 alpha-2

collection_slots
  id              UUID PRIMARY KEY
  fulfilment_id   UUID REFERENCES fulfilments(id)
  location        TEXT NOT NULL
  date            DATE NOT NULL
  time_slot       TEXT NOT NULL
```

### API Endpoints

```
GET  /api/shipping/fulfilments/:id                — get fulfilment status (own only)
POST /api/shipping/fulfilments/:id/choose-ship    — submit shipping address
POST /api/shipping/fulfilments/:id/choose-collect — book collection slot
```

### Domain Events Consumed / Published

- Consumes: `PaymentReceived` → create fulfilment record
- Publishes: `ItemDispatched`, `ItemCollected`
