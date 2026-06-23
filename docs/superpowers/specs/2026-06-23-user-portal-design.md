# Frontend Design — User Portal (The Carat Room)

**Date:** 2026-06-23
**Status:** Approved
**Design reference:** OzBid Heritage System (claude.ai/design project 336a5035-6eb5-42d0-a0f5-5e616249d351)

---

## Overview

The user-facing Next.js application for The Carat Room. Buyers browse lots, register, verify identity, pre-authorise a payment method via Stripe, place bids in real time, pay for won lots, and manage delivery. The visual language is the OzBid Heritage design system: Bodoni Moda serif headings, Mulish sans-serif UI text, near-black ink, and warm cream backgrounds.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) |
| Styling | Tailwind CSS with brand token extension |
| UI Components | Shadcn/ui + custom primitives |
| Server state | SWR (polling on account pages) |
| Realtime | SSE via native `EventSource` |
| Forms | React Hook Form + Zod |
| Payments (setup) | Stripe Elements (SetupIntent) |
| Auth | JWT in memory + refresh token in httpOnly cookie |
| Internationalisation | next-intl (currency + date formatting only; English at launch) |

---

## Design Tokens

Applied as Tailwind config extensions and CSS custom properties on `:root`:

```css
--paper:  #FFFFFF        /* page backgrounds */
--cream:  #F5F5F4        /* table headers, subtle fills */
--ink:    #111111        /* primary text, CTA buttons */
--gold:   #8a8a8a        /* section labels, accents */
--line:   rgba(0,0,0,.13)/* borders */
--mut:    #777777        /* secondary / placeholder text */
/* canvas background (outer wrapper): #e7e5df */
```

**Typography:**
- `Bodoni Moda` (Google Fonts, opsz 6–96, wt 400/500/600/700) — wordmark, headings, lot titles, large prices
- `Mulish` (Google Fonts, wt 300/400/500/600/700) — all UI labels, buttons, body, tables

---

## Shared Components

### Layout
- **`Header`** — wordmark + search bar + Watchlist link + user avatar. Light variant (white background) used on all standard pages.
- **`Header` dark variant** — same structure on `--ink` background; used during live bidding state.
- **`AppShell`** — wraps all pages. Applies light or dark theme class at page level via a React context updated by SSE events.
- **`AccountShell`** — sidebar nav layout for `/account/*` pages. Left: avatar, name, "Collector since YYYY", nav links (Overview / My Bids / Watchlist / Won Lots / Invoices & Payments / Profile & Paddle). Active item: dark background pill.

### Primitives
- **`LotCard`** — image (with hover scale transition), lot number label, title, current bid, countdown timer. Used in browse, watchlist, sale catalogue, related lots, and mobile home grids.
- **`CountdownTimer`** — client-side tick from `endAt` prop. Turns red at ≤3 minutes remaining. On lot detail, updates from SSE `timer_extended` events. On catalogue cards, ticks from initial value only (no SSE — too many connections).
- **`BidStatusBadge`** — "Leading" (green), "Outbid" (red), "Closed" pills.
- **`BidConfirmedModal`** — dark overlay, white card: tick icon, "You're the highest bidder", amount, lot name, "Continue Browsing" CTA.
- **`OutbidModal`** — dark overlay, white card: exclamation icon (ink), "You've been outbid", your bid struck-through, current bid, "Bid $X" CTA.

---

## Page Structure

```
/                              Home
/calendar                      Auction Calendar
/auctions                      Browse & Search
/auctions/[auctionId]          Sale / Catalogue page   ← auctionId is the auction UUID
/auctions/[auctionId]/lots/[lotId]  Lot Detail + Live Bidding (same page, theme switches)
/sell                          Sell / Request a Valuation
/account/login                 Sign In / Create Account
/account/verify-email          Email verification landing
/account/verify-phone          Phone OTP
/account/register-to-bid       4-step Registration Wizard
/account/dashboard             Account Overview
/account/bids                  My Bids
/account/watchlist             Watchlist
/account/won                   Won Lots
/account/invoices/[id]         Invoice Detail + Payment
/account/fulfilments/[id]      Ship or Collect
```

---

## Public Pages

### `/` — Home

- Dark hero banner: current flagship sale title, date, CTA "View Catalogue"
- "Closing soon" lot grid: 2-col mobile, 4-col desktop, sorted by `endAt` ascending
- Auction Calendar preview strip: next 3 upcoming sales

