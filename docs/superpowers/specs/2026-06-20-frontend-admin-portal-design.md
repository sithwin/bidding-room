# Frontend Design — Admin Portal

**Date:** 2026-06-20
**Status:** Approved

---

## Overview

Internal Next.js application for staff to manage the auction platform. Accessible only via VPN or IP allowlist. All data flows through the Admin Service API.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) |
| Styling | Tailwind CSS |
| UI Components | Shadcn/ui |
| Server state | SWR |
| Forms | React Hook Form + Zod |
| Tables | TanStack Table |
| Auth | JWT + httpOnly cookie, `role: ADMIN` required |

---

## Page Structure

```
/admin/login                        — Admin login
/admin/dashboard                    — Overview stats
/admin/lots                         — Lot list
/admin/lots/new                     — Create lot
/admin/lots/[id]                    — Edit lot + manage images
/admin/auctions                     — Auction list
/admin/auctions/new                 — Schedule auction
/admin/auctions/[lotId]             — Auction detail + bid history
/admin/users                        — User list
/admin/users/[id]                   — User detail
/admin/invoices                     — Invoice list
/admin/invoices/[id]                — Invoice detail
/admin/fulfilments                  — Fulfilment list
/admin/fulfilments/[id]             — Fulfilment detail
/admin/categories                   — Category management
/admin/reports                      — Reports
```

---

## Key Pages

### Dashboard `/admin/dashboard`

Summary cards:
- Active auctions count
- Auctions ending in next 24 hours
- Pending invoices (unpaid, not expired)
- Pending fulfilments (paid, delivery not yet arranged)
- Recent activity feed

### Lot Management

**`/admin/lots`**
- Table: title, category, status, created date
- Actions per row: Edit, Delete, Schedule Auction
- New Lot button

**`/admin/lots/new` and `/admin/lots/[id]`**
- Form: title, description, category (dropdown), condition, estimated value
- Image uploader:
  - Requests pre-signed R2 URL from Admin Service
  - Uploads directly to R2 from browser (no binary data through service)
  - Displays uploaded images with drag-to-reorder, set-primary, delete
- Save → POST/PATCH to Admin Service

### Auction Scheduling

**`/admin/auctions/new`**
- Select lot (searchable dropdown, lots without scheduled auction only)
- Fields: start date/time, end date/time, reserve price, min bid increment
- Auto-extend settings: window (minutes), extension duration (minutes)

**`/admin/auctions/[lotId]`**
- Status badge + lot summary
- Live stats: current highest bid, bid count, time remaining
- Full bid history table: user email, amount, timestamp
- Actions: Reschedule (SCHEDULED only), Cancel

### User Management

**`/admin/users`**
- Table: email, status, country, registered date, bid count
- Filter by status, search by email

**`/admin/users/[id]`**
- Profile + verification status
- Bid history, invoice history
- Actions: Suspend, Reinstate, Manually Approve

### Invoice Management

**`/admin/invoices`**
- Table: lot title, winner email, amount, currency, status, due date
- Filter by status

**`/admin/invoices/[id]`**
- Invoice detail + Stripe payment intent ID
- Actions: Extend due date (date picker), Cancel (reason required)

### Fulfilment Management

**`/admin/fulfilments`**
- Table: lot title, buyer email, method (Ship/Collect/Pending), status
- Filter by status

**`/admin/fulfilments/[id]`**
- Method + address or collection slot details
- Actions: Mark Dispatched (tracking number + carrier), Mark Collected

### Category Management `/admin/categories`

- Nested tree view (expandable)
- Inline rename
- Add child category
- Drag-to-reorder
- Delete disabled if lots are assigned

### Reports `/admin/reports`

**Auction Results tab**
- Date range picker
- Table: lot title, category, final bid, reserve met, winner email
- Summary: total lots, % sold, total value

**Revenue tab**
- Total revenue by currency
- Bar chart: revenue by week/month

**Unsold Lots tab**
- Lots where reserve was not met
- Relist action: opens Schedule Auction with lot pre-selected

---

## Auth

- Separate login at `/admin/login`
- Same User Service auth — JWT checked for `role: ADMIN`
- Non-admin users redirect to `/admin/login`
- Session timeout: 8 hours

---

## Design Principles

- Data-dense tables with colour-coded status badges
- Confirmation dialogs for destructive actions (cancel auction, suspend user)
- Optimistic updates where safe; reload on error
- Clarity and speed over visual polish
