# API Contract Testing — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contract drift between the user-portal and the remaining four services — user-auth, auction-engine, payment, shipping — fails `pnpm turbo test` on every run, and the lot detail page (deferred from Phase 1 as a known runtime crash) is converted first.

**Architecture:** Same mechanism as Phase 1 (see `docs/superpowers/specs/2026-07-08-api-contract-testing-design.md`): shared Zod schemas in `packages/shared-types/src/api/` are the single source of truth. Service router tests parse every asserted body through them (producer side); user-portal fetchers and API-route proxies `safeParse` through them with graceful fallbacks (consumer side); typed query builders and request-body schemas make param/field-name drift a compile or test failure. PGlite repository testing already exists for these services (Phase 4 concerns only user-auth, which still hand-rolls its schema).

**Tech Stack:** Zod ^3.25.76, vitest 1.6, Hono, Next.js App Router, Turborepo/pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-07-08-api-contract-testing-design.md` — Phasing row 2: "user-auth, auction-engine, payment, shipping schemas + query builders; portal auth/bid/payment/shipping fetchers and API-route proxies converted."

## Global Constraints

- British English in comments and copy; single quotes; named exports only; no `var`; strict TS, no `@ts-ignore` in production code.
- Test files co-located with sources, named `<filename>.test.ts`. No `__tests__` directories.
- **No service production-code behaviour changes**: producer enforcement lives in tests only. All fixes for discovered drift land in the portal (proxies, fetchers, pages) — reality wins, schemas document what routers actually emit.
- Portals must never crash on a malformed response: consumer parse failures log via `console.error` and return the declared fallback.
- Schemas document the routers' *actual* output — every schema in this plan was transcribed from the router/serialiser source on 2026-07-11; if the router has changed since, re-read the router and correct the schema, never the other way round.
- SSE payloads and non-JSON endpoints are out of schema scope (spec Error Handling; the SSE proxy at `src/app/api/auctions/[lotId]/stream/route.ts` is untouched).
- Commit after every task.

## Spec Coverage Checklist

Built from the spec forward, restricted to Phase 2 scope. Every task cites the items it satisfies.

- C1. One schema module per service in `shared-types/src/api/`: `user-auth.ts`, `auction-engine.ts`, `payment.ts`, `shipping.ts` — covering every JSON response each service produces, matching actual serialisation (nullable fields, ISO date strings, envelope deviations recorded as they really are).
- C2. Inferred TS types exported (`z.infer`) so consumers stop declaring inline types.
- C3. Typed query builders exported next to the schemas; parameter keys are exactly the names the routers read (`auction-engine`: `page`, `pageSize`; `payment` invoices: `status`; `shipping` fulfilments: `status`; `user-auth` admin list: `status`, `search`).
- C4. Request-body schemas exported for every POST/PATCH body a router reads — the body-field analogue of query builders (same drift class as query-param drift: invented field names no-op silently).
- C5. Every service router test that reads a body parses it with the shared schema (producer enforcement); each query builder is used in at least one router-test request.
- C6. Portal fetch boundary parses with `safeParse`; failure → `console.error` + declared fallback; empty/degraded states render, never a crash.
- C7. Portal tests assert strict `parse`; all portal fixtures typed `satisfies z.infer<typeof …>`.
- C8. Inline `as { … }` casts on `res.json()` removed from every user-portal seam to these four services.
- C9. **Lot detail page converted as the first consumer task** (Phase 1 plan "Known Exclusion" mandate): `page.tsx` merges catalogue `lotResponseSchema` with the new auction-engine lot-status schema; the imagined `Lot` type is deleted.
- C10. Schema/producer disagreements discovered during rollout are fixed on the consumer side in the same change (refresh cookie name, wrong proxy paths — see Discovered Drift below).
- C11. Deliberate-drift smoke check: temporarily rename a serialised field in one router, confirm the schema assertion fails, revert (manual verification, not committed).
- C12. Phase 3 (admin-portal consumers) and Phase 4 (user-auth repository tests onto PGlite) remain out of scope — separate plans. Admin *endpoints* of these services still get producer-side schemas here (C1 covers every response), but no admin-portal code changes.
- C13. Existing report schemas (`auction-reports.ts`, `payment-reports.ts`, `shipping-reports.ts`) are reused/re-exported, never duplicated.

## Discovered Drift (fixed by this plan, consumer side)

Found on 2026-07-11 while transcribing router serialisations. Each is a live bug today:

- D1. **Refresh is fully broken.** `src/app/api/auth/refresh/route.ts` reads a cookie named `refresh_token`, but user-auth sets `carat_refresh`; it also casts the response to `{ accessToken, user }`, but user-auth returns `{ data: { accessToken } }` (no `user`). Every silent re-login fails.
- D2. **Bid placement posts to a route that doesn't exist.** `lot-detail-client.tsx` posts to `/api/auction/auctions/{auctionId}/lots/{lotId}/bids`; there is no such proxy, and auction-engine's real path is `POST /api/auctions/:lotId/bids`.
- D3. **Invoice detail proxy points at a non-existent path.** `src/app/api/account/invoices/[id]/route.ts` calls payment `/api/invoices/${id}`; the real path is `/api/payments/invoices/${id}`.
- D4. **"Pay now" checkout has no proxy.** `InvoiceDetail.tsx` posts to `/api/payments/invoices/{id}/checkout`; no such route file exists (only `pay-saved-card`).
- D5. **Shipping proxies call invented paths.** Portal proxies call `/fulfilments/{id}/address` and `/fulfilments/{id}/collection-slot`; shipping's real paths are `/choose-ship` and `/choose-collect`.
- D6. **Calendar page expects `{ auctions }`** but catalogue returns `{ data, meta }` — the list is permanently empty (missed catalogue seam from Phase 1; Boy Scout fix here).
- D7. **Lot detail page** casts the catalogue envelope to an imagined rich `Lot`; `lot.currency.toUpperCase()` crashes at runtime (the Phase 1 Known Exclusion).

## Discovered Gaps (flagged, NOT built in this plan)

These portal features call endpoints that exist in **no** service. Building them is feature work, not contract testing — each needs its own plan. The affected pages keep their current degraded behaviour:

- G1. `GET /api/account/bids` and `GET /api/account/stats` proxy to auction-engine paths that don't exist (account bids page, dashboard).
- G2. `GET /api/account/won` proxies to a payment path that doesn't exist (won lots page).
- G3. `GET/POST/DELETE` watchlist routes — catalogue has no watchlist endpoints at all (watchlist page, lot-detail watchlist toggle).
- G4. `POST /api/auth/resend-verification` — user-auth has no resend endpoint.
- G5. **No service owns a lot's display currency.** Auction-engine serialises bare numbers; catalogue has none; only payment invoices carry `currency`. The portal already defaults to `'AUD'` in `lot-card.tsx`. This plan extracts that literal into one shared portal constant and flags currency ownership as a backend decision for a future plan.

## File Structure

```
packages/shared-types/
  src/api/user-auth.ts            — create: schemas + usersQuery builder + request schemas
  src/api/user-auth.test.ts       — create
  src/api/auction-engine.ts       — create: schemas + auctionsListQuery/bidHistoryQuery + request schemas
  src/api/auction-engine.test.ts  — create
  src/api/payment.ts              — create: schemas + invoicesQuery + request schemas
  src/api/payment.test.ts         — create
  src/api/shipping.ts             — create: schemas + fulfilmentsQuery + request schemas
  src/api/shipping.test.ts        — create
  src/index.ts                    — modify: export the four new modules

apps/user-auth/src/presentation/
  user-router.test.ts             — modify: schema parsing + missing endpoint coverage
  admin-users-router.test.ts      — modify: schema parsing + usersQuery + missing endpoint coverage

apps/auction-engine/src/presentation/
  auction-router.test.ts          — modify: schema parsing + query builders

apps/payment/src/presentation/
  payment-router.test.ts          — modify: schema parsing + invoicesQuery

apps/shipping/src/presentation/
  shipping-router.test.ts         — modify: schema parsing + fulfilmentsQuery

apps/user-portal/src/
  lib/service-config.ts           — create: base URLs, REFRESH_COOKIE, DISPLAY_CURRENCY
  lib/jwt.ts                      — create: decodeJwtPayload (extracted from login-client)
  lib/auction.ts                  — create: parseLotStatus/parseLotStatusList/parseBidList/parsePlacedBid
  lib/auction.test.ts             — create
  lib/user-auth.ts                — create: parseAccessToken/parseMe/parseMessage + error extraction
  lib/user-auth.test.ts           — create
  lib/payment.ts                  — create: parseInvoice/parseCheckout/parsePaymentProfile/…
  lib/payment.test.ts             — create
  lib/shipping.ts                 — create: parseFulfilment helpers
  lib/shipping.test.ts            — create
  lib/catalogue.ts                — modify: add parseLot (single-lot parser)
  lib/catalogue.test.ts           — modify: parseLot cases
  app/api/auctions/[lotId]/bids/route.ts            — create (D2)
  app/api/payments/invoices/[id]/checkout/route.ts  — create (D4)
  app/api/auth/refresh/route.ts                     — modify (D1)
  app/api/account/invoices/[id]/route.ts            — modify (D3)
  app/api/shipping/fulfilments/[id]/address/route.ts         — modify (D5)
  app/api/shipping/fulfilments/[id]/collection-slot/route.ts — modify (D5)
  app/auctions/[auctionId]/lots/[lotId]/page.tsx             — rewrite (D7)
  app/auctions/[auctionId]/lots/[lotId]/lot-detail-client.tsx — rewrite (D7)
  app/auctions/[auctionId]/lots/[lotId]/lot-detail-client.test.tsx — create
  lib/auth-context.tsx            — modify (D1 consumer)
  app/account/login/login-client.tsx — modify
  app/account/verify-phone/page.tsx  — modify
  app/account/verify-email/verify-email-client.tsx — modify
  app/account/register-to-bid/page.tsx — modify
  app/account/invoices/[id]/page.tsx   — modify
  app/account/invoices/[id]/InvoiceDetail.tsx — modify
  app/account/fulfilments/[id]/page.tsx — modify
  app/calendar/page.tsx           — modify (D6)
  components/primitives/lot-card.tsx — modify (G5: shared DISPLAY_CURRENCY)
