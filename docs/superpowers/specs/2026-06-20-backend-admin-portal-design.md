# Backend Design — Admin Portal Service

**Date:** 2026-06-20
**Status:** Approved

---

## Overview

The Admin Service is an internal HTTP API consumed exclusively by the Admin Portal frontend. It orchestrates operations across all other services via their internal Hono APIs. It does not own a database — it reads and mutates state through each service's own API.

Admin routes are restricted at Nginx level to VPN / IP allowlist. All requests require a JWT with `role: ADMIN`.

---

## Architecture

```
Admin Portal (Next.js)
       │
  /admin/api/*
       │
  Admin Service (Hono)
       │
  ┌────┴──────────────────────────────────────┐
  │          Internal HTTP calls              │
  ├── User Service      /api/users/*          │
  ├── Catalogue Service /api/lots/*           │
  ├── Auction Engine    /api/auctions/*       │
  ├── Payment Service   /api/payments/*       │
  └── Shipping Service  /api/shipping/*       │
  └───────────────────────────────────────────┘
```

No direct database access. All reads and mutations go through each service's API. This preserves service boundary ownership.

---

## Authentication

- Admin JWT must have `role: ADMIN`
- JWT validated by Admin Service on every request using shared `shared-auth` package
- Nginx additionally restricts `/admin/*` to allowlisted IPs

---

## API Endpoints

### Lot Management

```
POST   /admin/api/lots                        — create lot
PATCH  /admin/api/lots/:id                    — update lot content
DELETE /admin/api/lots/:id                    — delete lot (only if no auction scheduled)
POST   /admin/api/lots/:id/images/upload-url  — get pre-signed R2 upload URL
DELETE /admin/api/lots/:id/images/:imageId    — remove image
PATCH  /admin/api/lots/:id/images/reorder     — update image display order
```

### Auction Management

```
POST   /admin/api/auctions                    — schedule auction for a lot
         body: { lotId, startAt, endAt, reservePrice, minBidIncrement,
                 autoExtendWindowMinutes, autoExtendDurationMinutes }
PATCH  /admin/api/auctions/:lotId/reschedule  — change start/end time (SCHEDULED only)
DELETE /admin/api/auctions/:lotId             — cancel auction (SCHEDULED or LIVE)
GET    /admin/api/auctions                    — list all auctions with status + lot summary
GET    /admin/api/auctions/:lotId             — auction detail + full bid history
```

### User Management

```
GET    /admin/api/users                       — paginated list (filter by status, search by email)
GET    /admin/api/users/:id                   — user detail + bid history + invoices
PATCH  /admin/api/users/:id/suspend           — suspend user account
PATCH  /admin/api/users/:id/reinstate         — reinstate suspended user
PATCH  /admin/api/users/:id/approve           — manually approve bidder
```

### Payment Management

```
GET    /admin/api/invoices                    — list all invoices (filter by status)
GET    /admin/api/invoices/:id                — invoice detail
PATCH  /admin/api/invoices/:id/extend         — extend payment due date
PATCH  /admin/api/invoices/:id/cancel         — cancel invoice (with reason)
```

### Fulfilment Management

```
GET    /admin/api/fulfilments                 — list pending fulfilments
GET    /admin/api/fulfilments/:id             — fulfilment detail
PATCH  /admin/api/fulfilments/:id/dispatch    — mark dispatched (body: { trackingNumber, carrier })
PATCH  /admin/api/fulfilments/:id/collect     — mark collected
```

### Categories

```
GET    /admin/api/categories                  — full category tree
POST   /admin/api/categories                  — create category
PATCH  /admin/api/categories/:id              — rename / reorder
DELETE /admin/api/categories/:id              — delete (only if no lots assigned)
```

### Reports

```
GET    /admin/api/reports/auction-results     — sold/unsold by date range
GET    /admin/api/reports/revenue             — total revenue by period + currency breakdown
GET    /admin/api/reports/unsold-lots         — lots that did not meet reserve, ready to relist
```

---

## Internal Service Communication

Admin Service calls other services over the Docker internal network using service names as hostnames (e.g. `http://catalogue-service:3001`). No external network hop.

All internal calls forward the admin JWT in the `Authorization` header so downstream services can authorise the request.

---

## No Persistent State

Admin Service holds no database. If an internal service call fails, the Admin Service returns the error directly to the Admin Portal — no compensating transactions needed since each operation is a single service call.
