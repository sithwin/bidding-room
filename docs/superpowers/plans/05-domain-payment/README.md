# 05 — Domain: Payment

## Scope
Backend: Payment Service (Hono) — invoice generation, Stripe Checkout, webhook handling, payment window expiry via BullMQ.
Frontend: invoice detail page, Stripe Checkout redirect, payment confirmation screen.

## Prerequisites
`00-infrastructure`, `01-shared-packages`, `04-domain-auction-engine` complete.
Consumes `AuctionClosed` event from Auction Engine.

## Spec references
- `docs/superpowers/specs/2026-06-20-backend-user-portal-design.md` — Section 4
- `docs/superpowers/specs/2026-06-20-frontend-user-portal-design.md` — Invoice page

## Plan file
`plan.md` — implementation steps to be added here.