```

---

### Task 1: user-auth contract schemas (`shared-types/src/api/user-auth.ts`)

Covers C1, C2, C3, C4 for user-auth. Transcribed from `apps/user-auth/src/presentation/user-router.ts` and `admin-users-router.ts`.

**Files:**
- Create: `packages/shared-types/src/api/user-auth.ts`
- Create: `packages/shared-types/src/api/user-auth.test.ts`
- Modify: `packages/shared-types/src/index.ts` (add `export * from './api/user-auth';`)

**Interfaces:**
- Consumes: `envelope` from `./envelope` (Phase 1).
- Produces: `apiErrorSchema`, `stringErrorSchema`, `userStatusSchema`, `userRoleSchema`, `messageResponseSchema`, `accessTokenResponseSchema`, `meResponseSchema`, `emailLookupResponseSchema`, `identityDocumentResponseSchema`, `adminUserSummarySchema`, `adminUserDetailSchema`, `adminUserListResponseSchema`, `adminUserIdResponseSchema`, `registerRequestSchema`, `loginRequestSchema`, `verifyEmailRequestSchema`, `phoneRequestSchema`, `phoneVerifyRequestSchema`, `updateProfileRequestSchema`, `adminCreateUserRequestSchema`, `adminUpdateUserRequestSchema`, `usersQuery(params)`; types `Me`, `AdminUserSummary`, `AdminUserDetail` via `z.infer`.

- [ ] **Step 1: Write the failing test**

`packages/shared-types/src/api/user-auth.test.ts` — key cases (same style as `catalogue.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import {
  accessTokenResponseSchema,
  adminUserDetailSchema,
  meResponseSchema,
  messageResponseSchema,
  usersQuery,
} from './user-auth';

describe('user-auth contract schemas', () => {
  it('parses the login/refresh envelope', () => {
    expect(accessTokenResponseSchema.parse({ data: { accessToken: 'jwt' } }).data.accessToken).toBe('jwt');
  });

  it('rejects the imagined flat { accessToken, user } shape', () => {
    expect(accessTokenResponseSchema.safeParse({ accessToken: 'jwt', user: {} }).success).toBe(false);
  });

  it('parses GET /me with nullable phone and country', () => {
    const body = meResponseSchema.parse({
      data: { id: 'u1', email: 'a@b.c', phone: null, status: 'EMAIL_VERIFIED', role: 'BUYER', country: null },
    });
    expect(body.data.phone).toBeNull();
  });

  it('parses message envelopes', () => {
    expect(messageResponseSchema.parse({ data: { message: 'OTP sent.' } }).data.message).toBe('OTP sent.');
  });

  it('parses an admin detail row with ISO registeredAt and verification booleans', () => {
    const row = adminUserDetailSchema.parse({
      id: 'u1', email: 'a@b.c', status: 'APPROVED_BIDDER', country: 'AU',
      registeredAt: '2026-07-01T00:00:00.000Z', emailVerified: true, phoneVerified: true,
    });
    expect(row.phoneVerified).toBe(true);
  });
});

describe('usersQuery', () => {
  it('emits exactly the params the admin router reads', () => {
    expect(usersQuery({ status: 'SUSPENDED', search: 'jane' }).toString()).toBe('status=SUSPENDED&search=jane');
  });

  it('omits absent params', () => {
    expect(usersQuery({}).toString()).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @carat-room/shared-types test -- src/api/user-auth.test.ts`
Expected: FAIL — `Cannot find module './user-auth'`.

- [ ] **Step 3: Write the schema module**

`packages/shared-types/src/api/user-auth.ts`:

```ts
import { z } from 'zod';
import { envelope } from './envelope';

// Transcribed from apps/user-auth/src/presentation/{user-router,admin-users-router}.ts.
// Reality notes: GET /:id/email, GET /health and POST /identity-document are bare
// (no { data } envelope); identity-document errors are { error: string }, not
// { error: { code, message } }. Schemas record reality, they do not normalise it.

export const userStatusSchema = z.enum([
  'REGISTERED', 'EMAIL_VERIFIED', 'PHONE_VERIFIED', 'PENDING_REVIEW', 'APPROVED_BIDDER', 'SUSPENDED',
]);
export const userRoleSchema = z.enum(['BUYER', 'ADMIN']);

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export const stringErrorSchema = z.object({ error: z.string() });

export const messageResponseSchema = envelope(z.object({ message: z.string() }));
export const accessTokenResponseSchema = envelope(z.object({ accessToken: z.string() }));

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  role: userRoleSchema,
  country: z.string().nullable(),
});
export const meResponseSchema = envelope(meSchema);

export const emailLookupResponseSchema = z.object({ email: z.string() });
export const identityDocumentResponseSchema = z.object({ status: z.literal('pending_review') });

export const adminUserSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  status: userStatusSchema,
  country: z.string().nullable(),
  registeredAt: z.string(), // ISO-8601, mapped from createdAt in the admin router
});
export const adminUserDetailSchema = adminUserSummarySchema.extend({
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
});
export const adminUserListResponseSchema = envelope(z.array(adminUserSummarySchema)); // no meta
export const adminUserResponseSchema = envelope(adminUserDetailSchema);
export const adminUserIdResponseSchema = envelope(z.object({ id: z.string() }));

// Request bodies — field names are exactly what the routers destructure.
export const registerRequestSchema = z.object({
  email: z.string(),
  password: z.string(),
  country: z.string().optional(),
});
export const loginRequestSchema = z.object({ email: z.string(), password: z.string() });
export const verifyEmailRequestSchema = z.object({ userId: z.string(), code: z.string() });
export const phoneRequestSchema = z.object({ phone: z.string() });
export const phoneVerifyRequestSchema = z.object({ code: z.string() });
export const updateProfileRequestSchema = z.object({ country: z.string().optional() });
export const adminCreateUserRequestSchema = z.object({
  email: z.string(),
  password: z.string(),
  role: userRoleSchema,
  country: z.string().optional(),
});
export const adminUpdateUserRequestSchema = z.object({
  email: z.string().optional(),
  country: z.string().optional(),
});

export type Me = z.infer<typeof meSchema>;
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

/** Query builder for GET /api/users (admin list). Params are exactly what the router reads. */
export function usersQuery(params: { status?: string; search?: string }): URLSearchParams {
  const query = new URLSearchParams();
  if (params.status !== undefined) query.set('status', params.status);
  if (params.search !== undefined) query.set('search', params.search);
  return query;
}
```

Add to `packages/shared-types/src/index.ts`: `export * from './api/user-auth';`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @carat-room/shared-types test -- src/api/user-auth.test.ts`
Expected: PASS. Then `pnpm turbo build --filter=@carat-room/shared-types` — no name collisions with existing exports (if `apiErrorSchema` already exists elsewhere in the package, keep the existing one and import it here instead of redeclaring).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types
git commit -m "feat(shared-types): add user-auth API contract schemas and usersQuery builder"
```

---

### Task 2: auction-engine contract schemas (`shared-types/src/api/auction-engine.ts`)

Covers C1–C4, C13 for auction-engine. Transcribed from `apps/auction-engine/src/presentation/auction-router.ts` (`serializeLotStatus`, bid mapping). Report schemas for `/api/reports/results` and `/api/reports/unsold` already exist in `auction-reports.ts` (C13) — do not duplicate; add only the dashboard schema, which is missing.

**Files:**
- Create: `packages/shared-types/src/api/auction-engine.ts`
- Create: `packages/shared-types/src/api/auction-engine.test.ts`
- Modify: `packages/shared-types/src/index.ts`

**Interfaces:**
- Consumes: `envelope` from `./envelope`; `apiErrorSchema` from `./user-auth` (same `{ error: { code, message } }` shape service-wide — import, don't redeclare).
- Produces: `auctionLotStatusSchema`, `lotStatusResponseSchema`, `lotStatusListResponseSchema`, `auctionBidSchema`, `bidListResponseSchema`, `placeBidRequestSchema`, `placeBidResponseSchema`, `scheduleAuctionRequestSchema`, `scheduleAuctionResponseSchema`, `dashboardStatsResponseSchema`, `auctionsListQuery(params)`, `bidHistoryQuery(params)`; types `AuctionLotStatus`, `AuctionBid`.

- [ ] **Step 1: Write the failing test**

`packages/shared-types/src/api/auction-engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  auctionsListQuery,
  auctionLotStatusSchema,
  bidHistoryQuery,
  bidListResponseSchema,
  lotStatusListResponseSchema,
  placeBidResponseSchema,
} from './auction-engine';

describe('auction-engine contract schemas', () => {
  it('parses a lot status with a null highest bid (no bids yet)', () => {
    const status = auctionLotStatusSchema.parse({
      lotId: 'lot-1', status: 'LIVE', currentHighestBid: null, bidCount: 0,
      endAt: '2026-07-12T10:00:00.000Z',
    });
    expect(status.currentHighestBid).toBeNull();
  });

  it('parses the list envelope with page/total meta', () => {
    const body = lotStatusListResponseSchema.parse({
      data: [{ lotId: 'lot-1', status: 'CLOSING', currentHighestBid: 120, bidCount: 3, endAt: '2026-07-12T10:00:00.000Z' }],
      meta: { page: 1, total: 1 },
    });
    expect(body.meta.total).toBe(1);
  });

  it('parses bid history where userId is present only for admin callers', () => {
    const body = bidListResponseSchema.parse({
      data: [
        { id: 'b1', amount: 120, placedAt: '2026-07-11T09:00:00.000Z' },
        { id: 'b2', userId: 'u1', amount: 110, placedAt: '2026-07-11T08:00:00.000Z' },
      ],
      meta: { page: 1, total: 2 },
    });
    expect(body.data[0].userId).toBeUndefined();
  });

  it('parses a 201 place-bid response', () => {
    expect(placeBidResponseSchema.parse({ data: { bidId: 'b1', amount: 130, lotId: 'lot-1' } }).data.amount).toBe(130);
  });
});

