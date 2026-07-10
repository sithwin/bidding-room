# Lot Status & Category Fix — Design

**Date:** 2026-07-10
**Status:** Approved

## Problem

The admin-portal Lots list (`/admin/lots`) renders a "Category" column and a "Status" column that are always blank. Root cause: neither field has ever had a backing contract.

- `categoryName` — catalogue service resolves `categoryId` but the admin-portal table expects a resolved name it never asked for.
- `status` — the catalogue `Lot` domain object has no status field at all, and no migration ever added one. What the admin table actually wants conflates two different concepts that need to be separated (see below).

A second, previously-undiscovered bug: `PATCH /api/lots/:id` does not exist in the catalogue service at all. The admin-service proxy (`PATCH /admin/api/lots/:id`) points at a route that was never implemented, so lot editing is completely broken independent of the status bug.

## Two distinct status concepts

1. **`status`** (Active / Inactive) — owned by the **catalogue service**. A simple business flag: is this lot available at all. An `INACTIVE` lot must not be schedulable into an auction. This is a normal CRUD field, admin-editable via the lot create/edit forms.
2. **`auctionStatus`** (`DRAFT | SCHEDULED | LIVE | CLOSING | CLOSED | SOLD | UNSOLD`, plus `UNSCHEDULED`) — owned by the **auction-engine**, derived from its event-sourced aggregate. Never admin-editable — CLAUDE.md is explicit that aggregate state must only ever change by appending events, never by direct write. `UNSCHEDULED` is a label the admin-service applies itself when a lot has no `auctionId` at all (auction-engine has no record of such a lot; it is not one of auction-engine's own enum values).

These must never be merged into a single field — they have different owners, different mutability rules, and different meanings.

## Changes

### 1. Catalogue service — new `status` field

- New migration: `lots.status` — `ACTIVE | INACTIVE`, `NOT NULL DEFAULT 'ACTIVE'`. Mirror the schema change into `tests/db-init/init.sql` in the same change (existing lesson: the test DB bootstrap does not run service migrations).
- `Lot` domain object (`apps/catalogue/src/domain/lot.ts`) gains `status: LotActiveStatus` (`'ACTIVE' | 'INACTIVE'`).
- `POST /api/lots` accepts optional `status`, defaulting to `ACTIVE` when omitted.
- **New** `PATCH /api/lots/:id`: accepts a partial update of `title`, `description`, `categoryId`, `condition`, `estimatedValue`, `status`. Follows the same Clean Architecture layering as `create-lot-use-case.ts` (a new `update-lot-use-case.ts` in `application/`, a repository update method in `infrastructure/postgres-lot-repository.ts`, validation/mapping in the presentation router). This is the only place `status` is ever changed — there is no separate "set status" endpoint.
- `GET /api/lots` and `GET /api/lots/:id` responses include `status` since it is now a real field on `Lot`.

### 2. Admin-service — auction scheduling guard

`apps/admin/src/presentation/auctions-router.ts`, `POST /admin/api/auctions` handler (the "Schedule Auction" action): before proxying to auction-engine, fetch the lot from catalogue via the `catalogue` client already injected into this router. If `lot.status === 'INACTIVE'`, return `409 Conflict` with a clear error body instead of proxying the request. This is a composition-layer check — auction-engine itself has no knowledge of catalogue's `status` field and doesn't need any.

### 3. Admin-service — Lots list enrichment

`apps/admin/src/presentation/lots-router.ts`:
- `buildLotsRouter` changes from a single `client: ServiceClient` parameter to `{ catalogue, auction }: { catalogue: ServiceClient; auction: ServiceClient }`, matching the pattern already used by `buildAuctionsRouter` and `buildReportsRouter`. Update the call site in `apps/admin/src/main.ts` accordingly (an `auction` client is already constructed there for other routers).
- In `GET /admin/api/lots`:
  - `status` is passed through unchanged from catalogue's response (no extra call — catalogue now owns and returns it directly).
  - `categoryName`: resolve via the existing `fetchCategoryNameMap(catalogue, token)` helper in `enrichment.ts` (already exists, currently unused by this router) and attach the resolved name to each row.
  - `auctionStatus`: for each lot, if `auctionId` is `null`, set `auctionStatus: 'UNSCHEDULED'` with no network call. If `auctionId` is set, call a new `fetchLotAuctionStatus(auction, lotId, token)` helper (added to `enrichment.ts` alongside `fetchLotTitle`/`fetchCategoryNameMap`, following the same fail-soft-to-`null` pattern) hitting auction-engine's existing `GET /api/auctions/:lotId`. A `null` result renders as "—" in the UI.
- `GET /admin/api/lots/:id` gets the same enrichment for the lot detail/edit page.

### 4. Admin-portal UI

- `apps/admin-portal/src/app/admin/lots/new/_new-lot-form.tsx`: add a Status select (Active / Inactive), defaulting to Active.
- `apps/admin-portal/src/app/admin/lots/[id]/_edit-form.tsx`: add the same Status select, pre-filled from the lot's current value.
  - Editing is always allowed regardless of auction state (per product decision), but if the lot's `auctionStatus === 'LIVE'`, show a confirmation dialog ("This lot's auction is currently live — save changes anyway?") before the PATCH request is submitted.
- `apps/admin-portal/src/app/admin/lots/_table.tsx`: split the single "Status" column into two badge columns — **Status** (Active/Inactive) and **Auction Status** (view-only, no click-through to an editor).
- `apps/admin-portal/src/components/status-badge.tsx`: add the missing `STATUS_VARIANTS` entries — `INACTIVE`, `DRAFT`, `CLOSING`, `SOLD`, `UNSOLD`, `UNSCHEDULED` (`ACTIVE` already exists).
- `Lot` type in `_table.tsx` (and any shared type used by the edit form) gains `status: 'ACTIVE' | 'INACTIVE'`, `auctionStatus: string | null`, `categoryName: string | null`.

## Error handling

- Auction-engine unreachable during list enrichment → `auctionStatus: null` per row (fail-soft, matches existing `enrichment.ts` helpers), not a failed page load.
- Categories service call fails during enrichment → `categoryName: null` per row, same fail-soft pattern.
- Scheduling an `INACTIVE` lot → `409` from admin-service, surfaced as a form error in the "Schedule Auction" flow, not a silent failure.
- `PATCH /api/lots/:id` with an unknown `id` → `404`, matching the existing pattern in `GET /api/lots/:id`.

## Testing

- Catalogue: unit tests for `update-lot-use-case.ts` (partial updates, status transitions) and the repository's update method; router test for `PATCH /api/lots/:id` (200, 404, partial-body handling).
- Admin-service: `auctions-router` test asserting `409` when scheduling an `INACTIVE` lot and pass-through when `ACTIVE`; `lots-router` test asserting `categoryName`/`auctionStatus`/`status` are all present in the response, and that `auctionStatus` fails soft to `null` when the auction client errors.
- Admin-portal: form tests for the new Status field on both create and edit forms.
- Manual verification (required before marking this done, per the existing "schema unit tests are not verification for a UI flow" lesson): create an Active lot, create an Inactive lot, confirm "Schedule Auction" is blocked for the Inactive one, schedule the Active one, and confirm the Lots list shows correct Status and Auction Status badges — driven in a real browser against the running stack, not inferred from tests passing.

## Out of scope

- Any automatic transition of `status` (e.g. auto-setting `INACTIVE` after a lot is sold) — not requested, and `auctionStatus` already communicates that a lot is closed/sold.
- Bulk status editing.
- Image/photo editing changes to `PATCH /api/lots/:id` beyond the fields listed above.
