# Frontend Design — User Portal

**Date:** 2026-06-20
**Status:** Approved

---

## Overview

The user-facing Next.js application. Buyers browse lots, register, verify their phone, place bids, track auctions in real time, pay via Stripe Checkout, and manage delivery.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) |
| Styling | Tailwind CSS |
| UI Components | Shadcn/ui |
| Server state | SWR |
| Realtime | SSE via native `EventSource` API |
| Forms | React Hook Form + Zod |
| Auth | JWT in memory + refresh token in httpOnly cookie |
| i18n | next-intl |

---

## Page Structure

```
/                          — Home: featured lots, active auctions hero
/auctions                  — Auction catalogue (browse, filter, search)
/auctions/[lotId]          — Lot detail + live bidding
/categories/[slug]         — Category browse page
/account/register          — Registration
/account/verify-email      — Email verification landing
/account/login             — Login
/account/verify-phone      — Phone OTP verification
/account/dashboard         — My bids, won lots, invoices
/account/invoices/[id]     — Invoice detail + Stripe Checkout link
/account/fulfilments/[id]  — Choose ship or collect post-payment
```

---

## Key Pages

### Home `/`

- Hero banner with featured / ending-soon auctions
- Category tiles (Rings, Necklaces, Designer Bags, etc.)
- Active auctions grid sorted by ending soonest

### Auction Catalogue `/auctions`

- Filter sidebar: category, status (Live / Upcoming / Closed), price range
- Search bar (debounced, calls Catalogue Service full-text search)
- Lot cards: primary image, title, current bid, countdown timer
- Pagination

### Lot Detail `/auctions/[lotId]`

Two panels:

**Left — Lot content (Catalogue Service):**
- Image gallery (primary + thumbnails)
- Title, condition, estimated value, description
- Category breadcrumb

**Right — Live bidding (Auction Engine):**
- Current highest bid
- Countdown timer (updated from SSE `timer_extended` events)
- Bid count
- Bid input + Place Bid button
- Bid history (amounts only, no user identity)
- Status banner: LIVE / CLOSING (red timer) / CLOSED / SOLD / UNSOLD

**SSE connection:**
- `EventSource` opens on mount to `/api/auctions/:lotId/stream`
- Events update: highest bid, bid count, end time, status
- `auction_closed` event transitions page to result state
- Auto-reconnects on disconnect

**Bid flow:**
1. User enters bid amount
2. Not logged in → redirect to login
3. Not APPROVED_BIDDER → phone verification modal
4. POST to `/api/auctions/:lotId/bids`
5. Success: optimistic UI update (SSE confirms immediately)
6. Error: inline validation message

### Registration `/account/register`

- Email + password form
- Success: "Check your email" screen
- Email link → `/account/verify-email?token=` → auto-verifies → redirect to login

### Phone Verification `/account/verify-phone`

- Triggered on first bid attempt by EMAIL_VERIFIED user
- Enter phone → receive OTP → enter 6-digit code
- On success: status → APPROVED_BIDDER, bid proceeds
- Max 3 attempts → 15-minute lockout

### Account Dashboard `/account/dashboard`

Tabs:
- **My Bids** — lots bid on, current status, my bid vs current highest
- **Won Lots** — auctions won, invoice status
- **Invoices** — payment status, Stripe Checkout link if outstanding

### Invoice `/account/invoices/[id]`

- Lot summary, amount due, due date
- Pay Now → Stripe Checkout session → redirect to Stripe hosted page
- On return: payment status shown

### Fulfilment `/account/fulfilments/[id]`

- Shown after payment confirmed
- Choose: Ship or Collect
- Ship: address form (name, address, country)
- Collect: location selector + date/time slot picker

---

## Auth State

- JWT stored in memory (not localStorage — XSS protection)
- Refresh token in httpOnly cookie — auto-refreshed by Next.js middleware
- Protected routes (`/account/*`) redirect unauthenticated users to login with `returnUrl`

---

## Realtime Countdown

- Lot detail: SSE-driven — updates on every `timer_extended` event
- Lot cards on catalogue: client-side countdown from initial `endAt` (no SSE — too many connections)
- Last 3 minutes: timer displayed in red
- On close: transitions to CLOSING → CLOSED state

---

## Internationalisation

- English only at launch, structure supports adding locales
- Currency: `Intl.NumberFormat` with currency code from API response
- Dates/times: `Intl.DateTimeFormat` in user's local timezone

---

## Error Handling

- API validation errors: displayed inline on forms
- Network errors: toast notification with retry
- SSE disconnect: silent reconnect with "Reconnecting..." indicator
- Auction closes while user is on page: SSE handles transition — no refresh needed