describe('query builders', () => {
  it('auctionsListQuery emits exactly page and pageSize', () => {
    expect(auctionsListQuery({ page: 2, pageSize: 50 }).toString()).toBe('page=2&pageSize=50');
  });

  it('bidHistoryQuery omits absent params', () => {
    expect(bidHistoryQuery({}).toString()).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @carat-room/shared-types test -- src/api/auction-engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema module**

`packages/shared-types/src/api/auction-engine.ts`:

```ts
import { z } from 'zod';
import { envelope } from './envelope';

// Transcribed from apps/auction-engine/src/presentation/auction-router.ts
// (serializeLotStatus and the bid-history mapping). List meta is { page, total }.
// SSE stream payloads are out of contract scope by design.

export const auctionLotStatusValueSchema = z.enum([
  'SCHEDULED', 'LIVE', 'CLOSING', 'SOLD', 'UNSOLD', 'CANCELLED',
]);

export const auctionLotStatusSchema = z.object({
  lotId: z.string(),
  status: auctionLotStatusValueSchema,
  currentHighestBid: z.number().nullable(),
  bidCount: z.number(),
  endAt: z.string(), // ISO-8601 UTC
});

const pageMetaSchema = z.object({ page: z.number(), total: z.number() });

export const lotStatusResponseSchema = envelope(auctionLotStatusSchema);
export const lotStatusListResponseSchema = z.object({
  data: z.array(auctionLotStatusSchema),
  meta: pageMetaSchema,
});

export const auctionBidSchema = z.object({
  id: z.string(),
  userId: z.string().optional(), // serialised only for admin callers
  amount: z.number(),
  placedAt: z.string(), // ISO-8601 UTC
});
export const bidListResponseSchema = z.object({
  data: z.array(auctionBidSchema),
  meta: pageMetaSchema,
});

export const placeBidRequestSchema = z.object({ amount: z.number() });
export const placeBidResponseSchema = envelope(z.object({
  bidId: z.string(),
  amount: z.number(),
  lotId: z.string(),
}));

export const scheduleAuctionRequestSchema = z.object({
  lotId: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  reservePrice: z.number().optional(),
  minBidIncrement: z.number().optional(),
  autoExtendWindowMinutes: z.number().optional(),
  autoExtendDurationMinutes: z.number().optional(),
});
export const scheduleAuctionResponseSchema = envelope(z.object({ lotId: z.string() }));

export const dashboardStatsResponseSchema = envelope(z.object({
  activeAuctions: z.number(),
  endingSoon: z.number(),
}));

export type AuctionLotStatus = z.infer<typeof auctionLotStatusSchema>;
export type AuctionBid = z.infer<typeof auctionBidSchema>;

/** Query builder for GET /api/auctions. Router reads exactly page and pageSize. */
export function auctionsListQuery(params: { page?: number; pageSize?: number }): URLSearchParams {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
  return query;
}

/** Query builder for GET /api/auctions/:lotId/bids. Router reads exactly page and pageSize. */
export function bidHistoryQuery(params: { page?: number; pageSize?: number }): URLSearchParams {
  return auctionsListQuery(params);
}
```

Add to `packages/shared-types/src/index.ts`: `export * from './api/auction-engine';`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @carat-room/shared-types test -- src/api/auction-engine.test.ts`
Expected: PASS. Then build the package; if the existing `src/domain/auction.ts` exports a conflicting `LotStatus` name, keep both — the contract type is deliberately named `AuctionLotStatus` to avoid collision.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types
git commit -m "feat(shared-types): add auction-engine API contract schemas and query builders"
```

---

### Task 3: payment contract schemas (`shared-types/src/api/payment.ts`)

Covers C1–C4, C13 for payment. Transcribed from `apps/payment/src/presentation/payment-router.ts` (`toInvoiceDto` and the card-on-file endpoints). Revenue and pending-count report schemas already exist in `payment-reports.ts` (C13) — re-export, don't duplicate.

**Files:**
- Create: `packages/shared-types/src/api/payment.ts`
- Create: `packages/shared-types/src/api/payment.test.ts`
- Modify: `packages/shared-types/src/index.ts`

**Interfaces:**
- Consumes: `envelope` from `./envelope`; `stringErrorSchema` from `./user-auth`.
- Produces: `invoiceSchema`, `invoiceResponseSchema`, `invoiceListResponseSchema`, `checkoutResponseSchema`, `checkoutRequestSchema`, `extendInvoiceRequestSchema`, `setupIntentResponseSchema`, `confirmSetupIntentRequestSchema`, `confirmSetupIntentResponseSchema`, `paySavedCardResponseSchema`, `paymentProfileResponseSchema`, `invoicesQuery(params)`; types `PaymentInvoice`, `PaymentProfile`.

- [ ] **Step 1: Write the failing test**

`packages/shared-types/src/api/payment.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  invoiceResponseSchema,
  invoicesQuery,
  paymentProfileResponseSchema,
  paySavedCardResponseSchema,
  setupIntentResponseSchema,
} from './payment';

const invoiceFixture = {
  id: 'inv-1', lotId: 'lot-1', winnerUserId: 'u1', amount: 1200.5, currency: 'AUD',
  status: 'AWAITING_PAYMENT', stripeCheckoutId: null, stripePaymentIntent: null,
  dueAt: '2026-07-18T00:00:00.000Z', paidAt: null, createdAt: '2026-07-11T00:00:00.000Z',
};

describe('payment contract schemas', () => {
  it('parses an invoice envelope with nullable stripe fields and paidAt', () => {
    expect(invoiceResponseSchema.parse({ data: invoiceFixture }).data.paidAt).toBeNull();
  });

  it('rejects an invoice without the envelope', () => {
    expect(invoiceResponseSchema.safeParse(invoiceFixture).success).toBe(false);
  });

  it('parses the bare setup-intent response (documented envelope deviation)', () => {
    expect(setupIntentResponseSchema.parse({ clientSecret: 'seti_secret' }).clientSecret).toBe('seti_secret');
  });

  it('parses both payment-profile variants, discriminated on hasCard', () => {
    expect(paymentProfileResponseSchema.parse({ stripePaymentMethodId: null, hasCard: false }).hasCard).toBe(false);
    const withCard = paymentProfileResponseSchema.parse({
      stripePaymentMethodId: 'pm_1', hasCard: true, last4: '4242', brand: 'visa',
    });
    expect(withCard.hasCard === true && withCard.last4).toBe('4242');
  });

  it('parses the bare pay-saved-card success', () => {
    expect(paySavedCardResponseSchema.parse({ status: 'paid' }).status).toBe('paid');
  });
});

describe('invoicesQuery', () => {
  it('emits exactly the status param the router reads', () => {
    expect(invoicesQuery({ status: 'PAID' }).toString()).toBe('status=PAID');
    expect(invoicesQuery({}).toString()).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @carat-room/shared-types test -- src/api/payment.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema module**

`packages/shared-types/src/api/payment.ts`:

```ts
import { z } from 'zod';
import { envelope } from './envelope';

// Transcribed from apps/payment/src/presentation/payment-router.ts (toInvoiceDto).
// Reality notes — documented deviations, not to be normalised:
//   POST /setup-intent            → bare { clientSecret }
//   POST /setup-intent/confirm    → bare { ok: true }; 422 error is { error: string }
//   POST /invoices/:id/pay-saved-card → bare { status: 'paid' }; 422 error is { error: string }
//   GET  /profile                 → bare union, discriminated on hasCard
// Invoice list has NO meta (repository caps at LIMIT 100 silently).

export const invoiceStatusSchema = z.enum(['AWAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED']);

export const invoiceSchema = z.object({
  id: z.string(),
  lotId: z.string(),
  winnerUserId: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: invoiceStatusSchema,
  stripeCheckoutId: z.string().nullable(),
  stripePaymentIntent: z.string().nullable(),
  dueAt: z.string(),           // ISO-8601, non-null
  paidAt: z.string().nullable(),
  createdAt: z.string(),       // ISO-8601, non-null
});
export const invoiceResponseSchema = envelope(invoiceSchema);
export const invoiceListResponseSchema = z.object({ data: z.array(invoiceSchema) });

export const checkoutRequestSchema = z.object({ lotTitle: z.string() });
export const checkoutResponseSchema = envelope(z.object({ checkoutUrl: z.string() }));

export const extendInvoiceRequestSchema = z.object({ dueAt: z.string() });

export const setupIntentResponseSchema = z.object({ clientSecret: z.string() });
export const confirmSetupIntentRequestSchema = z.object({ setupIntentId: z.string() });
export const confirmSetupIntentResponseSchema = z.object({ ok: z.literal(true) });
export const paySavedCardResponseSchema = z.object({ status: z.literal('paid') });

export const paymentProfileResponseSchema = z.discriminatedUnion('hasCard', [
  z.object({ stripePaymentMethodId: z.null(), hasCard: z.literal(false) }),
  z.object({
    stripePaymentMethodId: z.string(),
    hasCard: z.literal(true),
    last4: z.string(),
    brand: z.string(),
  }),
]);

export type PaymentInvoice = z.infer<typeof invoiceSchema>;
export type PaymentProfile = z.infer<typeof paymentProfileResponseSchema>;

/** Query builder for GET /api/payments/invoices (admin). Router reads exactly status. */
export function invoicesQuery(params: { status?: string }): URLSearchParams {
  const query = new URLSearchParams();
  if (params.status !== undefined) query.set('status', params.status);
  return query;
}
```

Add to `packages/shared-types/src/index.ts`: `export * from './api/payment';`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @carat-room/shared-types test -- src/api/payment.test.ts`
Expected: PASS. Build the package; if `payment-reports.ts` already exports a name used here, resolve by importing from it (C13), never by renaming the report schema.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types
git commit -m "feat(shared-types): add payment API contract schemas and invoicesQuery builder"
```

---

### Task 4: shipping contract schemas (`shared-types/src/api/shipping.ts`)

Covers C1–C4, C13 for shipping. Transcribed from `apps/shipping/src/presentation/shipping-router.ts` (`toFulfilmentDto`) and `domain/fulfilment.ts`. Note: fulfilment DTOs expose **no date fields**; `collection_slots.date` is a plain string.

**Files:**
- Create: `packages/shared-types/src/api/shipping.ts`
- Create: `packages/shared-types/src/api/shipping.test.ts`
- Modify: `packages/shared-types/src/index.ts`

**Interfaces:**
- Consumes: `envelope` from `./envelope`.
- Produces: `shippingAddressSchema`, `collectionSlotSchema`, `fulfilmentSchema`, `fulfilmentResponseSchema`, `fulfilmentListResponseSchema`, `pendingCountResponseSchema`, `fulfilmentSuccessResponseSchema`, `fulfilmentIdResponseSchema`, `chooseShipRequestSchema`, `chooseCollectRequestSchema`, `fulfilmentsQuery(params)`; types `Fulfilment`, `FulfilmentShippingAddress`, `FulfilmentCollectionSlot`.

- [ ] **Step 1: Write the failing test**

`packages/shared-types/src/api/shipping.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  chooseShipRequestSchema,
  fulfilmentResponseSchema,
  fulfilmentsQuery,
  fulfilmentSuccessResponseSchema,
} from './shipping';

describe('shipping contract schemas', () => {
  it('parses a pending fulfilment with null method, address and slot', () => {
    const body = fulfilmentResponseSchema.parse({
      data: {
        id: 'f1', lotId: 'lot-1', userId: 'u1', method: null,
        status: 'PENDING_CHOICE', shippingAddress: null, collectionSlot: null,
      },
    });
    expect(body.data.method).toBeNull();
  });

  it('parses a SHIP fulfilment with nullable line2/state on the address', () => {
    const body = fulfilmentResponseSchema.parse({
      data: {
        id: 'f1', lotId: 'lot-1', userId: 'u1', method: 'SHIP', status: 'PENDING_DISPATCH',
        shippingAddress: {
          id: 'a1', fulfilmentId: 'f1', fullName: 'Jane Doe', line1: '1 Pitt St',
          line2: null, city: 'Sydney', state: null, postcode: '2000', country: 'AU',
        },
        collectionSlot: null,
      },
    });
    expect(body.data.shippingAddress?.line2).toBeNull();
  });

  it('parses the { data: { success: true } } mutation response', () => {
    expect(fulfilmentSuccessResponseSchema.parse({ data: { success: true } }).data.success).toBe(true);
  });

  it('chooseShipRequest requires exactly the fields the router validates', () => {
    expect(chooseShipRequestSchema.safeParse({ fullName: 'J', line1: '1', city: 'S', postcode: '2', country: 'AU' }).success).toBe(true);
    expect(chooseShipRequestSchema.safeParse({ fullName: 'J' }).success).toBe(false);
  });
});

describe('fulfilmentsQuery', () => {
  it('emits exactly the status param the router reads', () => {
    expect(fulfilmentsQuery({ status: 'DISPATCHED' }).toString()).toBe('status=DISPATCHED');
    expect(fulfilmentsQuery({}).toString()).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @carat-room/shared-types test -- src/api/shipping.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema module**

`packages/shared-types/src/api/shipping.ts`:

```ts
import { z } from 'zod';
import { envelope } from './envelope';

// Transcribed from apps/shipping/src/presentation/shipping-router.ts (toFulfilmentDto).
// Reality notes: no createdAt/updatedAt in any DTO; list endpoint has NO meta
// (repository caps at LIMIT 100); collection slot date is a plain string (SQL DATE).

export const fulfilmentStatusSchema = z.enum([
  'PENDING_CHOICE', 'PENDING_DISPATCH', 'DISPATCHED', 'COLLECTED',
]);
export const fulfilmentMethodSchema = z.enum(['SHIP', 'COLLECT']);

export const shippingAddressSchema = z.object({
  id: z.string(),
  fulfilmentId: z.string(),
  fullName: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  city: z.string(),
  state: z.string().nullable(),
  postcode: z.string(),
  country: z.string(),
});

export const collectionSlotSchema = z.object({
  id: z.string(),
  fulfilmentId: z.string(),
  location: z.string(),
  date: z.string(),
  timeSlot: z.string(),
});

export const fulfilmentSchema = z.object({
  id: z.string(),
  lotId: z.string(),
  userId: z.string(),
  method: fulfilmentMethodSchema.nullable(),
  status: fulfilmentStatusSchema,
  shippingAddress: shippingAddressSchema.nullable(),
  collectionSlot: collectionSlotSchema.nullable(),
});

export const fulfilmentResponseSchema = envelope(fulfilmentSchema);
export const fulfilmentListResponseSchema = z.object({ data: z.array(fulfilmentSchema) });
export const pendingCountResponseSchema = envelope(z.object({ count: z.number() }));
export const fulfilmentSuccessResponseSchema = envelope(z.object({ success: z.literal(true) }));
export const fulfilmentIdResponseSchema = envelope(z.object({ id: z.string() }));

// Request bodies — exactly the fields the router destructures and validates.
export const chooseShipRequestSchema = z.object({
  fullName: z.string(),
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  state: z.string().optional(),
  postcode: z.string(),
  country: z.string(),
});
export const chooseCollectRequestSchema = z.object({
  location: z.string(),
  date: z.string(),
  timeSlot: z.string(),
});

export type Fulfilment = z.infer<typeof fulfilmentSchema>;
export type FulfilmentShippingAddress = z.infer<typeof shippingAddressSchema>;
export type FulfilmentCollectionSlot = z.infer<typeof collectionSlotSchema>;

/** Query builder for GET /api/shipping/fulfilments (admin). Router reads exactly status. */
export function fulfilmentsQuery(params: { status?: string }): URLSearchParams {
  const query = new URLSearchParams();
  if (params.status !== undefined) query.set('status', params.status);
  return query;
}
```

Add to `packages/shared-types/src/index.ts`: `export * from './api/shipping';`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @carat-room/shared-types test -- src/api/shipping.test.ts`
Expected: PASS. Then run the whole package suite: `pnpm turbo test --filter=@carat-room/shared-types` — all four new modules green together, no export collisions from `src/index.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types
git commit -m "feat(shared-types): add shipping API contract schemas and fulfilmentsQuery builder"
```

---

### Task 5: producer enforcement — user-auth router tests

Covers C5 for user-auth. The existing tests assert single fields only and skip most endpoints; add schema parsing to every body read and cover the endpoints with no body assertions today (verify-email, refresh, logout, phone request/verify, PATCH /me, identity-document, admin GET list/detail, suspend/reinstate/approve).

**Files:**
- Modify: `apps/user-auth/src/presentation/user-router.test.ts`
- Modify: `apps/user-auth/src/presentation/admin-users-router.test.ts`

**Interfaces:**
- Consumes: all `*ResponseSchema` and `usersQuery` from Task 1 (via `@carat-room/shared-types`).
- Produces: nothing new — test-only changes; no router production code is touched.

- [ ] **Step 1: Convert existing body assertions to schema parses**

Pattern — every place the test reads a body, parse first, then assert the field. Example for login in `user-router.test.ts`:

```ts
import { accessTokenResponseSchema, apiErrorSchema, meResponseSchema, messageResponseSchema } from '@carat-room/shared-types';

// login 200
const body = accessTokenResponseSchema.parse(await res.json());
expect(body.data.accessToken).toBe('at');

// GET /me 200
const me = meResponseSchema.parse(await res.json());
expect(me.data.email).toBe('jane@example.com');
```

- [ ] **Step 2: Add tests for the uncovered endpoints**

One test per endpoint/status, same mock style as the existing file (mocked use cases, inline jwt middleware). Each parses the response through the schema:

```ts
it('POST /register 201 returns the message envelope', async () => {
  registerUser.execute.mockResolvedValue(undefined);
  const res = await app.request('/api/users/register', {
    method: 'POST',
    body: JSON.stringify({ email: 'a@b.c', password: 'pw' }),
    headers: { 'content-type': 'application/json' },
  });

  expect(res.status).toBe(201);
  messageResponseSchema.parse(await res.json());
});

it('POST /verify-email 400 returns the shared error shape on a bad token', async () => {
  verifyEmail.execute.mockRejectedValue(new Error('Invalid or expired token'));
  const res = await app.request('/api/users/verify-email', {
    method: 'POST',
    body: JSON.stringify({ userId: 'u1', code: 'nope' }),
    headers: { 'content-type': 'application/json' },
  });

  expect(res.status).toBe(400);
  expect(apiErrorSchema.parse(await res.json()).error.code).toBe('BAD_REQUEST');
});
```

Cover with the same shape: `POST /refresh` (200 → `accessTokenResponseSchema`; 401 → `apiErrorSchema`), `POST /logout` (200 → `messageResponseSchema`), `POST /phone/request` + `POST /phone/verify` (200 → `messageResponseSchema`; 400/429 → `apiErrorSchema`), `PATCH /me` (200 → `messageResponseSchema`), `POST /identity-document` (200 → `identityDocumentResponseSchema`; 400/422 → `stringErrorSchema` — this documents the bare-string deviation), `GET /:id/email` (200 → `emailLookupResponseSchema`).

- [ ] **Step 3: Admin router — schema parses + usersQuery + uncovered endpoints**

In `admin-users-router.test.ts` (this file signs real RS256 admin JWTs — keep that style):

```ts
import { adminUserListResponseSchema, adminUserResponseSchema, adminUserIdResponseSchema, usersQuery } from '@carat-room/shared-types';

it('GET / lists user summaries and honours the usersQuery builder', async () => {
  listUsers.execute.mockResolvedValue([buildUser({ status: UserStatus.SUSPENDED })]);
  const res = await app.request(`/api/users?${usersQuery({ status: 'SUSPENDED' })}`, {
    headers: { authorization: `Bearer ${adminToken}` },
  });

  expect(res.status).toBe(200);
  const body = adminUserListResponseSchema.parse(await res.json());
  expect(body.data[0].status).toBe('SUSPENDED');
  expect(listUsers.execute).toHaveBeenCalledWith({ status: 'SUSPENDED', search: undefined });
});
```

Also add: `GET /:id` (200 → `adminUserResponseSchema`), `PATCH /:id/reinstate` and `/approve` (200 → `adminUserIdResponseSchema`), and convert the existing POST `/` and PATCH `/:id` `toEqual` assertions to schema-parse-then-assert.

- [ ] **Step 4: Run the suite**

Run: `pnpm turbo test --filter=user-auth`
Expected: PASS. If a schema fails against a real response here, the schema in Task 1 was transcribed wrongly — fix the schema (reality wins), and note the correction in the commit body.

- [ ] **Step 5: Commit**

```bash
git add apps/user-auth
git commit -m "test(user-auth): enforce shared API contract schemas in router tests"
```

---

### Task 6: producer enforcement — auction-engine router tests

Covers C5 for auction-engine. The reports endpoints already parse shared schemas (Phase 1 leftovers); extend the same discipline to the auction endpoints.

**Files:**
- Modify: `apps/auction-engine/src/presentation/auction-router.test.ts`

**Interfaces:**
- Consumes: `lotStatusListResponseSchema`, `lotStatusResponseSchema`, `bidListResponseSchema`, `placeBidResponseSchema`, `scheduleAuctionResponseSchema`, `dashboardStatsResponseSchema`, `auctionsListQuery`, `bidHistoryQuery` from Task 2.

- [ ] **Step 1: Convert body reads to schema parses**

Replace every `await res.json() as {...}` in the file with a schema parse. Representative conversions:

```ts
import {
  auctionsListQuery, bidHistoryQuery, bidListResponseSchema, dashboardStatsResponseSchema,
  lotStatusListResponseSchema, lotStatusResponseSchema, placeBidResponseSchema,
} from '@carat-room/shared-types';

// GET /api/auctions — list, using the builder (C5: builder used in a real request)
const res = await router.request(`/api/auctions?${auctionsListQuery({ page: 1, pageSize: 20 })}`);
const body = lotStatusListResponseSchema.parse(await res.json());
expect(body.meta.total).toBe(1);
expect(body.data[0].currentHighestBid).toBeNull();

// GET /api/auctions/:lotId — detail
const detail = lotStatusResponseSchema.parse(await res.json());
expect(detail.data.status).toBe('LIVE');

// GET /api/auctions/:lotId/bids — non-admin: schema must PASS with userId absent
const bids = bidListResponseSchema.parse(await res.json());
expect(bids.data[0]).not.toHaveProperty('userId');

// POST /api/auctions/:lotId/bids — 201
const placed = placeBidResponseSchema.parse(await res.json());
expect(placed.data.bidId).toBe('bid-uuid');

// GET /api/reports/dashboard — previously unasserted shape
dashboardStatsResponseSchema.parse(await res.json());
```

Use `bidHistoryQuery({ page: 1, pageSize: 20 })` in at least one bids request. Error paths (`404`, `400 INVALID_AMOUNT`, `403`, `409`, `422`) parse via `apiErrorSchema`.

- [ ] **Step 2: Run the suite**

Run: `pnpm turbo test --filter=auction-engine`
Expected: PASS (PGlite globalSetup already provides the repository DB).

- [ ] **Step 3: Commit**

```bash
git add apps/auction-engine
git commit -m "test(auction-engine): enforce shared API contract schemas in router tests"
```

---

### Task 7: producer enforcement — payment router tests

Covers C5 for payment. Revenue/pending-count already parse shared report schemas; convert the rest.

**Files:**
- Modify: `apps/payment/src/presentation/payment-router.test.ts`

**Interfaces:**
- Consumes: `invoiceResponseSchema`, `invoiceListResponseSchema`, `checkoutResponseSchema`, `setupIntentResponseSchema`, `confirmSetupIntentResponseSchema`, `paySavedCardResponseSchema`, `paymentProfileResponseSchema`, `invoicesQuery` from Task 3; `stringErrorSchema` from Task 1.

- [ ] **Step 1: Convert body reads to schema parses**

```ts
import {
  checkoutResponseSchema, confirmSetupIntentResponseSchema, invoiceListResponseSchema,
  invoiceResponseSchema, invoicesQuery, paymentProfileResponseSchema,
  paySavedCardResponseSchema, setupIntentResponseSchema,
} from '@carat-room/shared-types';

// GET /api/payments/invoices — admin list via the builder
const res = await app.request(`/api/payments/invoices?${invoicesQuery({ status: 'PAID' })}`, adminAuth);
const body = invoiceListResponseSchema.parse(await res.json());
expect(body.data[0].status).toBe('PAID');

// GET /api/payments/invoices/:id
invoiceResponseSchema.parse(await res.json());

// POST /api/payments/invoices/:id/checkout
expect(checkoutResponseSchema.parse(await res.json()).data.checkoutUrl).toMatch(/^https:/);

// Bare-shape endpoints — the schema documents the deviation:
setupIntentResponseSchema.parse(await res.json());          // { clientSecret }
confirmSetupIntentResponseSchema.parse(await res.json());   // { ok: true }
paySavedCardResponseSchema.parse(await res.json());         // { status: 'paid' }
paymentProfileResponseSchema.parse(await res.json());       // hasCard union — cover BOTH variants

// 422 error branches on confirm/pay-saved-card:
expect(stringErrorSchema.parse(await res.json()).error).toBe('Card declined');
```

Also convert PATCH extend/cancel bodies to `invoiceResponseSchema.parse(...)`, and their 404/409 branches to `apiErrorSchema`.

- [ ] **Step 2: Run the suite**

Run: `pnpm turbo test --filter=payment`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/payment
git commit -m "test(payment): enforce shared API contract schemas in router tests"
```

---

### Task 8: producer enforcement — shipping router tests

Covers C5 for shipping. This file currently does no schema parsing at all.

**Files:**
- Modify: `apps/shipping/src/presentation/shipping-router.test.ts`

**Interfaces:**
- Consumes: `fulfilmentResponseSchema`, `fulfilmentListResponseSchema`, `pendingCountResponseSchema`, `fulfilmentSuccessResponseSchema`, `fulfilmentIdResponseSchema`, `fulfilmentsQuery`, `chooseShipRequestSchema` from Task 4.

- [ ] **Step 1: Convert body reads to schema parses and use the builder**

```ts
import {
  fulfilmentIdResponseSchema, fulfilmentListResponseSchema, fulfilmentResponseSchema,
  fulfilmentsQuery, fulfilmentSuccessResponseSchema, pendingCountResponseSchema,
} from '@carat-room/shared-types';

// GET /api/shipping/fulfilments — admin list via the builder
const res = await app.request(`/api/shipping/fulfilments?${fulfilmentsQuery({ status: 'PENDING_DISPATCH' })}`);
fulfilmentListResponseSchema.parse(await res.json());

// GET /api/shipping/fulfilments/:id
const body = fulfilmentResponseSchema.parse(await res.json());
expect(body.data.status).toBe('PENDING_CHOICE');

// GET /api/shipping/fulfilments/pending-count
expect(pendingCountResponseSchema.parse(await res.json()).data.count).toBe(2);

// POST choose-ship / choose-collect 200
fulfilmentSuccessResponseSchema.parse(await res.json());

// PATCH dispatch / collect 200
fulfilmentIdResponseSchema.parse(await res.json());
```

Add missing endpoint coverage: `choose-collect` (200 + 400), `dispatch`/`collect` (200 + 404 + 409 via `apiErrorSchema`), a SHIP fulfilment detail whose `shippingAddress` is populated (exercises nullable `line2`/`state`). Send choose-ship bodies built from a fixture typed `satisfies z.infer<typeof chooseShipRequestSchema>`.

- [ ] **Step 2: Run the suite**

Run: `pnpm turbo test --filter=shipping`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/shipping
git commit -m "test(shipping): enforce shared API contract schemas in router tests"
```

---

### Task 9: portal parser libraries (`lib/auction.ts`, `parseLot`, `lib/service-config.ts`)

Covers C6, C7 groundwork and G5. Mirrors the Phase 1 reference `src/lib/catalogue.ts` exactly: `safeParse` → `console.error` + fallback.

**Files:**
- Create: `apps/user-portal/src/lib/service-config.ts`
- Create: `apps/user-portal/src/lib/auction.ts`
- Create: `apps/user-portal/src/lib/auction.test.ts`
- Modify: `apps/user-portal/src/lib/catalogue.ts` (add `parseLot`)
- Modify: `apps/user-portal/src/lib/catalogue.test.ts` (add `parseLot` cases)
- Modify: `apps/user-portal/src/components/primitives/lot-card.tsx` (use `DISPLAY_CURRENCY`)

**Interfaces:**
- Consumes: `lotStatusResponseSchema`, `placeBidResponseSchema`, `AuctionLotStatus` (Task 2); `lotResponseSchema`, `CatalogueLot` (Phase 1).
- Produces: `parseLotStatus(json): AuctionLotStatus | null`, `parsePlacedBid(json): { bidId: string; amount: number; lotId: string } | null`, `parseLot(json): CatalogueLot | null`, (list/bid-history parsers are deliberately NOT built — no Phase 2 consumer exists; the portal receives bid updates via SSE. Phase 3 adds them if the admin-portal needs them — YAGNI), constants `AUCTION_ENGINE_URL`, `CATALOGUE_SERVICE_URL`, `USER_SERVICE_URL`, `PAYMENT_SERVICE_URL`, `SHIPPING_SERVICE_URL`, `REFRESH_COOKIE = 'carat_refresh'`, `DISPLAY_CURRENCY = 'AUD'`.

- [ ] **Step 1: Write `service-config.ts`**

```ts
// Single home for the portal's server-side service endpoints and shared display
// constants. Fallback hostnames match docker-compose service names where the
// portal runs in-network (auction-engine), localhost elsewhere.
export const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';
export const CATALOGUE_SERVICE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';
export const AUCTION_ENGINE_URL = process.env.AUCTION_ENGINE_URL ?? 'http://auction-engine:3003';
export const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3004';
export const SHIPPING_SERVICE_URL = process.env.SHIPPING_SERVICE_URL ?? 'http://localhost:3006';
export const ADMIN_SERVICE_URL = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3007';

/** Name of the refresh-token cookie — owned by user-auth (set on login/refresh). */
export const REFRESH_COOKIE = 'carat_refresh';

/**
 * Display-only currency label. No service owns a lot's currency today (flagged
 * as gap G5 in the Phase 2 plan) — this constant is portal copy, not data.
 */
export const DISPLAY_CURRENCY = 'AUD';
```

Replace each proxy route's inline `const X_URL = process.env… ?? …` with an import from this module as the routes are touched in later tasks (Boy Scout — same file, same commit). In `lot-card.tsx`, replace the `(currency ?? 'AUD')` literal with `(currency ?? DISPLAY_CURRENCY)`.

- [ ] **Step 2: Write the failing tests for the parsers**

`apps/user-portal/src/lib/auction.test.ts` — same structure as `catalogue.test.ts`: fixtures typed with `satisfies`, one strict-parse case and one drift case per parser:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { lotStatusResponseSchema } from '@carat-room/shared-types';
import { parseLotStatus, parsePlacedBid } from './auction';

const statusFixture = {
  lotId: 'lot-1', status: 'LIVE', currentHighestBid: 150, bidCount: 4,
  endAt: '2026-07-12T10:00:00.000Z',
} satisfies z.infer<typeof lotStatusResponseSchema>['data'];

describe('parseLotStatus', () => {
  it('parses the real { data } envelope', () => {
    expect(parseLotStatus({ data: statusFixture })?.bidCount).toBe(4);
  });

  it('returns null and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(parseLotStatus({ lot: statusFixture })).toBeNull();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('parsePlacedBid', () => {
  it('parses a 201 body', () => {
    expect(parsePlacedBid({ data: { bidId: 'b1', amount: 160, lotId: 'lot-1' } })?.bidId).toBe('b1');
  });
});
```

Add to `catalogue.test.ts`: `parseLot` parses `{ data: <lot fixture> }` and returns `null` + logs on `{ lot: … }`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm turbo test --filter=user-portal -- src/lib/auction.test.ts`
Expected: FAIL — `./auction` not found.

- [ ] **Step 4: Write `lib/auction.ts` and `parseLot`**

`apps/user-portal/src/lib/auction.ts` (pattern copied from `lib/catalogue.ts`):

```ts
import {
  type AuctionLotStatus,
  lotStatusResponseSchema, placeBidResponseSchema,
} from '@carat-room/shared-types';

// Consumer-side contract boundary for the auction-engine: every response is
// parsed through the shared schema. Drift logs and degrades to the fallback —
// pages render without live-bid data, never crash. List/bid-history parsers
// are deliberately absent: no user-portal consumer exists (updates arrive via SSE).

export function parseLotStatus(json: unknown): AuctionLotStatus | null {
  const parsed = lotStatusResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Auction lot status failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data;
}

export function parsePlacedBid(json: unknown): { bidId: string; amount: number; lotId: string } | null {
  const parsed = placeBidResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Place-bid response failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data;
}
```

In `lib/catalogue.ts`, add alongside `parseAuction`:

```ts
export function parseLot(json: unknown): CatalogueLot | null {
  const parsed = lotResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Catalogue lot failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data;
}
```

- [ ] **Step 5: Run tests, then commit**

Run: `pnpm turbo test --filter=user-portal -- src/lib/auction.test.ts src/lib/catalogue.test.ts`
Expected: PASS.

```bash
git add apps/user-portal/src/lib apps/user-portal/src/components/primitives/lot-card.tsx
git commit -m "feat(user-portal): add auction-engine contract parsers, parseLot and shared service config"
```

---

### Task 10: lot detail page — the mandated first consumer conversion (D2, D7)

Covers C6–C10. The Phase 1 plan's Known Exclusion requires this page to be Phase 2's first consumer conversion: merge the catalogue lot with the auction-engine lot status, delete the imagined `Lot` type, and route bids through a real proxy.

**Files:**
- Rewrite: `apps/user-portal/src/app/auctions/[auctionId]/lots/[lotId]/page.tsx`
- Rewrite: `apps/user-portal/src/app/auctions/[auctionId]/lots/[lotId]/lot-detail-client.tsx`
- Create: `apps/user-portal/src/app/auctions/[auctionId]/lots/[lotId]/lot-detail-client.test.tsx`
- Create: `apps/user-portal/src/app/api/auctions/[lotId]/bids/route.ts`

**Interfaces:**
- Consumes: `parseLot` (Task 9), `parseLotStatus`/`parsePlacedBid` (Task 9), `AUCTION_ENGINE_URL`/`CATALOGUE_SERVICE_URL`/`DISPLAY_CURRENCY` (Task 9), `placeBidRequestSchema` (Task 2), `primaryImageUrl`/`toLotCardProps` (Phase 1).
- Produces: `type LotDetailProps = { lot: CatalogueLot; liveStatus: AuctionLotStatus | null }` — the client component's prop contract. UI copy that referenced non-existent fields (`lotNumber`, `department`, `medium`, `dimensions`, `provenance`, `catalogueNumber`) is removed; `description` renders in place of provenance. These fields render `undefined` today, so nothing real is lost — if the business wants them, they are catalogue feature work (flag stays in Discovered Gaps).

- [ ] **Step 1: Add the bid proxy route (fixes D2)**

`apps/user-portal/src/app/api/auctions/[lotId]/bids/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { AUCTION_ENGINE_URL } from '@/lib/service-config';

export async function POST(request: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  const res = await fetch(`${AUCTION_ENGINE_URL}/api/auctions/${lotId}/bids`, {
    method: 'POST',
    headers: {
      authorization: request.headers.get('authorization') ?? '',
      'content-type': 'application/json',
    },
    body: JSON.stringify(await request.json()),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

- [ ] **Step 2: Rewrite the server page**

`page.tsx` — both fetches degrade independently; a missing catalogue lot is `notFound()`, a missing auction status renders the page without live-bid data:

```ts
import { notFound } from 'next/navigation';
import { parseLot } from '@/lib/catalogue';
import { parseLotStatus } from '@/lib/auction';
import { AUCTION_ENGINE_URL, CATALOGUE_SERVICE_URL } from '@/lib/service-config';
import { LotDetailClient } from './lot-detail-client';

export default async function LotDetailPage({ params }: { params: Promise<{ auctionId: string; lotId: string }> }) {
  const { lotId } = await params;

  const lotRes = await fetch(`${CATALOGUE_SERVICE_URL}/api/lots/${lotId}`, { cache: 'no-store' });
  if (!lotRes.ok) notFound();
  const lot = parseLot(await lotRes.json());
  if (!lot) notFound();

  let liveStatus = null;
  try {
    const statusRes = await fetch(`${AUCTION_ENGINE_URL}/api/auctions/${lotId}`, { cache: 'no-store' });
    if (statusRes.ok) liveStatus = parseLotStatus(await statusRes.json());
  } catch {
    // Auction engine unreachable — page renders without live bidding.
  }

  return <LotDetailClient lot={lot} liveStatus={liveStatus} />;
}
```

- [ ] **Step 3: Rewrite the client component against real fields**

`lot-detail-client.tsx` — delete the local `Lot` type; accept `{ lot: CatalogueLot; liveStatus: AuctionLotStatus | null }`. Field mapping (each line replaces an imagined field):

```ts
const imageUrls = [...lot.images].sort((a, b) => a.displayOrder - b.displayOrder).map((img) => img.url);
const [currentBid, setCurrentBid] = useState(liveStatus?.currentHighestBid ?? null);
const [bidCount, setBidCount] = useState(liveStatus?.bidCount ?? 0);
const [endAt, setEndAt] = useState(liveStatus?.endAt ?? null);
const [auctionStatus, setAuctionStatus] = useState(liveStatus?.status ?? 'SCHEDULED');
const estimateLabel = lot.estimatedValue !== null
  ? `${DISPLAY_CURRENCY} ${lot.estimatedValue.toLocaleString()}`
  : null;
```

Rules for the rewrite:
- All `lot.currency.toUpperCase()` call sites use `DISPLAY_CURRENCY` (G5).
- Bid maths that used `lot.currentBid` uses the `currentBid` state (nullable — a lot with no bids starts from the minimum increment, not from `undefined`).
- `<CountdownTimer endAt>` renders only when `endAt !== null`; otherwise show "Bidding not yet scheduled".
- Bid submit becomes `api.post(`/api/auctions/${lot.id}/bids`, { amount })` with the body typed `satisfies z.infer<typeof placeBidRequestSchema>`, response through `parsePlacedBid`; a `null` parse shows the existing "Unable to place bid." toast.
- SSE wiring (`useLotSse(lot.id)`) is unchanged — its `bid_placed`/`timer_extended`/`auction_closed` handlers now update the local state hooks above.
- The watchlist toggle keeps its current no-op `.catch(() => {})` (gap G3 — do not build, do not remove; add `// TODO(G3, plan 2026-07-11-api-contracts-phase-2): watchlist endpoints do not exist yet`).
- Related/up-next lot fetches already use `parseLotList` — unchanged.
- The duplicated `Lot` type in `page.tsx` is deleted with the rest.

- [ ] **Step 4: Write the component test**

`lot-detail-client.test.tsx` — fixtures typed against the real contracts (C7):

```tsx
const lotFixture = {
  id: 'lot-1', title: 'Art Deco Ring', description: 'A fine ring', auctionId: 'auc-1',
  categoryId: 'cat-1', condition: 'EXCELLENT', estimatedValue: 5000, status: 'ACTIVE',
  images: [{ id: 'img-1', lotId: 'lot-1', url: 'https://cdn/img.jpg', thumbnailUrl: 'https://cdn/t.jpg', displayOrder: 0, isPrimary: true }],
  createdBy: 'admin', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
} satisfies z.infer<typeof lotResponseSchema>['data'];

const statusFixture = {
  lotId: 'lot-1', status: 'LIVE', currentHighestBid: 5500, bidCount: 3,
  endAt: '2026-07-12T10:00:00.000Z',
} satisfies z.infer<typeof lotStatusResponseSchema>['data'];
```

Cases: (a) renders title, image, formatted current bid and bid count from the fixtures; (b) `liveStatus={null}` renders the lot without crashing and shows the not-yet-scheduled state; (c) `currentHighestBid: null` (no bids) renders without crashing. Mock `useLotSse` and `next/image` as the existing component tests do.

- [ ] **Step 5: Run, build, verify in the browser, commit**

Run: `pnpm turbo test --filter=user-portal` then `pnpm turbo build --filter=user-portal`
Expected: PASS / compiles. Per the repo lesson, drive the real flow once: `docker compose up -d`, seed a lot, open `/auctions/{id}/lots/{id}` — page renders (no `currency` crash), bid POST reaches auction-engine.

```bash
git add apps/user-portal
git commit -m "fix(user-portal): render lot detail from real catalogue and auction-engine contracts"
```

---

### Task 11: auth seams — refresh fix, login, phone, email, profile (D1)

Covers C6–C8, C10 for user-auth seams.

**Files:**
- Create: `apps/user-portal/src/lib/user-auth.ts`
- Create: `apps/user-portal/src/lib/user-auth.test.ts`
- Create: `apps/user-portal/src/lib/jwt.ts`
- Modify: `apps/user-portal/src/app/api/auth/refresh/route.ts`
- Modify: `apps/user-portal/src/lib/auth-context.tsx`
- Modify: `apps/user-portal/src/app/account/login/login-client.tsx`
- Modify: `apps/user-portal/src/app/account/verify-phone/page.tsx`
- Modify: `apps/user-portal/src/app/account/verify-email/verify-email-client.tsx`
- Modify: `apps/user-portal/src/app/account/register-to-bid/page.tsx` (identity-document + `/api/auth/me` parts only; payment parts in Task 12)

**Interfaces:**
- Consumes: `accessTokenResponseSchema`, `meResponseSchema`, `messageResponseSchema`, `apiErrorSchema`, `stringErrorSchema`, `identityDocumentResponseSchema` (Task 1); `REFRESH_COOKIE`, `USER_SERVICE_URL` (Task 9).
- Produces: `parseAccessToken(json): string | null`, `parseMe(json): Me | null`, `errorMessage(json, fallback): string` (extracts `{error:{message}}` or `{error: string}`, else fallback), `decodeJwtPayload(token): JwtPayload | null` in `lib/jwt.ts` (moved verbatim from `login-client.tsx`).

- [ ] **Step 1: Write the failing parser tests**

`lib/user-auth.test.ts` — same two-case pattern per parser as Task 9 (strict envelope parse; drifted shape → fallback + `console.error`). `errorMessage` cases: `{ error: { code: 'X', message: 'boom' } }` → `'boom'`; `{ error: 'bare boom' }` → `'bare boom'`; `{}` → fallback.

Run: `pnpm turbo test --filter=user-portal -- src/lib/user-auth.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 2: Write `lib/user-auth.ts` and `lib/jwt.ts`**

```ts
import { accessTokenResponseSchema, apiErrorSchema, type Me, meResponseSchema, stringErrorSchema } from '@carat-room/shared-types';

export function parseAccessToken(json: unknown): string | null {
  const parsed = accessTokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Access-token response failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data.accessToken;
}

export function parseMe(json: unknown): Me | null {
  const parsed = meResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Me response failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data;
}

/** Extracts a human-readable message from either service error shape. */
export function errorMessage(json: unknown, fallback: string): string {
  const structured = apiErrorSchema.safeParse(json);
  if (structured.success) return structured.data.error.message;
  const bare = stringErrorSchema.safeParse(json);
  if (bare.success) return bare.data.error;
  return fallback;
}
```

`lib/jwt.ts`: move `decodeJwtPayload` (the base64 JWT-payload decode currently inline in `login-client.tsx`) here and type its return as `JwtPayload | null` using the shared `JwtPayload` from `@carat-room/shared-auth` types (already `{ userId, email, verificationStatus, role }`).

- [ ] **Step 3: Fix the refresh proxy (D1)**

`app/api/auth/refresh/route.ts` — both bugs at once (wrong cookie name, imagined response shape):

```ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { parseAccessToken } from '@/lib/user-auth';
import { REFRESH_COOKIE, USER_SERVICE_URL } from '@/lib/service-config';

export async function GET() {
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.json({ error: 'No refresh token' }, { status: 401 });

  const res = await fetch(`${USER_SERVICE_URL}/api/users/refresh`, {
    method: 'POST',
    headers: { cookie: `${REFRESH_COOKIE}=${refreshToken}` },
  });
  if (!res.ok) return NextResponse.json({ error: 'Refresh failed' }, { status: 401 });

  const accessToken = parseAccessToken(await res.json());
  if (!accessToken) return NextResponse.json({ error: 'Refresh failed' }, { status: 401 });

  const response = NextResponse.json({ data: { accessToken } });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) response.headers.set('set-cookie', setCookie); // forward the rotated carat_refresh
  return response;
}
```

Keep the DELETE handler, switching its cookie deletion to `REFRESH_COOKIE`.

- [ ] **Step 4: Convert the client consumers**

- `auth-context.tsx`: refresh response through `parseAccessToken`; derive the user via `decodeJwtPayload(accessToken)` instead of the imagined `user` field; `null` parse → treat as logged out (current silent behaviour, now correct).
- `login-client.tsx`: login 200 through `parseAccessToken` (removes the `json.data!` non-null assert); JWT decode via `lib/jwt.ts`; error branches through `errorMessage(json, 'Sign in failed')`; register error via `errorMessage(json, 'Registration failed')`.
- `verify-phone/page.tsx`: request/verify error branches through `errorMessage`; 200 bodies through `messageResponseSchema`-backed parse (`safeParse`, success ignored — the page only needs `res.ok`, but the parse logs drift).
- `verify-email-client.tsx`: same treatment for verify-email. The resend button keeps its no-op call with `// TODO(G4, plan 2026-07-11-api-contracts-phase-2): resend endpoint does not exist yet`.
- `register-to-bid/page.tsx`: identity-document upload response through `identityDocumentResponseSchema.safeParse` (error path via `errorMessage`); the step-4 `/api/auth/me` poll through `parseMe`.

Remove every `as { … }` cast these files held (C8).

- [ ] **Step 5: Test, verify, commit**

Run: `pnpm turbo test --filter=user-portal`. Expected: PASS (update `auth-context.test.tsx` fixtures to the real `{ data: { accessToken } }` shape, typed `satisfies z.infer<typeof accessTokenResponseSchema>`).
Browser check (repo lesson — schema tests are not flow verification): log in, wait past the 15-min access-token expiry *or* delete the access token in devtools, confirm silent refresh now succeeds.

```bash
git add apps/user-portal
git commit -m "fix(user-portal): repair token refresh and parse all user-auth seams through contract schemas"
```

---

### Task 12: payment seams — invoice detail, checkout proxy, card on file (D3, D4)

Covers C6–C8, C10 for payment seams.

**Files:**
- Create: `apps/user-portal/src/lib/payment.ts`
- Create: `apps/user-portal/src/lib/payment.test.ts`
- Create: `apps/user-portal/src/app/api/payments/invoices/[id]/checkout/route.ts`
- Modify: `apps/user-portal/src/app/api/account/invoices/[id]/route.ts`
- Modify: `apps/user-portal/src/app/account/invoices/[id]/page.tsx`
- Modify: `apps/user-portal/src/app/account/invoices/[id]/InvoiceDetail.tsx`
- Modify: `apps/user-portal/src/app/account/register-to-bid/page.tsx` (setup-intent + profile parts)

**Interfaces:**
- Consumes: `invoiceResponseSchema`, `checkoutResponseSchema`, `setupIntentResponseSchema`, `paySavedCardResponseSchema`, `paymentProfileResponseSchema`, `confirmSetupIntentRequestSchema`, `checkoutRequestSchema`, `PaymentInvoice`, `PaymentProfile` (Task 3); `errorMessage` (Task 11); `PAYMENT_SERVICE_URL` (Task 9).
- Produces: `parseInvoice(json): PaymentInvoice | null`, `parseCheckout(json): string | null` (the URL), `parseSetupIntent(json): string | null` (the client secret), `parsePaymentProfile(json): PaymentProfile | null`, `parsePaySavedCard(json): boolean`.

- [ ] **Step 1: Failing parser tests, then `lib/payment.ts`**

Same two-case pattern per parser; fixtures `satisfies z.infer<…>`. `parsePaySavedCard` returns `true` only for `{ status: 'paid' }`, `false` (plus `console.error`) otherwise — note the bare shapes are documented deviations, so `parseSetupIntent` and `parsePaymentProfile` parse WITHOUT an envelope.

Run: `pnpm turbo test --filter=user-portal -- src/lib/payment.test.ts` — FAIL, then implement, then PASS.

- [ ] **Step 2: Fix the invoice proxy path (D3) and add the checkout proxy (D4)**

`app/api/account/invoices/[id]/route.ts`: downstream URL becomes `${PAYMENT_SERVICE_URL}/api/payments/invoices/${id}` (was `/api/invoices/${id}`), still forwarding `authorization`, adding `cache: 'no-store'`.

`app/api/payments/invoices/[id]/checkout/route.ts` (new, same shape as the existing `pay-saved-card` route):

```ts
import { NextResponse } from 'next/server';
import { PAYMENT_SERVICE_URL } from '@/lib/service-config';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/invoices/${id}/checkout`, {
    method: 'POST',
    headers: {
      authorization: request.headers.get('authorization') ?? '',
      'content-type': 'application/json',
    },
    body: JSON.stringify(await request.json()),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

- [ ] **Step 3: Convert the consumers**

- `account/invoices/[id]/page.tsx`: SWR fetcher parses through `parseInvoice`; delete the local `Invoice` interface in favour of `PaymentInvoice`; `null` parse → the existing error/empty state. `pay-saved-card` response through `parsePaySavedCard`, failure message via `errorMessage(json, 'Payment failed. Please try again.')`.
- `InvoiceDetail.tsx`: delete its duplicate `Invoice` interface (use `PaymentInvoice`); checkout call sends a body typed `satisfies z.infer<typeof checkoutRequestSchema>` and reads the redirect URL through `parseCheckout`; `null` → error string, no redirect to `undefined`.
- `register-to-bid/page.tsx`: setup-intent response through `parseSetupIntent`; confirm body typed against `confirmSetupIntentRequestSchema`.
- `lot-detail-client.tsx` (from Task 10): its `/api/payments/profile` read switches to `parsePaymentProfile` — do it here where the parser lands, one-line follow-up.

Remove every payment `as { … }` cast (C8).

- [ ] **Step 4: Test, verify, commit**

Run: `pnpm turbo test --filter=user-portal`. Browser check: open an invoice, click "Pay now", confirm the Stripe Checkout redirect happens (D3+D4 were both dead ends before).

```bash
git add apps/user-portal
git commit -m "fix(user-portal): route invoice and checkout through real payment paths with contract parsing"
```

---

### Task 13: shipping seams — proxy paths and fulfilment forms (D5)

Covers C6–C8, C10 for shipping seams.

**Files:**
- Create: `apps/user-portal/src/lib/shipping.ts`
- Create: `apps/user-portal/src/lib/shipping.test.ts`
- Modify: `apps/user-portal/src/app/api/shipping/fulfilments/[id]/address/route.ts`
- Modify: `apps/user-portal/src/app/api/shipping/fulfilments/[id]/collection-slot/route.ts`
- Modify: `apps/user-portal/src/app/account/fulfilments/[id]/page.tsx`

**Interfaces:**
- Consumes: `fulfilmentResponseSchema`, `fulfilmentSuccessResponseSchema`, `chooseShipRequestSchema`, `chooseCollectRequestSchema`, `Fulfilment` (Task 4); `errorMessage` (Task 11); `SHIPPING_SERVICE_URL` (Task 9).
- Produces: `parseFulfilment(json): Fulfilment | null`, `parseFulfilmentSuccess(json): boolean`.

- [ ] **Step 1: Failing parser tests, then `lib/shipping.ts`**

Same pattern as Tasks 9/11/12. Run the file's tests: FAIL → implement → PASS.

- [ ] **Step 2: Point the proxies at the real downstream paths (D5)**

- `…/address/route.ts`: downstream becomes `${SHIPPING_SERVICE_URL}/api/shipping/fulfilments/${id}/choose-ship`.
- `…/collection-slot/route.ts`: downstream becomes `${SHIPPING_SERVICE_URL}/api/shipping/fulfilments/${id}/choose-collect`.

Keep the portal-facing route filenames (`address`, `collection-slot`) — the page already posts to them; only the downstream target was wrong.

- [ ] **Step 3: Align the form payloads with the request schemas**

`account/fulfilments/[id]/page.tsx`: before sending, build the body through the shared request schema so field-name drift is a compile/test error:

```ts
const payload = chooseShipRequestSchema.parse({
  fullName: values.fullName, line1: values.line1, line2: values.line2 || undefined,
  city: values.city, state: values.state || undefined, postcode: values.postcode, country: values.country,
});
```

Same for `chooseCollectRequestSchema` (`location`, `date`, `timeSlot`). If the page's zod form schema uses different field names than the request schema, rename the form fields to match (the router's names win). Success responses through `parseFulfilmentSuccess`; failures through `errorMessage(json, 'Unable to save your choice.')` instead of a bare `res.ok` toast.

- [ ] **Step 4: Test, verify, commit**

Run: `pnpm turbo test --filter=user-portal`. Browser check: choose shipping on a fulfilment, confirm the shipping service persists the address (was a 404 before).

```bash
git add apps/user-portal
git commit -m "fix(user-portal): call real shipping choose-ship/choose-collect paths with contract parsing"
```

---

### Task 14: calendar page — missed Phase 1 catalogue seam (D6)

Covers C6–C8 for the last unconverted catalogue consumer (Boy Scout; discovered while surveying, fits this plan because it is a one-file consumer conversion using an existing Phase 1 parser).

**Files:**
- Modify: `apps/user-portal/src/app/calendar/page.tsx`
- Test: co-located `calendar/page.test.tsx` (create)

**Interfaces:**
- Consumes: `parseAuctionList` from `@/lib/catalogue` (Phase 1).

- [ ] **Step 1: Write the failing test**

`page.test.tsx`: mock `useSWR` to return a real `{ data: [auction fixture], meta: { total: 1 } }` envelope (fixture `satisfies z.infer<typeof auctionListResponseSchema>['data'][number]`); assert the auction title renders. Second case: drifted shape renders the empty state without crashing.

Run: `pnpm turbo test --filter=user-portal -- src/app/calendar` — Expected: FAIL (page currently reads `data?.auctions`, so the title never renders).

- [ ] **Step 2: Convert the page**

Replace `useSWR<{ auctions: Auction[] }>` with the reference pattern from `browse-client.tsx`, building the query through the Phase 1 builder (spec: portals construct catalogue URLs exclusively through builders):

```ts
const { data } = useSWR<unknown>(`/api/catalogue/auctions?${auctionsQuery({ limit: 50 })}`, fetcher);
const auctions = data === undefined ? [] : parseAuctionList(data);
```

(`auctionsQuery` is the existing catalogue builder from `@carat-room/shared-types` — check its exact parameter names in `packages/shared-types/src/api/catalogue.ts` before use; if `limit` is not among them, the hand-written `?limit=50` was itself param drift and the builder's real names win.)

Delete the local `Auction` inline type in favour of the shared inferred type.

- [ ] **Step 3: Run, commit**

Run: `pnpm turbo test --filter=user-portal` — PASS.

```bash
git add apps/user-portal/src/app/calendar
git commit -m "fix(user-portal): parse calendar auctions through the shared catalogue contract"
```

---

### Task 15: whole-repo verification, drift smoke check, bookkeeping

Covers C11 and closes the plan.

**Files:**
- Modify: `docs/superpowers/SESSION-SUMMARY.md` (status update)
- Modify: `docs/superpowers/plans/2026-07-11-api-contracts-phase-2.md` (tick remaining checkboxes)

- [ ] **Step 1: Full fast suite and lint**

Run: `pnpm turbo test` and `pnpm lint`
Expected: everything green with no Docker running (the PGlite global setups cover the repository tests). Lint must show no new layer violations and no additions to the legacy-debt block.

- [ ] **Step 2: Deliberate-drift smoke check (C11 — manual, NOT committed)**

In `apps/auction-engine/src/presentation/auction-router.ts`, temporarily rename the serialised field `currentHighestBid` to `highestBid`.

Run: `pnpm turbo test --filter=auction-engine --filter=user-portal`
Expected: auction-engine router tests FAIL on `lotStatusListResponseSchema.parse` (producer side), and user-portal `auction.test.ts` drift cases still pass (consumer degrades, never crashes). Revert the rename:

```bash
git checkout -- apps/auction-engine/src/presentation/auction-router.ts
```

Repeat once on the consumer side: in `apps/user-portal/src/lib/auction.test.ts`, temporarily change a fixture field name and confirm the `satisfies` annotation fails compilation (`pnpm turbo build --filter=user-portal`). Revert.

- [ ] **Step 3: Integration suite (Docker) — optional but recommended before merging**

```bash
docker compose -f docker-compose.test.yml up -d --build
pnpm run test:integration
docker compose -f docker-compose.test.yml down -v
```

Expected: PASS — proves the D1–D5 proxy fixes against real services, not mocks.

- [ ] **Step 4: Bookkeeping and final commit**

Update `docs/superpowers/SESSION-SUMMARY.md`: Phase 2 complete; Phase 3 (admin) and Phase 4 (user-auth PGlite) pending; gaps G1–G5 listed as candidate future plans. Tick all checkboxes in this plan.

```bash
git add docs/superpowers
git commit -m "chore: mark all plan api-contracts-phase-2 tasks complete"
```

---

## Task Dependency Order

Tasks 1–4 (schemas) are independent of each other and may run in any order or parallel worktrees. Tasks 5–8 each depend only on their service's schema task (5←1, 6←2, 7←3, 8←4). Task 9 depends on 2; Task 10 on 9 (and is the **first consumer conversion** — no other consumer task may start before it, per the Phase 1 mandate); Task 11 on 1+9; Task 12 on 3+9+11 (`errorMessage`); Task 13 on 4+9+11; Task 14 is independent (Phase 1 parsers); Task 15 last.

## Out of Scope (restated)

- Admin-portal consumer conversion — Phase 3 plan.
- Moving user-auth repository tests onto `@carat-room/test-db` (they currently hand-roll schema that already drifts from the migration) — Phase 4 plan; drift noted here so Phase 4 picks it up.
- Building the missing endpoints behind gaps G1–G4 and deciding currency ownership (G5) — separate feature plans.
- Normalising the documented envelope deviations (bare responses, bare-string errors in user-auth identity-document and payment card endpoints) — spec non-goal ("schemas document reality"); each deviation is marked with a comment in its schema module for a future normalisation plan.