Server-rendered (Next.js RSC). Revalidates every 60 seconds.

### `/calendar` — Auction Calendar

Three tabs: **Upcoming / Live Now / Results**.

Each sale row: date column (day + month in Bodoni Moda), thumbnail, sale title, lot count + location, CTA button.
- Open sale → "View Catalogue" (filled ink button)
- Upcoming sale → "Register Interest" (outlined button)

Server-rendered.

### `/auctions/[auctionId]` — Sale / Catalogue Page

- Sale hero banner: title, date, location, viewing dates
- Action bar (cream background): Register to Bid / Download PDF Catalogue / ♡ Follow Sale
- Paginated lot grid (4-col desktop), sortable: Lot Number / Ending Soonest / Price

Server-rendered with SWR revalidation.

### `/auctions` — Browse & Search

**Filter sidebar (240px):**
- Department (multi-select checkboxes with counts)
- Price range (dual-handle slider + min/max inputs)
- Status (Open for bidding / Ending today / No reserve)
- Auction (multi-select checkboxes)

**Results area:**
- Count + heading ("Aboriginal & First Nations Art — 248 lots found")
- Sort dropdown (Ending Soonest / Lot Number / Price Low→High / Price High→Low)
- 3-column LotCard grid

Search bar in Header is debounced (300ms). All filter/sort/search state lives in URL query params. Client-side with SWR.

### `/auctions/[auctionId]/lots/[lotId]` — Lot Detail + Live Bidding

**Standard state (light theme):**

Two-column layout:

*Left — gallery:*
- Primary image (540px tall, border)
- Thumbnail strip (4 thumbnails, active has ink border)

*Right — info + bid panel:*
- Lot number + department label
- Title (Bodoni Moda h1)
- Medium, dimensions, catalogue number (muted)
- Bid panel (white card with border):
  - Current bid + bid count
  - Estimate (right-aligned)
  - Countdown pill (cream background, ink dot + text)
  - Bid input ($ prefix) + "Place Bid" button (ink)
  - Minimum bid notice + buyer's premium notice
- Add to Watchlist + Enquire / Condition buttons (outlined)
- Provenance section
- Authenticity + shipping trust marks

*Below — "From the same collection":* 4-col related lots grid.

**Live state (dark theme) — triggered by SSE when `status = LIVE` AND countdown ≤ 8 minutes, OR user clicks "Enter Live Room" CTA that appears when auction is live:**

Full-width dark layout via CSS class swap on `AppShell` (smooth transition, no reload):

*Left panel:*
- Large lot image with "Lot XXX · Now Selling" overlay badge
- Lot title + estimate below
- Time-to-close countdown (tabular numerals, ticking, turns red at ≤60 seconds)

*Right panel:*
- "Current Bid" label + large amount
- Status line: "You are leading" (gold) or "You've been outbid" (red)
- Primary bid button: "Bid $X" (full-width, ink background)
- Quick-bid buttons: +$2k / +$4k / Custom (three outlined buttons)
- Bid activity feed: chronological list (You / Paddle NNN / Online · City), amounts

*Bottom strip:* "Up Next" — next 2 lots in the sale (thumbnail, lot number, title, estimate).

**Bid flow:**
1. User enters amount and clicks Place Bid
2. Not authenticated → redirect to `/account/login?returnUrl=...`
3. `EMAIL_VERIFIED` (no phone yet) → phone OTP modal inline
4. `APPROVED_BIDDER` but no saved payment method → redirect to `/account/register-to-bid`
5. `PENDING_REVIEW` → "Your identity is under review" toast
6. Valid → `POST /auctions/:lotId/bids`
7. Success → `BidConfirmedModal`
8. Outbid immediately → `OutbidModal`

**SSE connection:**
- `EventSource` opens on mount to `/api/auctions/:lotId/stream` (Next.js route handler proxying to auction-engine)
- Events: `bid_placed` (updates current bid, bid count, activity feed), `timer_extended` (updates `endAt`), `closing_soon` (triggers live theme switch), `auction_closed` (transitions page to SOLD/UNSOLD state)
- Auto-reconnects with exponential back-off; shows "Reconnecting…" indicator

### `/sell` — Sell / Request a Valuation

Split layout: dark left panel + form right. No auth required.

*Left:* Wordmark, heading "Sell with The Carat Room", bullet list (No upfront fees / Global bidder reach / Insured collection & storage).

