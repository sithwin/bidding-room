# Draft Task List — deferred work (not in the current bug-fix plan)

> Items parked during the 2026-07-09 full-functionality audit. The active plan is
> `docs/superpowers/plans/2026-07-09-admin-portal-bug-fixes.md` (Tasks 1–20, admin side + event backbone).
> Each item below should get its own spec/plan before implementation.
>
> Moved INTO the active plan on 2026-07-09 (user decision "fix now"): valuation enquiries admin UI
> (+ its missing table — Task 19) and real dashboard counts (Task 20).

## 1. User-portal full contract audit + fixes

**Update 2026-07-09:** PR #3 (merged to main) fixed the user-portal↔**catalogue** contract — pages now
parse through shared schemas. Remaining audit scope: user-portal against the **auction engine (bidding,
SSE), payment (checkout, invoices) and shipping (fulfilment choice)** — those consumers were not touched
by PR #3.

**Scope when picked up:**
- [ ] Audit every user-portal page against the actual backend routers (catalogue, auction engine, payment, shipping, user-auth) — same method as the admin audit: open the router, compare the envelope and field names, check `res.ok` handling.
- [ ] Audit the buyer money path UI: lot detail SSE updates, bid submission, checkout redirect, invoice/payment status, fulfilment choice (ship vs collect), address entry, collection slots.
- [ ] Fix all confirmed mismatches; add runtime guards per the repo Lessons.
- [ ] Browser-drive the full buyer journey: register → verify → bid → win → pay (Stripe test mode) → choose fulfilment.

## 2. API contract testing rollout — phases 2+

**Update 2026-07-09:** phase 1 was executed and merged upstream (PR #3): catalogue response schemas +
query builders in `@carat-room/shared-types`, PGlite `@carat-room/test-db` harness, catalogue router
tests enforcing the schemas, user-portal parsing through them.

**Remaining scope:**
- [ ] Extend contract schemas to the auction engine, payment, shipping, user-auth and admin service endpoints (the active bug-fix plan adds schemas for its NEW endpoints only).
- [ ] **RabbitMQ event payload contracts (producer/consumer pairs)** — highest value: this is where the silent money-path breakage lived (`auction.closed` drift).
- [ ] Convert remaining fake-Db repository tests to the PGlite harness so column drift is caught by real migrations.