*Form fields:*
- Category (select dropdown)
- Artist / Maker (text, optional)
- Description (textarea — medium, dimensions, provenance, condition)
- Photographs (drag-and-drop zone, up to 6 images, JPG/PNG/PDF, uploaded to R2 via `POST /enquiries/valuation/upload`)
- Name + Email

Submit → `POST /enquiries/valuation`. Confirmation screen: "We'll be in touch within two business days."

---

## Auth Flow

### `/account/login` — Sign In / Create Account

Split layout: dark branded left panel (wordmark + "Bid with confidence on the finest collections in Australia." + "Authenticity guaranteed · Insured shipping worldwide") + tabbed form right.

**Sign In tab:** Email, Password, Forgot password link, Sign In button, "New? Create account" link.
**Create Account tab:** Email, Password, Confirm Password, Create Account button.

On create success → "Check your email" screen.

### `/account/verify-email`

Reads `?token=` from URL. On mount, calls `POST /auth/verify-email`. Shows success → auto-redirects to login after 3 seconds. On failure → "Link expired" with resend option.

### `/account/verify-phone`

Triggered on first bid attempt by `EMAIL_VERIFIED` user (shown as inline modal on lot detail, or standalone page).

Flow: enter phone number → "Send Code" → enter 6-digit OTP → verify. Max 3 attempts → 15-minute lockout displayed as countdown timer.

### `/account/register-to-bid` — 4-Step Wizard

Progress bar: **Account → Identity → Payment → Approved**

**Step 1 · Account**
Auto-skipped if already logged in. Otherwise: email + password form.

**Step 2 · Identity**
Fields: Full legal name, Date of birth (DD/MM/YYYY), Residential address.
Government ID upload: drag-and-drop zone (JPG or PDF, max 10MB, "encrypted at rest" notice).
On submit → `POST /users/identity-document` (multipart): uploads file to Cloudflare R2, stores `identityDocumentKey` on user record, sets `verificationStatus = PENDING_REVIEW`.
Proceeds to Step 3 immediately after upload succeeds.

**Step 3 · Payment**
Stripe Elements card form (hosted fields — PCI compliant):
- Card number, Expiry, CVC

On submit:
1. Frontend calls `POST /payments/setup-intent` → receives `clientSecret`
2. Stripe.js `confirmCardSetup(clientSecret)` — $0 authorisation validates the card
3. On success → `POST /payments/setup-intent/confirm` with `setupIntentId` → backend stores `stripeCustomerId` + `stripePaymentMethodId` on user record

Card declined → inline error, user retries. No page navigation until confirmed.

**Step 4 · Approved**
If `verificationStatus = APPROVED_BIDDER` (admin has approved) → "You're approved. Happy bidding!" with "Browse Lots" CTA.
If still `PENDING_REVIEW` → "Your identity is under review. We'll notify you by email." Polls `/auth/me` every 10 seconds via SWR to detect approval.

---

## Account Pages

All use `AccountShell` (sidebar nav layout). Data fetched client-side with SWR, polling every 5 seconds.

### `/account/dashboard` — Overview

Greeting line + context ("You are leading on N lots. One watched lot closes within the hour.").

Four stat cards (grid): Active Bids / Leading / Watching / Won This Year (last card: dark background).

Active Bids preview table (most recent 5): lot thumbnail (46px), title, your bid, Leading/Outbid badge, countdown. "View all →" links.

### `/account/bids` — My Bids

Full table: thumbnail, title, your bid, current highest bid, status badge, closes countdown. Outbid rows: "Bid again" link → lot detail page.

### `/account/watchlist` — Watchlist

3-column LotCard grid. Filled heart overlay on each card. Clicking heart → optimistic remove, calls `DELETE /lots/:id/watchlist`.

### `/account/won` — Won Lots

Table columns: lot thumbnail + title + won date | Hammer price | Status pill | Action.

Status pills: "Payment due" (amber) / "Shipped" (green) / "Delivered" (green) / "Collected" (green).
Actions: "Pay now" → invoice page | "Track" → fulfilment page | "Invoice" → invoice page.

### `/account/invoices/[id]` — Invoice Detail

Lot summary (thumbnail, title, won date) + price breakdown (hammer, buyer's premium 22%, GST, shipping) + total due.

Two payment options:
- **Pay with saved card** — "Pay $X,XXX" button → `POST /payments/invoices/:id/pay-saved-card` → success/failure inline
- **Pay via Stripe Checkout** — "Pay by card or bank transfer" link → redirect to Stripe Checkout session

### `/account/fulfilments/[id]` — Ship or Collect

Two option cards: **Ship** / **Collect** (radio-style selection).

Ship: name, address line 1, address line 2, city, postcode, country. Submit → `POST /fulfilments/:id/address`.

Collect: location selector dropdown + date picker + time slot picker. Submit → `POST /fulfilments/:id/collection-slot`.

---

## New Backend Endpoints

These are additions only — no existing endpoints are modified.

### user-auth service

**`POST /users/identity-document`** (authenticated, multipart/form-data)
- Accepts: file (JPG or PDF, ≤10MB)
- Validates file type and size
- Uploads to Cloudflare R2 at `identity-docs/{userId}/{timestamp}.{ext}`
- Stores `identityDocumentKey` on user record
- Sets `verificationStatus = PENDING_REVIEW`
- Returns: `{ status: 'pending_review' }`

### payment service

**`POST /payments/setup-intent`** (authenticated)
- Creates or retrieves Stripe Customer for the user
- Creates a Stripe SetupIntent with `payment_method_types: ['card']`
- Returns: `{ clientSecret: string }`

**`POST /payments/setup-intent/confirm`** (authenticated)
- Body: `{ setupIntentId: string }`
- Retrieves SetupIntent from Stripe, confirms `status = succeeded`
- Stores `stripeCustomerId` and `stripePaymentMethodId` on user record (via user-auth service or direct DB update — payment service owns its own DB)
- Returns: `{ ok: true }`

**`POST /payments/invoices/:id/pay-saved-card`** (authenticated)
- Retrieves invoice + user's `stripePaymentMethodId`
- Creates and confirms a Stripe PaymentIntent against the saved method
- On success: marks invoice paid, publishes `payment.received` event to RabbitMQ
- Returns: `{ status: 'paid' }` or `{ error: string }`

### admin service

**`POST /enquiries/valuation`** (public — no auth)
- Body: `{ category, artistMaker?, description, photoKeys[], name, email }`
- Stores enquiry in `valuation_enquiries` table
- Publishes `enquiry.valuation.received` routing key to RabbitMQ (notification-service sends email to admin)
- Returns: `{ ok: true }`

**`POST /enquiries/valuation/upload`** (public — no auth, multipart/form-data)
- Accepts: image/PDF, ≤20MB per file
- Uploads to R2 at `valuation-enquiries/uploads/{uuid}.{ext}`
- Returns: `{ key: string }` — client collects keys and submits with the valuation form

---

## Auth State

- JWT stored in memory (not localStorage — XSS protection)
- Refresh token in httpOnly cookie — auto-refreshed by Next.js middleware on `(account)` route group
- Protected routes (`/account/*`, bid action) redirect unauthenticated users to `/account/login?returnUrl=...`

---

## Responsive Behaviour

Desktop (≥1280px): full multi-column layouts as per design.
Tablet (768–1279px): lot grids reduce to 2-col; sidebar filters collapse to a drawer.
Mobile (<768px): single-column. Lot detail stacks gallery above bid panel. Account pages hide sidebar, use a top tab strip instead. Header collapses to wordmark + hamburger.

Mobile-specific screens (from design):
- Home: dark hero + 2-col "Closing soon" grid + bottom nav bar (Home / Browse / Watch / Bids)
- Lot detail: full-bleed image top, info + "Place Bid · $X" sticky bottom bar

---

## Realtime Strategy

| Surface | Strategy |
|---|---|
| Lot detail (standard) | SSE — `bid_placed`, `timer_extended`, `closing_soon`, `auction_closed` |
| Lot detail (live) | Same SSE connection — theme switches on `closing_soon` event |
| Catalogue lot cards | Client-side tick only from initial `endAt` (no SSE) |
| Account dashboard | SWR polling every 5 seconds |
| Register-to-bid Step 4 | SWR polling `/auth/me` every 10 seconds until `APPROVED_BIDDER` |

---

## Error Handling

- Form validation errors: inline below each field (React Hook Form)
- API errors: toast notification (top-right, 4 second auto-dismiss)
- Stripe card declined: inline error on card form
- SSE disconnect: silent reconnect with exponential back-off; "Reconnecting…" badge appears after 5 seconds
- Auction closes while user is mid-bid: SSE `auction_closed` event disables bid input, shows "This auction has closed" banner — no page reload needed
