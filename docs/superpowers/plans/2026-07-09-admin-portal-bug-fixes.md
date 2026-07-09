# Admin-Portal Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five admin-portal defects in `docs/bugs-report.md`: broken lot creation, missing user create/edit, missing category creation entry point, always-failing auction date validation, and a crashing Reports page whose backend endpoints were never implemented.

**Architecture:** Frontend-only fixes for lots, categories and auction dates. User create/edit adds two use cases + routes to the User Service (`apps/user-auth`), proxy routes in the Admin Service, and forms in the admin portal. Reports adds read-model query endpoints to the Auction Engine and Payment Service, rewires the Admin Service reports router to aggregate/enrich across services (same pattern as `invoices-router`), and hardens the Reports page fetcher.

**Tech Stack:** Next.js App Router server actions, Zod 3.25, Hono, postgres (tagged-template `Db`), Vitest.

## Global Constraints

- British English in all copy and comments ("authorise", "cancelled", "fulfilment").
- Named exports only; no `export default` except Next.js `page.tsx`/`layout.tsx` files (framework requirement).
- Single quotes; TypeScript strict; no `@ts-ignore`; boolean names prefixed `is/has/can/should/was/will`.
- Test files co-located next to sources, named `<filename>.test.ts`. No `__tests__` directories.
- Clean Architecture layering in services: SQL only in `infrastructure/`, business rules in `domain/`, routers depend on injected use cases.
- Response envelope for all service endpoints: `{ data }` on success, `{ error: { code, message } }` on failure.
- Forms must render an error slot for **every** schema field plus a general server-error message (Lesson).
- Every fetch wrapper checks `res.ok` before trusting the body shape (Lesson).
- No new DB migrations are required by this plan; do not add any without mirroring `tests/db-init/init.sql` (Lesson).

## Upstream context — rebased onto `origin/main` @ `b0249dd` (2026-07-09)

Branch: `fix/admin-portal-bug-fixes`. PR #3 (API contracts phase 1) merged upstream and provides infrastructure this plan MUST use:

- **`@carat-room/shared-types` now exports API contract schemas** (`packages/shared-types/src/api/catalogue.ts`, `envelope.ts`): `categorySchema`, `categoryListResponseSchema`, `catalogueLotSchema`, `envelope`/`listEnvelope` helpers. New frontend consumers parse responses through these instead of hand-rolled interfaces; **new backend endpoints added by this plan get their own schema module in `packages/shared-types/src/api/` and router tests that assert against it** (follow `apps/catalogue/src/presentation/catalogue-router.test.ts`).
- **`@carat-room/test-db`** boots an embedded PGlite Postgres and applies the service's real `migrations/*.sql`. New repository tests in Tasks 9, 10, 19 and 20 use it (follow `apps/catalogue/vitest.global-setup.ts` + the converted catalogue repository tests) instead of fake-Db stubs — this catches column-name drift that string-assertion tests cannot.
- **Contract facts these schemas revealed (both verified against catalogue source):**
  - `GET /api/categories` returns a **flat array** `{ id, name, slug, parentId, displayOrder }` — there is **no `children` field**. The admin categories page's tree-shaped interface is wrong and crashes on nested data; Tasks 2–3 build the tree client-side from `parentId`.
  - `LotCondition` is `NEW | EXCELLENT | VERY_GOOD | GOOD` — **`FAIR` does not exist**. Both admin lot forms currently offer FAIR (rejected by the catalogue router's condition validation) and omit NEW; Task 2 fixes the form options and `lot.schema.ts`.
- The user-portal↔catalogue side of the contract gap was fixed upstream by PR #3; the remaining rollout (other services + event payloads) stays in `docs/draft-task-list.md`.

---

## Coverage Checklist (from docs/bugs-report.md + root-cause diagnosis)

Bug 1 — Lots: can't create a new lot
- [ ] C1.1 Category chosen from a dropdown populated from `/admin/api/categories` (not a free-text UUID input) — Task 2
- [ ] C1.2 Validation errors rendered for description, categoryId, condition, estimatedValue (not only title) — Task 2
- [ ] C1.3 Backend/server error (`state.error`) rendered as a general form message — Task 2
- [ ] C1.4 Same fixes applied to the edit-lot form (same defects) — Task 2
- [ ] C1.5 Condition options match the catalogue contract (`NEW/EXCELLENT/VERY_GOOD/GOOD` — FAIR removed, NEW added) in both forms and `lot.schema.ts` — Task 2

Bug 2 — Users: no create button, can't edit (scope decision: full create + edit)
- [ ] C2.1 Domain: `User.changeEmail()` method — Task 4
- [ ] C2.2 User Service: `AdminCreateUserUseCase` (email, password, role, optional country; email-uniqueness; publishes `user.registered`) — Task 4
- [ ] C2.3 User Service: `AdminUpdateUserUseCase` (email and/or country; email-uniqueness) — Task 4
- [ ] C2.4 User Service routes: `POST /api/users` and `PATCH /api/users/:id` (admin-only) — Task 5
- [ ] C2.5 Admin Service proxy routes: `POST /admin/api/users`, `PATCH /admin/api/users/:id` — Task 6
- [ ] C2.6 Portal: "New User" button on users list + `/admin/users/new` form (all error slots) — Task 7
- [ ] C2.7 Portal: edit form (email, country) on user detail page — Task 8

Bug 3 — Categories: no button to create a category
- [ ] C3.1 Root-level "New Category" button + inline name/slug form, usable when the tree is empty — Task 3
- [ ] C3.2 `createCategory` failures surfaced to the user (currently swallowed) — Task 3
- [ ] C3.3 Categories page consumes the real **flat** contract (`categoryListResponseSchema`) and builds the tree from `parentId` — the current `children`-shaped interface crashes on nested data — Task 3

Bug 4 — Auctions: "invalid start date and end date"
- [ ] C4.1 Schedule/reschedule schemas accept `datetime-local` values (`2026-07-09T14:30`) and transform to full ISO — Task 1
- [ ] C4.2 Schema unit tests use a real `datetime-local` sample value — Task 1
- [ ] C4.3 End-after-start refinement still enforced — Task 1

Bug 5 — Reports: errors when clicking the reports menu
- [ ] C5.1 Auction Engine: `GET /api/reports/results?from&to` over `lot_status` (SOLD/UNSOLD in range) — Task 9
- [ ] C5.2 Auction Engine: `GET /api/reports/unsold` (status UNSOLD) — Task 9
- [ ] C5.3 Payment Service: `GET /api/payments/reports/revenue` (paid invoices summed by currency) — Task 10
- [ ] C5.4 Admin Service reports router aggregates with the correct clients and paths; enriches lotTitle/categoryName/winnerEmail; computes results summary — Task 11
- [ ] C5.5 `main.ts` passes `{ auction, payment, catalogue, user }` to the reports router — Task 11
- [ ] C5.6 Reports page fetcher checks `res.ok`; SWR error state rendered; shape guards on `data.data` — Task 12
- [ ] C5.7 Unsold tab drops the Reserve column (reserve price is deliberately never stored in the read model — spec deviation, noted) and tolerates null `highestBid` — Task 12

Flow audit — latent defects found in the same functional chain (not in the bug report, but they block "schedule and manage an auction" end-to-end)
- [ ] C7.1 Auctions list shows lot titles and current bids (engine returns `currentHighestBid` and no title; table renders `lotTitle`/`currentBid` → blank/— today) — Task 14
- [ ] C7.2 Auction detail page no longer crashes (`auction.bids` is undefined; engine detail response has no `bids`) and live stats show the real current bid — Task 14
- [ ] C7.3 Schedule Auction works without a `?lotId=` query param: lot picker on the form + rendered `lotId` error (today the header button's path fails silently) — Task 15
- [ ] C7.4 Admins can see bidder user ids in bid history via an authorised path (engine deliberately omits `userId` publicly) — Task 14

Event backbone + deployment (full-functionality audit — blockers: invoices and fulfilments are never created today)
- [ ] C8.1 `EventSubscriber.subscribe` requires a routing key (optional binding was the root cause of dead consumers) — Task 16
- [ ] C8.2 Payment consumer bound to `auction.closed` with queue name `payment.auction.closed`; shipping consumer bound to `payment.received` with queue name `shipping.payment.received` — Task 16
- [ ] C8.3 `infra/rabbitmq/definitions.json` exchange corrected `platform.events` → `carat.events` — Task 16
- [ ] C8.4 Auction engine publishes `auction.closed`, `auction.bid.placed`, `auction.closing.soon` payloads typed against `@carat-room/shared-types` (adds `highestAmount`, `highestBidId`, `closedAt`, `previousHighestBidderId`, `placedAt`, `activeBidderIds`) — Task 17
- [ ] C8.5 Payment consumer reads the shared `AuctionClosedPayload` and applies the platform default currency **AUD** (`DEFAULT_CURRENCY` env, fallback `'AUD'`) — Task 17
- [ ] C8.6 Shipping service reads `RABBITMQ_URL` (not `AMQP_URL`); compose gives shipping `JWT_PUBLIC_KEY` — Task 18
- [ ] C8.7 Admin service reads `AUCTION_ENGINE_URL` with fallback `http://auction-engine:3003` (compose name); compose gives admin-service `RABBITMQ_URL`, `ADMIN_DATABASE_URL` — Task 18

Small-issue fixes promoted to "now" (user decision 2026-07-09)
- [ ] C9.1 `valuation_enquiries` table actually exists (blocker found during scoping: no DDL anywhere — public submissions crash) + mirrored into `tests/db-init/init.sql` — Task 19
- [ ] C9.2 Enquiries admin: list/detail/status endpoints in the admin service (statuses NEW / RESPONDED / CLOSED) — Task 19
- [ ] C9.3 Enquiries admin UI: `/admin/enquiries` page + sidebar entry — Task 19
- [ ] C9.4 Payment: pending-invoice count endpoint; Shipping: pending-fulfilment count endpoint — Task 20
- [ ] C9.5 Dashboard aggregation moves to the admin service (engine reports only what it owns); portal shows '—' for a count whose service is down instead of a fake 0 — Task 20

Cross-cutting
- [ ] C6.1 Browser-drive every fixed flow before completion (Lesson: schema tests are not verification) — Task 13 (runs LAST, after Tasks 14–20)
- [ ] C6.2 Tick off `docs/bugs-report.md` items and commit — Task 13
- [ ] C6.3 Known issue recorded, not fixed here: dashboard `pendingInvoices`/`pendingFulfilments` are hard-coded to 0 in `get-dashboard-stats` (needs payment/shipping count endpoints — raise as its own piece of work)

---

### Task 1: Fix auction date validation (frontend schema)

**Files:**
- Modify: `apps/admin-portal/src/lib/schemas/auction.schema.ts`
- Test: `apps/admin-portal/src/lib/schemas/auction.schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ScheduleAuctionSchema`, `RescheduleAuctionSchema` whose parsed `startAt`/`endAt` are full ISO strings (`.toISOString()` output) regardless of input format. `apps/admin-portal/src/app/admin/auctions/_actions.ts` keeps working unchanged.

**Root cause recap:** `<input type='datetime-local'>` submits `2026-07-09T14:30` (no seconds/timezone); `z.string().datetime()` rejects it, so every submission fails with "Invalid start date"/"Invalid end date". The auction engine accepts any `Date`-parseable string, so the fix is frontend-only.

- [ ] **Step 1: Write failing tests**

Add to `apps/admin-portal/src/lib/schemas/auction.schema.test.ts` (keep existing tests):

```ts
describe('ScheduleAuctionSchema — datetime-local input', () => {
  const base = {
    lotId: '3b8f4a2e-9c1d-4e5f-8a7b-6c5d4e3f2a1b',
    reservePrice: 100,
    minBidIncrement: 10,
    autoExtendWindowMinutes: 3,
    autoExtendDurationMinutes: 3,
  };

  it('accepts the exact format a datetime-local input emits and outputs full ISO', () => {
    const result = ScheduleAuctionSchema.safeParse({
      ...base,
      startAt: '2026-07-09T14:30',
      endAt: '2026-07-10T14:30',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startAt).toBe(new Date('2026-07-09T14:30').toISOString());
      expect(result.data.endAt).toBe(new Date('2026-07-10T14:30').toISOString());
    }
  });

  it('still accepts full ISO strings', () => {
    const result = ScheduleAuctionSchema.safeParse({
      ...base,
      startAt: '2026-07-09T14:30:00.000Z',
      endAt: '2026-07-10T14:30:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unparseable date', () => {
    const result = ScheduleAuctionSchema.safeParse({
      ...base,
      startAt: 'not-a-date',
      endAt: '2026-07-10T14:30',
    });
    expect(result.success).toBe(false);
  });

  it('rejects end before start (datetime-local format)', () => {
    const result = ScheduleAuctionSchema.safeParse({
      ...base,
      startAt: '2026-07-10T14:30',
      endAt: '2026-07-09T14:30',
    });
    expect(result.success).toBe(false);
  });
});

describe('RescheduleAuctionSchema — datetime-local input', () => {
  it('accepts datetime-local values', () => {
    const result = RescheduleAuctionSchema.safeParse({
      startAt: '2026-07-09T09:00',
      endAt: '2026-07-09T18:00',
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm turbo test --filter=admin-portal -- auction.schema`
Expected: new tests FAIL ("Invalid start date"), pre-existing tests pass.

- [ ] **Step 3: Implement the schema fix**

Replace the contents of `apps/admin-portal/src/lib/schemas/auction.schema.ts`:

```ts
import { z } from 'zod';

// <input type='datetime-local'> emits e.g. '2026-07-09T14:30' — no seconds, no
// timezone — which z.string().datetime() rejects. Accept anything Date-parseable
// and normalise to full ISO so downstream services receive one canonical format.
const IsoFromLocalDateTime = (message: string) =>
  z
    .string()
    .min(1, message)
    .refine(value => !Number.isNaN(Date.parse(value)), message)
    .transform(value => new Date(value).toISOString());

export const ScheduleAuctionSchema = z
  .object({
    lotId: z.string().uuid('Select a lot'),
    startAt: IsoFromLocalDateTime('Invalid start date'),
    endAt: IsoFromLocalDateTime('Invalid end date'),
    reservePrice: z.number({ invalid_type_error: 'Enter a number' }).nonnegative('Cannot be negative'),
    minBidIncrement: z.number({ invalid_type_error: 'Enter a number' }).positive('Must be positive'),
    autoExtendWindowMinutes: z.number({ invalid_type_error: 'Enter a number' }).int().positive('Must be positive'),
    autoExtendDurationMinutes: z.number({ invalid_type_error: 'Enter a number' }).int().positive('Must be positive'),
  })
  .refine(data => new Date(data.endAt) > new Date(data.startAt), {
    message: 'End date must be after start date',
    path: ['endAt'],
  });

export const RescheduleAuctionSchema = z
  .object({
    startAt: IsoFromLocalDateTime('Invalid start date'),
    endAt: IsoFromLocalDateTime('Invalid end date'),
  })
  .refine(data => new Date(data.endAt) > new Date(data.startAt), {
    message: 'End date must be after start date',
    path: ['endAt'],
  });

export type ScheduleAuctionValues = z.infer<typeof ScheduleAuctionSchema>;
export type RescheduleAuctionValues = z.infer<typeof RescheduleAuctionSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm turbo test --filter=admin-portal -- auction.schema`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/lib/schemas/auction.schema.ts apps/admin-portal/src/lib/schemas/auction.schema.test.ts
git commit -m "fix(admin-portal): accept datetime-local values when scheduling auctions"
```

---

### Task 2: Lot forms — category dropdown + render every error

**Files:**
- Create: `apps/admin-portal/src/lib/categories.ts`
- Create: `apps/admin-portal/src/lib/categories.test.ts`
- Create: `apps/admin-portal/src/app/admin/lots/new/_new-lot-form.tsx`
- Modify: `apps/admin-portal/src/app/admin/lots/new/page.tsx` (becomes a server component that fetches categories)
- Modify: `apps/admin-portal/src/app/admin/lots/[id]/_edit-form.tsx`
- Modify: `apps/admin-portal/src/app/admin/lots/[id]/page.tsx` (pass categories to the edit form)

**Interfaces:**
- Consumes: `GET /admin/api/categories` which returns the catalogue's **flat** category list — parse it with `categoryListResponseSchema` from `@carat-room/shared-types` (`FlatCategory = { id: string; name: string; slug: string; parentId: string | null; displayOrder: number }`); server actions `createLot`/`updateLot` from `apps/admin-portal/src/app/admin/lots/_actions.ts` (unchanged).
- Produces (exported from `apps/admin-portal/src/lib/categories.ts`, reused by Task 3):
  - `categoryOptions(flat: FlatCategory[]): CategoryOption[]` where `CategoryOption = { id: string; label: string }` (label is the `'Parent / Child'` breadcrumb built by following `parentId`).
  - `buildCategoryTree(flat: FlatCategory[]): CategoryTreeNode[]` where `CategoryTreeNode = FlatCategory & { children: CategoryTreeNode[] }` (ordered by `displayOrder`).

- [ ] **Step 1: Write failing tests for the category helpers**

Create `apps/admin-portal/src/lib/categories.test.ts` (input is the catalogue's real **flat** shape):

```ts
import { describe, expect, it } from 'vitest';
import { buildCategoryTree, categoryOptions, type FlatCategory } from './categories';

const flat: FlatCategory[] = [
  { id: 'a', name: 'Jewellery', slug: 'jewellery', parentId: null, displayOrder: 1 },
  { id: 'b', name: 'Rings', slug: 'rings', parentId: 'a', displayOrder: 1 },
  { id: 'c', name: 'Bags', slug: 'bags', parentId: null, displayOrder: 2 },
];

describe('categoryOptions', () => {
  it('produces breadcrumb labels depth-first in displayOrder', () => {
    expect(categoryOptions(flat)).toEqual([
      { id: 'a', label: 'Jewellery' },
      { id: 'b', label: 'Jewellery / Rings' },
      { id: 'c', label: 'Bags' },
    ]);
  });

  it('returns an empty array for an empty list', () => {
    expect(categoryOptions([])).toEqual([]);
  });
});

describe('buildCategoryTree', () => {
  it('nests children under their parent ordered by displayOrder', () => {
    const tree = buildCategoryTree(flat);
    expect(tree.map(n => n.id)).toEqual(['a', 'c']);
    expect(tree[0].children.map(n => n.id)).toEqual(['b']);
    expect(tree[1].children).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm turbo test --filter=admin-portal -- categories`
Expected: FAIL — module `./categories` not found.

- [ ] **Step 3: Implement the helpers**

Create `apps/admin-portal/src/lib/categories.ts` (types derive from the shared contract schema — Lesson: declare a service's response types once):

```ts
import { z } from 'zod';
import { categorySchema } from '@carat-room/shared-types';

export type FlatCategory = z.infer<typeof categorySchema>;

export interface CategoryTreeNode extends FlatCategory {
  children: CategoryTreeNode[];
}

export interface CategoryOption {
  id: string;
  label: string;
}

export function buildCategoryTree(flat: FlatCategory[]): CategoryTreeNode[] {
  const nodes = new Map<string, CategoryTreeNode>(
    flat.map(category => [category.id, { ...category, children: [] }]),
  );
  const roots: CategoryTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const byDisplayOrder = (a: CategoryTreeNode, b: CategoryTreeNode) => a.displayOrder - b.displayOrder;
  for (const node of nodes.values()) node.children.sort(byDisplayOrder);
  return roots.sort(byDisplayOrder);
}

export function categoryOptions(flat: FlatCategory[]): CategoryOption[] {
  const walk = (nodes: CategoryTreeNode[], prefix: string): CategoryOption[] =>
    nodes.flatMap(node => {
      const label = prefix ? `${prefix} / ${node.name}` : node.name;
      return [{ id: node.id, label }, ...walk(node.children, label)];
    });
  return walk(buildCategoryTree(flat), '');
}
```

(Verify `categorySchema` is exported from the package root `@carat-room/shared-types` — it is re-exported via `packages/shared-types/src/index.ts`; if only the sub-path is exported, import from the documented public entry point.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm turbo test --filter=admin-portal -- categories`
Expected: PASS.

- [ ] **Step 5: Extract the new-lot form into a client component with full error rendering**

Create `apps/admin-portal/src/app/admin/lots/new/_new-lot-form.tsx` (content moved from the current `page.tsx`, with a category `Select`, an error line under every field, and a general server-error message):

```tsx
'use client';

import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createLot } from '../_actions';
import type { CategoryOption } from '@/lib/categories';

// Must match the catalogue's LotCondition enum exactly — FAIR does not exist there
const CONDITIONS = ['NEW', 'EXCELLENT', 'VERY_GOOD', 'GOOD'] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type='submit' disabled={pending}>{pending ? 'Creating…' : 'Create Lot'}</Button>;
}

function FieldError({ messages }: { messages: string[] | undefined }) {
  if (!messages?.length) return null;
  return <p className='text-sm text-destructive'>{messages[0]}</p>;
}

export function NewLotForm({ categories }: { categories: CategoryOption[] }) {
  const router = useRouter();
  const [state, formAction] = useActionState(createLot, {});

  useEffect(() => {
    if (state.ok) router.push('/admin/lots');
  }, [state, router]);

  return (
    <form action={formAction} className='space-y-4'>
      {state.ok === false && !state.errors && (
        <p className='rounded border border-destructive p-2 text-sm text-destructive'>
          Could not create the lot. Please try again.
        </p>
      )}
      <div className='space-y-1'>
        <Label htmlFor='title'>Title</Label>
        <Input id='title' name='title' />
        <FieldError messages={state.errors?.title} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='description'>Description</Label>
        <Textarea id='description' name='description' rows={4} />
        <FieldError messages={state.errors?.description} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='categoryId'>Category</Label>
        <Select name='categoryId'>
          <SelectTrigger id='categoryId'><SelectValue placeholder='Select a category' /></SelectTrigger>
          <SelectContent>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <FieldError messages={state.errors?.categoryId} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='condition'>Condition</Label>
        <Select name='condition'>
          <SelectTrigger id='condition'><SelectValue placeholder='Select condition' /></SelectTrigger>
          <SelectContent>
            {CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        <FieldError messages={state.errors?.condition} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='estimatedValue'>Estimated Value</Label>
        <Input id='estimatedValue' name='estimatedValue' type='number' min={0} step={0.01} />
        <FieldError messages={state.errors?.estimatedValue} />
      </div>
      <SubmitButton />
    </form>
  );
}
```

- [ ] **Step 6: Convert the new-lot page to a server component that fetches categories**

Replace `apps/admin-portal/src/app/admin/lots/new/page.tsx` (parse through the shared contract schema — an `as` cast validates nothing):

```tsx
import { categoryListResponseSchema } from '@carat-room/shared-types';
import { adminApi } from '@/lib/admin-api';
import { categoryOptions } from '@/lib/categories';
import { NewLotForm } from './_new-lot-form';

export default async function NewLotPage() {
  const res = await adminApi.get<unknown>('/admin/api/categories');
  const categories = categoryOptions(categoryListResponseSchema.parse(res).data);

  return (
    <div className='max-w-lg space-y-4'>
      <h1 className='text-2xl font-semibold'>New Lot</h1>
      <NewLotForm categories={categories} />
    </div>
  );
}
```

- [ ] **Step 6b: Align `lot.schema.ts` with the catalogue condition enum**

In `apps/admin-portal/src/lib/schemas/lot.schema.ts` replace:

```ts
export const LotCondition = z.enum(['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR']);
```

with:

```ts
// Mirrors apps/catalogue LotCondition — FAIR is not a valid catalogue condition
export const LotCondition = z.enum(['NEW', 'EXCELLENT', 'VERY_GOOD', 'GOOD']);
```

and update `lot.schema.test.ts`: a test asserting `'NEW'` parses and `'FAIR'` is rejected.

- [ ] **Step 7: Apply the same fixes to the edit form**

Modify `apps/admin-portal/src/app/admin/lots/[id]/_edit-form.tsx`:
- Add prop `categories: CategoryOption[]` (import from `@/lib/categories`).
- Replace the `categoryId` `<Input>` with the same `<Select name='categoryId' defaultValue={lot.categoryId}>` block as Step 5 (options from `categories`).
- Replace its local `CONDITIONS` constant with the corrected `['NEW', 'EXCELLENT', 'VERY_GOOD', 'GOOD']` (or export the constant from `@/lib/schemas/lot.schema.ts` and import it in both forms — preferred, one source of truth).
- Add the same `FieldError` component and render it under description, categoryId, condition, and estimatedValue; add the same general server-error block at the top of the form.

Modify `apps/admin-portal/src/app/admin/lots/[id]/page.tsx`: fetch categories exactly as in Step 6 (`categoryListResponseSchema.parse` + `categoryOptions`) alongside the existing lot fetch, and pass `categories={categories}` to `<EditLotForm />`.

- [ ] **Step 8: Verify build and tests**

Run: `pnpm turbo build --filter=admin-portal && pnpm turbo test --filter=admin-portal`
Expected: build succeeds, tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/admin-portal/src/lib/categories.ts apps/admin-portal/src/lib/categories.test.ts apps/admin-portal/src/app/admin/lots
git commit -m "fix(admin-portal): category dropdown and full error rendering on lot forms"
```

---

### Task 3: Categories — root-level "New Category" button + surfaced errors

**Files:**
- Modify: `apps/admin-portal/src/components/category-tree.tsx`
- Modify: `apps/admin-portal/src/app/admin/categories/page.tsx` (parse the flat contract, build the tree)

**Interfaces:**
- Consumes: `createCategory(data: { name: string; slug: string; parentId?: string }): Promise<{ ok: boolean; error?: unknown }>` from `apps/admin-portal/src/app/admin/categories/_actions.ts` (unchanged); `buildCategoryTree` + `CategoryTreeNode` from `@/lib/categories` (Task 2).
- Produces: `CategoryTree({ categories }: { categories: CategoryTreeNode[] })` renders a "New Category" button above the tree that works when the tree is empty; create failures show an inline message instead of being swallowed.

**Root cause recap:** the only create entry point is a per-node "+" (add child), so an empty tree can never gain its first category and top-level categories cannot be created; `createCategory`'s `{ ok: false, error }` result is ignored. **Additionally (upstream contract fact):** the page's local `Category` interface assumes a `children` field the catalogue never returns — the flat list must be parsed with `categoryListResponseSchema` and nested via `buildCategoryTree`, otherwise `category.children.length` throws as soon as any category exists.

- [ ] **Step 0: Fix the page's contract**

Replace `apps/admin-portal/src/app/admin/categories/page.tsx` (drop the local tree-shaped `Category` interface):

```tsx
import { categoryListResponseSchema } from '@carat-room/shared-types';
import { adminApi } from '@/lib/admin-api';
import { buildCategoryTree } from '@/lib/categories';
import { CategoryTree } from '@/components/category-tree';

export default async function CategoriesPage() {
  const res = await adminApi.get<unknown>('/admin/api/categories');
  const categories = buildCategoryTree(categoryListResponseSchema.parse(res).data);

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Categories</h1>
      <CategoryTree categories={categories} />
    </div>
  );
}
```

In `category-tree.tsx`, delete the local `Category` interface and use `CategoryTreeNode` from `@/lib/categories` throughout (`interface CategoryNodeProps { category: CategoryTreeNode; depth: number }`).

- [ ] **Step 1: Extract a reusable inline create form and add the root button**

In `apps/admin-portal/src/components/category-tree.tsx`:

1. Add a `NewCategoryForm` component (replaces the inline `addingChild` block so the child and root cases share one implementation — DRY):

```tsx
function NewCategoryForm({ parentId, indentPx, onDone }: { parentId?: string; indentPx: number; onDone: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreate = async () => {
    const result = await createCategory({ name, slug, parentId });
    if (!result.ok) {
      setErrorMessage('Could not create category — check the name and slug are valid and unique.');
      return;
    }
    onDone();
  };

  return (
    <div className='space-y-1 py-1' style={{ paddingLeft: `${indentPx}px` }}>
      <div className='flex items-center gap-2'>
        <Input placeholder='Name' value={name} onChange={e => setName(e.target.value)} className='h-6 w-32 text-sm' autoFocus />
        <Input placeholder='slug' value={slug} onChange={e => setSlug(e.target.value)} className='h-6 w-28 text-sm' />
        <Button size='sm' className='h-6' onClick={handleCreate}>Add</Button>
        <Button size='sm' variant='ghost' className='h-6' onClick={onDone}>Cancel</Button>
      </div>
      {errorMessage && <p className='text-sm text-destructive'>{errorMessage}</p>}
    </div>
  );
}
```

2. In `CategoryNode`, replace the `addingChild && (...)` block with:

```tsx
{addingChild && (
  <NewCategoryForm parentId={category.id} indentPx={(depth + 1) * 16} onDone={() => setAddingChild(false)} />
)}
```

and delete the now-unused `newChildName`/`newChildSlug` state and `handleAddChild`.

3. Replace the `CategoryTree` export with:

```tsx
export function CategoryTree({ categories }: { categories: Category[] }) {
  const [isAddingRoot, setIsAddingRoot] = useState(false);

  return (
    <div className='space-y-2'>
      <div className='flex justify-end'>
        <Button size='sm' onClick={() => setIsAddingRoot(true)}>
          <Plus className='mr-1 h-3 w-3' /> New Category
        </Button>
      </div>
      <ul className='rounded border bg-card p-2'>
        {isAddingRoot && <NewCategoryForm indentPx={0} onDone={() => setIsAddingRoot(false)} />}
        {categories.length === 0 && !isAddingRoot && (
          <li className='p-2 text-sm text-muted-foreground'>No categories yet — use "New Category" to create the first one.</li>
        )}
        {categories.map(cat => (
          <CategoryNode key={cat.id} category={cat} depth={0} />
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify build and tests**

Run: `pnpm turbo build --filter=admin-portal && pnpm turbo test --filter=admin-portal`
Expected: build succeeds, tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/components/category-tree.tsx
git commit -m "fix(admin-portal): root-level New Category button with surfaced errors"
```

---

### Task 4: User Service — domain method + admin create/update use cases

**Files:**
- Modify: `apps/user-auth/src/domain/user.ts` (add `changeEmail`)
- Create: `apps/user-auth/src/application/admin-create-user.use-case.ts`
- Create: `apps/user-auth/src/application/admin-update-user.use-case.ts`
- Test: `apps/user-auth/src/domain/user.test.ts` (extend)
- Test: `apps/user-auth/src/application/admin-user.use-cases.test.ts` (new)

**Interfaces:**
- Consumes: `UserRepository` (`findById`, `findByEmail`, `save`), `TokenRepository.saveVerificationToken`, `PasswordService.hash(password: string): Promise<string>`, `EventPublisher.publish`, `ROUTING_KEYS.USER_REGISTERED` + `UserRegisteredPayload` from `@carat-room/shared-types` — all exactly as used in `register.use-case.ts`.
- Produces:
  - `User.changeEmail(email: string): void`
  - `AdminCreateUserUseCase.execute(dto: { email: string; password: string; role: 'BUYER' | 'ADMIN'; country?: string }): Promise<{ id: string }>` — throws `Error('Email already registered')` on duplicate.
  - `AdminUpdateUserUseCase.execute(id: string, dto: { email?: string; country?: string }): Promise<void>` — throws `Error('User not found')` / `Error('Email already registered')`.

- [ ] **Step 1: Write failing domain test**

Add to `apps/user-auth/src/domain/user.test.ts`:

```ts
describe('changeEmail', () => {
  it('updates the email and updatedAt', () => {
    const user = User.create({ id: 'u1', email: 'old@example.com', passwordHash: 'h', role: UserRole.BUYER });
    const before = user.updatedAt;
    user.changeEmail('new@example.com');
    expect(user.email).toBe('new@example.com');
    expect(user.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm turbo test --filter=user-auth -- user.test`
Expected: FAIL — `changeEmail is not a function`.

- [ ] **Step 3: Implement `changeEmail`**

In `apps/user-auth/src/domain/user.ts`, after `updateProfile`:

```ts
changeEmail(email: string): void {
  this.props.email = email;
  this.props.updatedAt = new Date();
}
```

- [ ] **Step 4: Run domain tests to verify they pass**

Run: `pnpm turbo test --filter=user-auth -- user.test`
Expected: PASS.

- [ ] **Step 5: Write failing use-case tests**

Create `apps/user-auth/src/application/admin-user.use-cases.test.ts`. Follow the mock style of `use-cases.test.ts` (in-memory fakes / `vi.fn()`):

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminCreateUserUseCase } from './admin-create-user.use-case';
import { AdminUpdateUserUseCase } from './admin-update-user.use-case';
import { User, UserRole } from '../domain/user';

const makeRepos = () => ({
  userRepo: {
    findById: vi.fn().mockResolvedValue(null),
    findByEmail: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
  },
  tokenRepo: { saveVerificationToken: vi.fn().mockResolvedValue(undefined) } as never,
  passwordService: { hash: vi.fn().mockResolvedValue('hashed') } as never,
  publisher: { publish: vi.fn().mockResolvedValue(undefined) } as never,
});

describe('AdminCreateUserUseCase', () => {
  it('creates a user with the given role and publishes user.registered', async () => {
    const deps = makeRepos();
    const useCase = new AdminCreateUserUseCase(deps.userRepo, deps.tokenRepo, deps.passwordService, deps.publisher);

    const result = await useCase.execute({ email: 'buyer@example.com', password: 'CorrectHorse9!', role: 'BUYER' });

    expect(result.id).toBeTruthy();
    expect(deps.userRepo.save).toHaveBeenCalledOnce();
    const saved = deps.userRepo.save.mock.calls[0][0] as User;
    expect(saved.email).toBe('buyer@example.com');
    expect(saved.role).toBe(UserRole.BUYER);
    expect((deps.publisher as { publish: ReturnType<typeof vi.fn> }).publish).toHaveBeenCalledOnce();
  });

  it('rejects a duplicate email', async () => {
    const deps = makeRepos();
    deps.userRepo.findByEmail.mockResolvedValue(
      User.create({ id: 'u1', email: 'buyer@example.com', passwordHash: 'h', role: UserRole.BUYER }),
    );
    const useCase = new AdminCreateUserUseCase(deps.userRepo, deps.tokenRepo, deps.passwordService, deps.publisher);

    await expect(useCase.execute({ email: 'buyer@example.com', password: 'CorrectHorse9!', role: 'BUYER' }))
      .rejects.toThrow('Email already registered');
  });
});

describe('AdminUpdateUserUseCase', () => {
  const existing = () => User.create({ id: 'u1', email: 'old@example.com', passwordHash: 'h', role: UserRole.BUYER });

  it('updates email and country', async () => {
    const deps = makeRepos();
    deps.userRepo.findById.mockResolvedValue(existing());
    const useCase = new AdminUpdateUserUseCase(deps.userRepo);

    await useCase.execute('u1', { email: 'new@example.com', country: 'GB' });

    const saved = deps.userRepo.save.mock.calls[0][0] as User;
    expect(saved.email).toBe('new@example.com');
    expect(saved.country).toBe('GB');
  });

  it('throws when the user does not exist', async () => {
    const deps = makeRepos();
    const useCase = new AdminUpdateUserUseCase(deps.userRepo);
    await expect(useCase.execute('missing', { country: 'GB' })).rejects.toThrow('User not found');
  });

  it('rejects an email already used by another user', async () => {
    const deps = makeRepos();
    deps.userRepo.findById.mockResolvedValue(existing());
    deps.userRepo.findByEmail.mockResolvedValue(
      User.create({ id: 'u2', email: 'taken@example.com', passwordHash: 'h', role: UserRole.BUYER }),
    );
    const useCase = new AdminUpdateUserUseCase(deps.userRepo);
    await expect(useCase.execute('u1', { email: 'taken@example.com' })).rejects.toThrow('Email already registered');
  });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `pnpm turbo test --filter=user-auth -- admin-user.use-cases`
Expected: FAIL — modules not found.

- [ ] **Step 7: Implement the use cases**

Create `apps/user-auth/src/application/admin-create-user.use-case.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole } from '../domain/user';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../domain/token-repository';
import { PasswordService } from './password-service';
import { EventPublisher } from '@carat-room/shared-events';
import { ROUTING_KEYS, UserRegisteredPayload } from '@carat-room/shared-types';

interface AdminCreateUserDto {
  email: string;
  password: string;
  role: 'BUYER' | 'ADMIN';
  country?: string;
}

const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export class AdminCreateUserUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly passwordService: PasswordService,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(dto: AdminCreateUserDto): Promise<{ id: string }> {
    const existing = await this.userRepo.findByEmail(dto.email);
    if (existing) throw new Error('Email already registered');

    const passwordHash = await this.passwordService.hash(dto.password);
    const user = User.create({
      id: uuidv4(),
      email: dto.email,
      passwordHash,
      role: dto.role === 'ADMIN' ? UserRole.ADMIN : UserRole.BUYER,
      country: dto.country,
    });
    await this.userRepo.save(user);

    // Admin-created users still verify their own email — same flow as self-registration
    const tokenCode = uuidv4().replace(/-/g, '');
    await this.tokenRepo.saveVerificationToken({
      id: uuidv4(),
      userId: user.id,
      type: 'EMAIL',
      code: tokenCode,
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
    });

    const payload: UserRegisteredPayload = {
      userId: user.id,
      email: user.email,
      emailVerificationCode: tokenCode,
    };
    await this.publisher.publish(ROUTING_KEYS.USER_REGISTERED, payload);

    return { id: user.id };
  }
}
```

Create `apps/user-auth/src/application/admin-update-user.use-case.ts`:

```ts
import { UserRepository } from '../domain/user-repository';

interface AdminUpdateUserDto {
  email?: string;
  country?: string;
}

export class AdminUpdateUserUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(id: string, dto: AdminUpdateUserDto): Promise<void> {
    const user = await this.userRepo.findById(id);
    if (!user) throw new Error('User not found');

    if (dto.email !== undefined && dto.email !== user.email) {
      const existing = await this.userRepo.findByEmail(dto.email);
      if (existing && existing.id !== id) throw new Error('Email already registered');
      user.changeEmail(dto.email);
    }
    if (dto.country !== undefined) {
      user.updateProfile({ country: dto.country });
    }
    await this.userRepo.save(user);
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm turbo test --filter=user-auth`
Expected: PASS (all).

- [ ] **Step 9: Commit**

```bash
git add apps/user-auth/src/domain/user.ts apps/user-auth/src/domain/user.test.ts apps/user-auth/src/application/admin-create-user.use-case.ts apps/user-auth/src/application/admin-update-user.use-case.ts apps/user-auth/src/application/admin-user.use-cases.test.ts
git commit -m "feat(user-auth): admin create and update user use cases"
```

---

### Task 5: User Service — admin router routes + wiring

**Files:**
- Modify: `apps/user-auth/src/presentation/admin-users-router.ts`
- Modify: `apps/user-auth/src/main.ts` (construct and inject the two new use cases)
- Test: `apps/user-auth/src/presentation/user-router.test.ts` sibling — add cases to the existing admin router tests (they live in `user-router.test.ts` / `routers` test file; follow whichever file already tests `buildAdminUsersRouter`)

**Interfaces:**
- Consumes: `AdminCreateUserUseCase`, `AdminUpdateUserUseCase` (Task 4 signatures).
- Produces (consumed by Task 6):
  - `POST /api/users` body `{ email, password, role, country? }` → `201 { data: { id } }`; `409 { error: { code: 'CONFLICT' } }` on duplicate email; `400 { error: { code: 'VALIDATION_ERROR' } }` on missing fields.
  - `PATCH /api/users/:id` body `{ email?, country? }` → `{ data: { id } }`; `404` unknown user; `409` duplicate email.

Note: `buildUserRouter` is also mounted at `/api/users` (registration is `POST /api/users/register`), so `POST /` on the admin router does not clash — verify with the route test in Step 1.

- [ ] **Step 1: Write failing router tests**

In the file that already tests `buildAdminUsersRouter`, add (adapting to its existing fake-use-case setup):

```ts
describe('POST /', () => {
  it('creates a user and returns 201 with the id', async () => {
    useCases.adminCreateUser.execute.mockResolvedValue({ id: 'new-id' });
    const res = await app.request('/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'CorrectHorse9!', role: 'BUYER' }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { id: 'new-id' } });
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 409 on duplicate email', async () => {
    useCases.adminCreateUser.execute.mockRejectedValue(new Error('Email already registered'));
    const res = await app.request('/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'CorrectHorse9!', role: 'BUYER' }),
    });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /:id', () => {
  it('updates and returns the id', async () => {
    useCases.adminUpdateUser.execute.mockResolvedValue(undefined);
    const res = await app.request('/u1', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'GB' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: 'u1' } });
  });

  it('returns 404 for an unknown user', async () => {
    useCases.adminUpdateUser.execute.mockRejectedValue(new Error('User not found'));
    const res = await app.request('/missing', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'GB' }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm turbo test --filter=user-auth`
Expected: new tests FAIL (404 route not found / missing use cases).

- [ ] **Step 3: Implement the routes**

In `apps/user-auth/src/presentation/admin-users-router.ts`:

1. Extend the `UseCases` interface:

```ts
import { AdminCreateUserUseCase } from '../application/admin-create-user.use-case';
import { AdminUpdateUserUseCase } from '../application/admin-update-user.use-case';

interface UseCases {
  listUsers: ListUsersUseCase;
  getUser: GetMeUseCase;
  suspendUser: SuspendUserUseCase;
  reinstateUser: ReinstateUserUseCase;
  approveUser: ApproveUserUseCase;
  adminCreateUser: AdminCreateUserUseCase;
  adminUpdateUser: AdminUpdateUserUseCase;
}
```

2. Add routes (before the `mutate` PATCH routes; reuse the existing error-message-to-status mapping style):

```ts
router.post('/', adminOnly, async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; role?: string; country?: string }>();
  if (!body.email || !body.password || (body.role !== 'BUYER' && body.role !== 'ADMIN')) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'email, password and role (BUYER or ADMIN) are required' } },
      400,
    );
  }
  try {
    const result = await useCases.adminCreateUser.execute({
      email: body.email,
      password: body.password,
      role: body.role,
      country: body.country,
    });
    return c.json({ data: { id: result.id } }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'CONFLICT', message } }, 409);
  }
});

router.patch('/:id', adminOnly, async (c) => {
  const body = await c.req.json<{ email?: string; country?: string }>();
  try {
    await useCases.adminUpdateUser.execute(c.req.param('id'), { email: body.email, country: body.country });
    return c.json({ data: { id: c.req.param('id') } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'User not found') {
      return c.json({ error: { code: 'NOT_FOUND', message } }, 404);
    }
    return c.json({ error: { code: 'CONFLICT', message } }, 409);
  }
});
```

**Route-order caveat:** Hono matches in registration order; `PATCH /:id` must be registered **after** `/:id/suspend`, `/:id/reinstate`, `/:id/approve` — or use distinct methods (they are all PATCH, so order matters: keep `/:id/suspend` etc. first, then plain `/:id`).

3. In `apps/user-auth/src/main.ts`, construct the new use cases next to the existing admin use cases and pass them into `buildAdminUsersRouter`:

```ts
adminCreateUser: new AdminCreateUserUseCase(userRepo, tokenRepo, passwordService, publisher),
adminUpdateUser: new AdminUpdateUserUseCase(userRepo),
```

(match the actual variable names in `main.ts` for repo/service/publisher instances).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm turbo test --filter=user-auth && pnpm turbo build --filter=user-auth`
Expected: PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add apps/user-auth/src
git commit -m "feat(user-auth): admin POST /api/users and PATCH /api/users/:id routes"
```

---

### Task 6: Admin Service — proxy routes for user create/update

**Files:**
- Modify: `apps/admin/src/presentation/users-router.ts`
- Test: `apps/admin/src/presentation/routers.test.ts` (extend, following its existing fake-`ServiceClient` pattern)

**Interfaces:**
- Consumes: Task 5 endpoints on the user client.
- Produces (consumed by Task 7/8): `POST /admin/api/users` and `PATCH /admin/api/users/:id` — bodies passed through verbatim, responses passed through including error envelopes and status codes.

- [x] **Step 1: Write failing proxy tests**

In `apps/admin/src/presentation/routers.test.ts`, add cases asserting that `POST /admin/api/users` calls `client.post('/api/users', token, body)` and returns the upstream body, and that `PATCH /admin/api/users/:id` calls `client.patch('/api/users/u1', token, body)`. Follow the file's existing mock style for the other users routes.

- [x] **Step 2: Run to verify they fail**

Run: `pnpm turbo test --filter=admin`
Expected: new tests FAIL (404).

- [x] **Step 3: Implement the proxy routes**

In `apps/admin/src/presentation/users-router.ts`, after the GET routes:

```ts
r.post('/admin/api/users', auth, async c =>
  proxy(async () => client.post('/api/users', tok(c), await c.req.json()), c));

r.patch('/admin/api/users/:id', auth, async c =>
  proxy(async () => client.patch(`/api/users/${c.req.param('id')}`, tok(c), await c.req.json()), c));
```

Add `409` to the proxy's status union if the `ServiceError` cast (`err.status as 400 | 404 | 500`) does not already include it: `err.status as 400 | 404 | 409 | 500`.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm turbo test --filter=admin && pnpm turbo build --filter=admin`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/admin/src/presentation/users-router.ts apps/admin/src/presentation/routers.test.ts
git commit -m "feat(admin): proxy user create and update to the user service"
```

---

### Task 7: Admin Portal — New User page

**Files:**
- Modify: `apps/admin-portal/src/lib/schemas/user.schema.ts` (add create/update schemas)
- Test: `apps/admin-portal/src/lib/schemas/user.schema.test.ts` (extend)
- Create: `apps/admin-portal/src/app/admin/users/_actions.ts`
- Test: `apps/admin-portal/src/app/admin/users/_actions.test.ts`
- Create: `apps/admin-portal/src/app/admin/users/new/page.tsx`
- Modify: `apps/admin-portal/src/app/admin/users/page.tsx` (add "New User" button)

**Interfaces:**
- Consumes: `adminApi.post/patch` (`@/lib/admin-api`), Task 6 proxy routes.
- Produces (consumed by Task 8): `CreateUserSchema`, `UpdateUserSchema`, and server actions `createUser(_prev: ActionState, formData: FormData): Promise<ActionState>` / `updateUser(id: string, _prev: ActionState, formData: FormData): Promise<ActionState>` with `ActionState = { ok?: boolean; errors?: Record<string, string[] | undefined>; [key: string]: unknown }` (same shape as `lots/_actions.ts`).

- [ ] **Step 1: Write failing schema tests**

Add to `apps/admin-portal/src/lib/schemas/user.schema.test.ts`:

```ts
describe('CreateUserSchema', () => {
  it('accepts a valid payload', () => {
    const result = CreateUserSchema.safeParse({
      email: 'buyer@example.com', password: 'CorrectHorse9!Battery', role: 'BUYER', country: 'GB',
    });
    expect(result.success).toBe(true);
  });

  it('treats an empty country as undefined', () => {
    const result = CreateUserSchema.safeParse({
      email: 'buyer@example.com', password: 'CorrectHorse9!Battery', role: 'BUYER', country: '',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.country).toBeUndefined();
  });

  it('rejects a short password and a bad role', () => {
    expect(CreateUserSchema.safeParse({ email: 'a@b.com', password: 'short', role: 'BUYER' }).success).toBe(false);
    expect(CreateUserSchema.safeParse({ email: 'a@b.com', password: 'CorrectHorse9!Battery', role: 'ROOT' }).success).toBe(false);
  });
});

describe('UpdateUserSchema', () => {
  it('accepts email and country', () => {
    expect(UpdateUserSchema.safeParse({ email: 'a@b.com', country: 'GB' }).success).toBe(true);
  });
  it('rejects an invalid email', () => {
    expect(UpdateUserSchema.safeParse({ email: 'nope', country: 'GB' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm turbo test --filter=admin-portal -- user.schema`
Expected: FAIL — schemas not exported.

- [ ] **Step 3: Implement the schemas**

Append to `apps/admin-portal/src/lib/schemas/user.schema.ts`:

```ts
const OptionalCountry = z
  .union([z.string().length(0), z.string().min(2, 'Use an ISO country code')])
  .optional()
  .transform(value => (value ? value : undefined));

export const CreateUserSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  role: z.enum(['BUYER', 'ADMIN'], { errorMap: () => ({ message: 'Select a role' }) }),
  country: OptionalCountry,
});

export const UpdateUserSchema = z.object({
  email: z.string().email('Enter a valid email'),
  country: OptionalCountry,
});

export type CreateUserValues = z.infer<typeof CreateUserSchema>;
export type UpdateUserValues = z.infer<typeof UpdateUserSchema>;
```

- [ ] **Step 4: Run schema tests to verify they pass**

Run: `pnpm turbo test --filter=admin-portal -- user.schema`
Expected: PASS.

- [ ] **Step 5: Write failing action tests, then implement the actions**

Create `apps/admin-portal/src/app/admin/users/_actions.test.ts` following the mock style of `apps/admin-portal/src/app/admin/lots/_actions.test.ts` (mock `@/lib/admin-api` and `next/cache`), covering: validation failure returns `{ ok: false, errors }`; success posts to `/admin/api/users` and returns `{ ok: true, id }`; `AdminApiError` returns `{ ok: false, error }`. Run it, see it fail, then create `apps/admin-portal/src/app/admin/users/_actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { CreateUserSchema, UpdateUserSchema } from '@/lib/schemas/user.schema';

type ActionState = { ok?: boolean; errors?: Record<string, string[] | undefined>; [key: string]: unknown };

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role'),
    country: formData.get('country') ?? undefined,
  };

  const parsed = CreateUserSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors };

  try {
    const res = await adminApi.post<{ data: { id: string } }>('/admin/api/users', parsed.data);
    revalidatePath('/admin/users');
    return { ok: true, id: res.data.id };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function updateUser(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    email: formData.get('email'),
    country: formData.get('country') ?? undefined,
  };

  const parsed = UpdateUserSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/users/${id}`, parsed.data);
    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}
```

Run: `pnpm turbo test --filter=admin-portal -- users` — expected PASS.

- [ ] **Step 6: Create the New User page**

Create `apps/admin-portal/src/app/admin/users/new/page.tsx` (client form, every field gets an error slot plus a general server-error line — duplicate-email errors from the backend surface via `state.error`):

```tsx
'use client';

import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createUser } from '../_actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type='submit' disabled={pending}>{pending ? 'Creating…' : 'Create User'}</Button>;
}

function FieldError({ messages }: { messages: string[] | undefined }) {
  if (!messages?.length) return null;
  return <p className='text-sm text-destructive'>{messages[0]}</p>;
}

export default function NewUserPage() {
  const router = useRouter();
  const [state, formAction] = useActionState(createUser, {});

  useEffect(() => {
    if (state.ok) router.push('/admin/users');
  }, [state, router]);

  return (
    <div className='max-w-lg space-y-4'>
      <h1 className='text-2xl font-semibold'>New User</h1>
      <form action={formAction} className='space-y-4'>
        {state.ok === false && !state.errors && (
          <p className='rounded border border-destructive p-2 text-sm text-destructive'>
            Could not create the user — the email may already be registered.
          </p>
        )}
        <div className='space-y-1'>
          <Label htmlFor='email'>Email</Label>
          <Input id='email' name='email' type='email' />
          <FieldError messages={state.errors?.email} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='password'>Temporary Password</Label>
          <Input id='password' name='password' type='password' />
          <FieldError messages={state.errors?.password} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='role'>Role</Label>
          <Select name='role' defaultValue='BUYER'>
            <SelectTrigger id='role'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='BUYER'>Buyer</SelectItem>
              <SelectItem value='ADMIN'>Admin</SelectItem>
            </SelectContent>
          </Select>
          <FieldError messages={state.errors?.role} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='country'>Country (optional)</Label>
          <Input id='country' name='country' placeholder='GB' />
          <FieldError messages={state.errors?.country} />
        </div>
        <SubmitButton />
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Add the "New User" button to the list page**

In `apps/admin-portal/src/app/admin/users/page.tsx`, mirror the lots page header:

```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
```

and replace the `<h1>` line with:

```tsx
<div className='flex items-center justify-between'>
  <h1 className='text-2xl font-semibold'>Users</h1>
  <Button asChild>
    <Link href='/admin/users/new'>New User</Link>
  </Button>
</div>
```

- [ ] **Step 8: Verify build and tests, then commit**

Run: `pnpm turbo build --filter=admin-portal && pnpm turbo test --filter=admin-portal`
Expected: PASS.

```bash
git add apps/admin-portal/src/lib/schemas/user.schema.ts apps/admin-portal/src/lib/schemas/user.schema.test.ts apps/admin-portal/src/app/admin/users
git commit -m "feat(admin-portal): new user page and create action"
```

---

### Task 8: Admin Portal — edit user form on the detail page

**Files:**
- Create: `apps/admin-portal/src/app/admin/users/[id]/_edit-form.tsx`
- Modify: `apps/admin-portal/src/app/admin/users/[id]/page.tsx`

**Interfaces:**
- Consumes: `updateUser` from Task 7; `UserDetail` shape already defined in the detail page (`{ id, email, status, country, phoneVerified, emailVerified, registeredAt }`).
- Produces: `EditUserForm({ user }: { user: { id: string; email: string; country: string | null } })`.

- [ ] **Step 1: Create the edit form**

Create `apps/admin-portal/src/app/admin/users/[id]/_edit-form.tsx` (same pattern as `lots/[id]/_edit-form.tsx`):

```tsx
'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateUser } from '../_actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type='submit' disabled={pending}>{pending ? 'Saving…' : 'Save Changes'}</Button>;
}

function FieldError({ messages }: { messages: string[] | undefined }) {
  if (!messages?.length) return null;
  return <p className='text-sm text-destructive'>{messages[0]}</p>;
}

export function EditUserForm({ user }: { user: { id: string; email: string; country: string | null } }) {
  const boundAction = updateUser.bind(null, user.id);
  const [state, formAction] = useActionState(boundAction, {});

  return (
    <form action={formAction} className='space-y-4 rounded border p-4'>
      <h2 className='text-lg font-medium'>Edit User</h2>
      {state.ok === false && !state.errors && (
        <p className='rounded border border-destructive p-2 text-sm text-destructive'>
          Could not save — the email may already be registered.
        </p>
      )}
      {state.ok === true && <p className='text-sm text-muted-foreground'>Saved.</p>}
      <div className='space-y-1'>
        <Label htmlFor='email'>Email</Label>
        <Input id='email' name='email' type='email' defaultValue={user.email} />
        <FieldError messages={state.errors?.email} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='country'>Country</Label>
        <Input id='country' name='country' defaultValue={user.country ?? ''} />
        <FieldError messages={state.errors?.country} />
      </div>
      <SubmitButton />
    </form>
  );
}
```

- [ ] **Step 2: Render it on the detail page**

In `apps/admin-portal/src/app/admin/users/[id]/page.tsx`, import `EditUserForm` and add `<EditUserForm user={user} />` after the existing `<dl>` block. While in the file, replace the padded suspend reason `'Suspended by admin.      '` with `'Suspended by an administrator.'` (Boy Scout Rule — the trailing spaces only exist to satisfy the schema's 10-character minimum; the replacement satisfies it honestly).

- [ ] **Step 3: Verify build and tests, then commit**

Run: `pnpm turbo build --filter=admin-portal && pnpm turbo test --filter=admin-portal`
Expected: PASS.

```bash
git add apps/admin-portal/src/app/admin/users
git commit -m "feat(admin-portal): edit user form on the user detail page"
```

---

### Task 9: Auction Engine — results and unsold report queries

**Files:**
- Modify: `apps/auction-engine/src/application/lot-query-repository.ts` (add row types + methods)
- Modify: `apps/auction-engine/src/infrastructure/postgres-lot-query-repository.ts`
- Create: `apps/auction-engine/src/application/get-auction-results-handler.ts`
- Create: `apps/auction-engine/src/application/get-unsold-lots-handler.ts`
- Modify: `apps/auction-engine/src/presentation/auction-router.ts` (two routes) and `apps/auction-engine/src/main.ts` (wiring)
- Test: `apps/auction-engine/src/infrastructure/postgres-lot-query-repository.test.ts` (extend), `apps/auction-engine/src/presentation/auction-router.test.ts` (extend)

**Interfaces:**
- Consumes: `lot_status` projection table (`lot_id`, `status` incl. `'SOLD'`/`'UNSOLD'`, `current_highest_bid`, `winner_user_id`, `updated_at` — close time). No reserve price exists in the read model by design.
- Produces (consumed by Task 11):
  - `GET /api/reports/results?from=<ISO>&to=<ISO>` (adminOnly) → `{ data: AuctionResultRow[] }` where `AuctionResultRow = { lotId: string; finalBid: number | null; reserveMet: boolean; winnerUserId: string | null; closedAt: string }`.
  - `GET /api/reports/unsold` (adminOnly) → `{ data: UnsoldLotRow[] }` where `UnsoldLotRow = { lotId: string; highestBid: number | null }`.

- [ ] **Step 1: Add types and repository methods to the application interface**

In `apps/auction-engine/src/application/lot-query-repository.ts`:

```ts
export interface AuctionResultRow {
  lotId: string;
  finalBid: number | null;
  reserveMet: boolean;
  winnerUserId: string | null;
  closedAt: Date;
}

export interface UnsoldLotRow {
  lotId: string;
  highestBid: number | null;
}
```

and extend the interface:

```ts
findClosedResults(from: Date, to: Date): Promise<AuctionResultRow[]>;
findUnsoldLots(): Promise<UnsoldLotRow[]>;
```

- [ ] **Step 2: Write failing repository tests**

Extend `apps/auction-engine/src/infrastructure/postgres-lot-query-repository.test.ts` following its existing fake-`Db` style: seed `lot_status` rows with statuses `SOLD`, `UNSOLD`, `LIVE`; assert `findClosedResults` returns only SOLD/UNSOLD rows inside the range with `reserveMet` true only for SOLD, and `findUnsoldLots` returns only UNSOLD rows.

Run: `pnpm turbo test --filter=auction-engine -- postgres-lot-query-repository`
Expected: FAIL — methods missing.

- [ ] **Step 3: Implement the SQL**

In `apps/auction-engine/src/infrastructure/postgres-lot-query-repository.ts`:

```ts
async findClosedResults(from: Date, to: Date): Promise<AuctionResultRow[]> {
  const rows = await this.db`
    SELECT lot_id, status, current_highest_bid, winner_user_id, updated_at
    FROM lot_status
    WHERE status IN ('SOLD', 'UNSOLD')
      AND updated_at >= ${from}
      AND updated_at <= ${to}
    ORDER BY updated_at DESC
  `;
  return rows.map(r => ({
    lotId: r['lot_id'] as string,
    finalBid: r['current_highest_bid'] != null ? Number(r['current_highest_bid']) : null,
    reserveMet: (r['status'] as string) === 'SOLD',
    winnerUserId: (r['winner_user_id'] as string | null) ?? null,
    closedAt: r['updated_at'] as Date,
  }));
}

async findUnsoldLots(): Promise<UnsoldLotRow[]> {
  const rows = await this.db`
    SELECT lot_id, current_highest_bid
    FROM lot_status
    WHERE status = 'UNSOLD'
    ORDER BY updated_at DESC
  `;
  return rows.map(r => ({
    lotId: r['lot_id'] as string,
    highestBid: r['current_highest_bid'] != null ? Number(r['current_highest_bid']) : null,
  }));
}
```

(Column names verified against `apps/auction-engine/migrations/001_create_auction_engine.sql`; statuses verified against `postgres-projection-handler.ts` which writes `'SOLD'`/`'UNSOLD'` on `AuctionClosed`.)

- [ ] **Step 4: Run repository tests to verify they pass**

Run: `pnpm turbo test --filter=auction-engine -- postgres-lot-query-repository`
Expected: PASS.

- [ ] **Step 5: Add the handlers**

Create `apps/auction-engine/src/application/get-auction-results-handler.ts`:

```ts
import { AuctionResultRow, LotQueryRepository } from './lot-query-repository';

export class GetAuctionResultsHandler {
  constructor(private readonly repo: LotQueryRepository) {}

  async execute(from: Date, to: Date): Promise<AuctionResultRow[]> {
    return this.repo.findClosedResults(from, to);
  }
}
```

Create `apps/auction-engine/src/application/get-unsold-lots-handler.ts`:

```ts
import { LotQueryRepository, UnsoldLotRow } from './lot-query-repository';

export class GetUnsoldLotsHandler {
  constructor(private readonly repo: LotQueryRepository) {}

  async execute(): Promise<UnsoldLotRow[]> {
    return this.repo.findUnsoldLots();
  }
}
```

- [ ] **Step 6: Write failing router tests, then add the routes**

Extend `apps/auction-engine/src/presentation/auction-router.test.ts` (existing fake-deps style): `GET /api/reports/results?from=2026-06-01&to=2026-07-01` with an admin token returns `{ data: [...] }` and passes parsed `Date`s to the handler; missing/invalid `from`/`to` returns 400; `GET /api/reports/unsold` returns `{ data: [...] }`; both reject non-admin tokens. Run to see them fail, then in `auction-router.ts` (next to the dashboard route), add deps `getAuctionResults: GetAuctionResultsHandler` and `getUnsoldLots: GetUnsoldLotsHandler` and:

```ts
app.get('/api/reports/results', authMiddleware(deps.jwtPublicKey, { adminOnly: true }), async (c) => {
  const from = new Date(c.req.query('from') ?? '');
  const to = new Date(c.req.query('to') ?? '');
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'from and to must be valid dates' } }, 400);
  }
  // 'to' is a date-only value from the UI; include the whole end day
  to.setUTCHours(23, 59, 59, 999);
  const rows = await deps.getAuctionResults.execute(from, to);
  return c.json({ data: rows });
});

app.get('/api/reports/unsold', authMiddleware(deps.jwtPublicKey, { adminOnly: true }), async (c) => {
  const rows = await deps.getUnsoldLots.execute();
  return c.json({ data: rows });
});
```

In `apps/auction-engine/src/main.ts`, construct both handlers with the existing `PostgresLotQueryRepository` instance and add them to the router deps.

- [ ] **Step 7: Run all auction-engine tests and build**

Run: `pnpm turbo test --filter=auction-engine && pnpm turbo build --filter=auction-engine`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/auction-engine/src
git commit -m "feat(auction-engine): auction results and unsold lots report endpoints"
```

---

### Task 10: Payment Service — revenue report endpoint

**Files:**
- Modify: `apps/payment/src/domain/invoice-repository.ts` (add method)
- Modify: `apps/payment/src/infrastructure/postgres-invoice-repository.ts`
- Create: `apps/payment/src/application/get-revenue-report-use-case.ts`
- Modify: `apps/payment/src/presentation/payment-router.ts` + `apps/payment/src/main.ts`
- Test: `apps/payment/src/infrastructure/postgres-invoice-repository.test.ts` (extend), `apps/payment/src/presentation/payment-router.test.ts` (extend)

**Interfaces:**
- Consumes: `invoices` table (`amount NUMERIC`, `currency TEXT`, `status` incl. `'PAID'` — verified against `apps/payment/migrations/001_create_payment.sql`).
- Produces (consumed by Task 11): `GET /api/payments/reports/revenue` (adminOnly) → `{ data: { byCurrency: Record<string, number> } }`.

- [ ] **Step 1: Add the repository method**

In `apps/payment/src/domain/invoice-repository.ts` add to the interface:

```ts
sumPaidAmountByCurrency(): Promise<Record<string, number>>;
```

- [ ] **Step 2: Write a failing repository test**

Extend `apps/payment/src/infrastructure/postgres-invoice-repository.test.ts` in its existing style: rows `[{ currency: 'GBP', total: 1500 }, { currency: 'USD', total: 200 }]` from the fake Db produce `{ GBP: 1500, USD: 200 }`.

Run: `pnpm turbo test --filter=payment -- postgres-invoice-repository`
Expected: FAIL — method missing. (Any in-memory/fake implementations of `InvoiceRepository` in other tests must also gain the method — Liskov: implement it faithfully, e.g. sum over the fake's stored invoices, not a stub returning `{}`.)

- [ ] **Step 3: Implement**

In `apps/payment/src/infrastructure/postgres-invoice-repository.ts`:

```ts
async sumPaidAmountByCurrency(): Promise<Record<string, number>> {
  const rows = await this.db`
    SELECT currency, SUM(amount)::float AS total
    FROM invoices
    WHERE status = 'PAID'
    GROUP BY currency
  `;
  return Object.fromEntries(rows.map(r => [r['currency'] as string, Number(r['total'])]));
}
```

Create `apps/payment/src/application/get-revenue-report-use-case.ts`:

```ts
import { InvoiceRepository } from '../domain/invoice-repository';

export interface RevenueReport {
  byCurrency: Record<string, number>;
}

export class GetRevenueReportUseCase {
  constructor(private readonly invoiceRepo: InvoiceRepository) {}

  async execute(): Promise<RevenueReport> {
    return { byCurrency: await this.invoiceRepo.sumPaidAmountByCurrency() };
  }
}
```

- [ ] **Step 4: Write a failing router test, then add the route**

Extend `apps/payment/src/presentation/payment-router.test.ts`: `GET /api/payments/reports/revenue` with an admin token returns `{ data: { byCurrency: { GBP: 1500 } } }`; non-admin gets 403. Run to see it fail, then in `payment-router.ts` (with the other `adminOnly` routes):

```ts
router.get('/api/payments/reports/revenue', adminOnly, async (c) => {
  const report = await deps.getRevenueReport.execute();
  return c.json({ data: report });
});
```

Wire `getRevenueReport: new GetRevenueReportUseCase(invoiceRepo)` in `apps/payment/src/main.ts` (match the existing deps object).

- [ ] **Step 5: Run all payment tests and build, then commit**

Run: `pnpm turbo test --filter=payment && pnpm turbo build --filter=payment`
Expected: PASS.

```bash
git add apps/payment/src
git commit -m "feat(payment): revenue-by-currency report endpoint"
```

---

### Task 11: Admin Service — rewire the reports router (aggregate + enrich)

**Files:**
- Modify: `apps/admin/src/presentation/reports-router.ts` (rewrite)
- Modify: `apps/admin/src/presentation/enrichment.ts` (add `fetchLotSummary`, `fetchCategoryNameMap`)
- Modify: `apps/admin/src/main.ts` (line ~50: pass all clients)
- Test: `apps/admin/src/presentation/routers.test.ts` (extend)

**Interfaces:**
- Consumes: Task 9 endpoints (auction client), Task 10 endpoint (payment client), `GET /api/lots/:id` → `{ data: { title, categoryId, ... } }` (catalogue client), `GET /api/categories` → `{ data: CategoryNode[] }` tree (catalogue client), `GET /api/users/:id/email` → `{ email }` (user client — same as `fetchUserEmail`).
- Produces (consumed by Task 12 — matches what the Reports page already renders):
  - `GET /admin/api/reports/auction-results?from&to` → `{ data: { rows: Array<{ lotTitle: string | null; categoryName: string | null; finalBid: number | null; reserveMet: boolean; winnerEmail: string | null }>; summary: { totalLots: number; soldPercent: number; totalValue: number } } }`
  - `GET /admin/api/reports/revenue` → `{ data: { byCurrency: Record<string, number> } }` (passthrough)
  - `GET /admin/api/reports/unsold` → `{ data: Array<{ id: string; title: string | null; categoryName: string | null; highestBid: number | null }> }`
  - `GET /admin/api/reports/dashboard` → unchanged passthrough to the auction client.

- [ ] **Step 1: Extend enrichment helpers**

In `apps/admin/src/presentation/enrichment.ts` add (same fail-soft style as the existing helpers):

```ts
export interface LotSummary {
  title: string | null;
  categoryId: string | null;
}

export async function fetchLotSummary(
  catalogue: ServiceClient,
  lotId: string,
  token: string,
): Promise<LotSummary> {
  try {
    const res = await catalogue.get<{ data: { title?: string; categoryId?: string } }>(`/api/lots/${lotId}`, token);
    return { title: res.data?.title ?? null, categoryId: res.data?.categoryId ?? null };
  } catch {
    return { title: null, categoryId: null };
  }
}

export async function fetchCategoryNameMap(
  catalogue: ServiceClient,
  token: string,
): Promise<Map<string, string>> {
  try {
    // /api/categories returns a FLAT list ({ id, name, slug, parentId, displayOrder })
    // — see categoryListResponseSchema in @carat-room/shared-types
    const res = await catalogue.get<{ data: Array<{ id: string; name: string }> }>('/api/categories', token);
    const categories = Array.isArray(res.data) ? res.data : [];
    return new Map(categories.map(category => [category.id, category.name]));
  } catch {
    return new Map();
  }
}
```

- [ ] **Step 2: Write failing router tests**

In `apps/admin/src/presentation/routers.test.ts`, add reports cases with fake clients:
- `GET /admin/api/reports/auction-results?from=2026-06-01&to=2026-07-01`: auction client returns two rows (one SOLD with finalBid 1000/winner `u1`, one UNSOLD with finalBid null); catalogue returns lot titles/categoryIds and the category tree; user returns an email for `u1`. Assert the response has `rows` with `lotTitle`, `categoryName`, `winnerEmail` filled and `summary = { totalLots: 2, soldPercent: 50, totalValue: 1000 }`.
- `GET /admin/api/reports/revenue`: payment client called with `/api/payments/reports/revenue`, body passed through.
- `GET /admin/api/reports/unsold`: auction rows enriched with title/categoryName.

Run: `pnpm turbo test --filter=admin` — expected FAIL.

- [ ] **Step 3: Rewrite the router**

Replace `buildReportsRouter` in `apps/admin/src/presentation/reports-router.ts`:

```ts
import { type Context, Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';
import { fetchCategoryNameMap, fetchLotSummary, fetchUserEmail } from './enrichment';

type Ctx = Context;

const jwtPublicKey = (process.env['JWT_PUBLIC_KEY'] ?? '').replace(/\\n/g, '\n');
const tok = (c: Ctx) => c.req.header('Authorization')?.replace('Bearer ', '') ?? '';

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) {
      console.error('[proxy] ServiceError', err.status, JSON.stringify(err.body));
      return c.json(err.body, err.status as 400 | 500);
    }
    console.error('[proxy] Unexpected error:', err);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

interface AuctionResultRow {
  lotId: string;
  finalBid: number | null;
  reserveMet: boolean;
  winnerUserId: string | null;
  closedAt: string;
}

interface UnsoldRow {
  lotId: string;
  highestBid: number | null;
}

interface Clients {
  auction: ServiceClient;
  payment: ServiceClient;
  catalogue: ServiceClient;
  user: ServiceClient;
}

export function buildReportsRouter(clients: Clients): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });
  const { auction, payment, catalogue, user } = clients;

  r.get('/admin/api/reports/dashboard', auth, async c =>
    proxy(() => auction.get('/api/reports/dashboard', tok(c)), c));

  r.get('/admin/api/reports/auction-results', auth, async c =>
    proxy(async () => {
      const token = tok(c);
      const query = new URLSearchParams(c.req.query() as Record<string, string>);
      const res = await auction.get<{ data: AuctionResultRow[] }>(`/api/reports/results?${query}`, token);
      const categoryNames = await fetchCategoryNameMap(catalogue, token);

      const rows = await Promise.all(res.data.map(async row => {
        const [lot, winnerEmail] = await Promise.all([
          fetchLotSummary(catalogue, row.lotId, token),
          row.winnerUserId ? fetchUserEmail(user, row.winnerUserId, token) : Promise.resolve(null),
        ]);
        return {
          lotTitle: lot.title,
          categoryName: lot.categoryId ? categoryNames.get(lot.categoryId) ?? null : null,
          finalBid: row.finalBid,
          reserveMet: row.reserveMet,
          winnerEmail,
        };
      }));

      const totalLots = rows.length;
      const soldCount = rows.filter(row => row.reserveMet).length;
      const summary = {
        totalLots,
        soldPercent: totalLots === 0 ? 0 : Math.round((soldCount / totalLots) * 100),
        totalValue: rows.reduce((sum, row) => sum + (row.reserveMet ? row.finalBid ?? 0 : 0), 0),
      };
      return { data: { rows, summary } };
    }, c));

  r.get('/admin/api/reports/revenue', auth, async c =>
    proxy(() => payment.get('/api/payments/reports/revenue', tok(c)), c));

  r.get('/admin/api/reports/unsold', auth, async c =>
    proxy(async () => {
      const token = tok(c);
      const res = await auction.get<{ data: UnsoldRow[] }>('/api/reports/unsold', token);
      const categoryNames = await fetchCategoryNameMap(catalogue, token);

      const rows = await Promise.all(res.data.map(async row => {
        const lot = await fetchLotSummary(catalogue, row.lotId, token);
        return {
          id: row.lotId,
          title: lot.title,
          categoryName: lot.categoryId ? categoryNames.get(lot.categoryId) ?? null : null,
          highestBid: row.highestBid,
        };
      }));
      return { data: rows };
    }, c));

  return r;
}
```

- [ ] **Step 4: Fix the wiring**

In `apps/admin/src/main.ts` line ~50, replace:

```ts
app.route('/', buildReportsRouter(auction));
```

with:

```ts
app.route('/', buildReportsRouter({ auction, payment, catalogue, user }));
```

- [ ] **Step 5: Run tests and build, then commit**

Run: `pnpm turbo test --filter=admin && pnpm turbo build --filter=admin`
Expected: PASS.

```bash
git add apps/admin/src
git commit -m "fix(admin): aggregate reports across auction, payment, catalogue and user services"
```

---

### Task 12: Admin Portal — harden the Reports page

**Files:**
- Modify: `apps/admin-portal/src/app/admin/reports/page.tsx`

**Interfaces:**
- Consumes: Task 11 response shapes via the `/api/admin/[...path]` proxy route.
- Produces: a Reports page that shows an error message instead of crashing when any tab's request fails.

- [ ] **Step 1: Replace the fetcher and add error states**

In `apps/admin-portal/src/app/admin/reports/page.tsx`:

1. Replace the fetcher (checks `res.ok` — Lesson: parsing an error envelope as the success type moves the crash into rendering code):

```ts
const fetcher = async (url: string): Promise<unknown> => {
  const res = await fetch(url);
  const json: unknown = await res.json();
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return json;
};
```

2. In each tab, take `error` from `useSWR` and render a shared error line:

```tsx
function LoadError() {
  return <p className='text-sm text-destructive'>Could not load this report. Please try again.</p>;
}
```

`const { data, error } = useSWR(...)` and at the top of each tab's JSX: `if (error) return <LoadError />;`.

3. Guard shapes with optional chaining all the way down and update the row types to match Task 11 (nullable fields):

- `AuctionResult` becomes `{ lotTitle: string | null; categoryName: string | null; finalBid: number | null; reserveMet: boolean; winnerEmail: string | null }`; the Final Bid cell renders `(row.original.finalBid ?? 0).toLocaleString()`; Lot/Category/Winner cells render `row.original.lotTitle ?? '—'` etc.
- `UnsoldLot` becomes `{ id: string; title: string | null; categoryName: string | null; highestBid: number | null }`; **remove the Reserve column** (reserve price is deliberately never stored in the auction read model — spec deviation approved in this plan); the Highest Bid cell renders `(row.original.highestBid ?? 0).toLocaleString()`.
- Replace `data?.data.rows ?? []` with `data?.data?.rows ?? []`, `data?.data.summary` with `data?.data?.summary`, and `data.data.byCurrency` with `data?.data?.byCurrency ?? {}` (RevenueTab keeps its loading state via `if (!data && !error)`).

- [ ] **Step 2: Verify build and tests, then commit**

Run: `pnpm turbo build --filter=admin-portal && pnpm turbo test --filter=admin-portal`
Expected: PASS.

```bash
git add apps/admin-portal/src/app/admin/reports/page.tsx
git commit -m "fix(admin-portal): reports page handles request failures instead of crashing"
```

---

### Task 13: End-to-end verification and bug-report sign-off

**Files:**
- Modify: `docs/bugs-report.md` (tick fixed items)
- Modify: `docs/superpowers/plans/2026-07-09-admin-portal-bug-fixes.md` (tick checklist)

- [ ] **Step 1: Full build, tests and lint**

Run: `pnpm turbo build && pnpm turbo test && pnpm lint`
Expected: all green (lint includes the Clean Architecture layer checks).

- [ ] **Step 2: Browser-drive every fixed flow** (Lesson: schema tests are not verification — drive the actual flow)

With Docker Compose infrastructure and all services running (`docker compose up -d`, `pnpm turbo dev`), log into the admin portal and verify each flow end-to-end:

1. **Lots:** create a lot choosing a category from the dropdown → appears in the lots list. Submit an empty form → an error appears under every invalid field.
2. **Categories:** on an empty tree, click "New Category" → create a root category; then add a child via "+". Submit a duplicate slug → inline error message appears.
3. **Auctions:** schedule an auction picking dates from the native pickers → saves and appears in the auctions list (no "invalid start date"). Set end before start → inline error on the end field.
4. **Users:** click "New User" → create a BUYER → appears in the list; open it, edit country and email → values persist after reload; duplicate email → error message shown.
5. **Reports:** open all three tabs → data (or an empty table) renders; no crash. Stop the payment service and reload the Revenue tab → the error message renders instead of a crash.
6. **Auction management (Tasks 14–15):** the auctions list shows lot titles and current bids; "View" opens the detail page without crashing and shows bid history with bidder ids; "Schedule Auction" from the page header (no `?lotId=`) offers a lot picker and shows an inline error if no lot is selected.
7. **Enquiries (Task 19):** submit a valuation enquiry through the public endpoint (or user-portal form if wired) → it appears under `/admin/enquiries` with status NEW; mark it Responded → the badge updates.
8. **Dashboard (Task 20):** all four cards show real numbers; stop the payment service and reload → Pending Invoices shows '—', the other cards keep their values.
9. **Money path end-to-end (Tasks 16–18):** with all services up via Docker Compose, schedule a short auction, place a winning bid above reserve as a verified buyer, let it close → an invoice appears in the admin Invoices list with currency AUD; complete a Stripe test-mode payment → a fulfilment appears in the Fulfilments list; the RabbitMQ management UI (localhost:15672) shows the `payment.auction.closed` and `shipping.payment.received` queues bound to `carat.events` and consuming.

- [ ] **Step 3: Update the bug report and commit**

Mark each fixed item in `docs/bugs-report.md` (and fix its "Aution" → "Auction" typo — Boy Scout Rule), tick all checklist items in this plan, then:

```bash
git add docs/bugs-report.md docs/superpowers/plans/2026-07-09-admin-portal-bug-fixes.md
git commit -m "chore: mark admin-portal bug-fix plan tasks complete"
```

---

### Task 14: Auction list/detail contract repair (flow audit C7.1, C7.2, C7.4)

**Execution order note:** Tasks 14 and 15 run before Task 13 (verification) — Task 13 is always last.

**Files:**
- Modify: `apps/auction-engine/src/application/lot-query-repository.ts` (`BidRow` gains `userId`)
- Modify: `apps/auction-engine/src/infrastructure/postgres-lot-query-repository.ts` (select `user_id`)
- Modify: `apps/auction-engine/src/presentation/auction-router.ts` (bids route includes `userId` only for a valid ADMIN token)
- Modify: `apps/admin/src/presentation/auctions-router.ts` (enrich list/detail with lot titles; map `currentHighestBid` → `currentBid`; embed bids in the detail response)
- Modify: `apps/admin/src/main.ts` (`buildAuctionsRouter({ auction, catalogue })`)
- Tests: extend `postgres-lot-query-repository.test.ts`, `auction-router.test.ts`, `apps/admin/src/presentation/routers.test.ts`

**Interfaces:**
- Consumes: `fetchLotTitle` from `apps/admin/src/presentation/enrichment.ts`; `verifyJwt` from `@carat-room/shared-auth`; engine endpoints `/api/auctions`, `/api/auctions/:lotId`, `/api/auctions/:lotId/bids`.
- Produces (what the portal pages already render — this makes the backend honour the portal contract):
  - `GET /admin/api/auctions` → `{ data: Array<{ lotId; lotTitle: string | null; status; currentBid: number | null; endAt }> }`
  - `GET /admin/api/auctions/:lotId` → `{ data: { lotId; lotTitle: string | null; status; currentBid: number | null; bidCount; endAt; bids: Array<{ id; userId: string | null; amount; placedAt }> } }`
  - Engine `GET /api/auctions/:lotId/bids` with an ADMIN bearer token → bid rows include `userId`; without one, `userId` is omitted (privacy rule preserved for public callers).

- [ ] **Step 1: Engine — failing repository test, then include `user_id` in bid history**

Extend the `findBidHistory` test to assert rows carry `userId`. Then in `lot-query-repository.ts` change `BidRow` to:

```ts
export interface BidRow {
  id: string;
  userId: string;
  amount: number;
  placedAt: Date;
}
```

and in `postgres-lot-query-repository.ts` select and map it:

```ts
SELECT id, user_id, amount, placed_at
```
```ts
userId: r['user_id'] as string,
```

Run: `pnpm turbo test --filter=auction-engine -- postgres-lot-query-repository` — PASS.

- [ ] **Step 2: Engine — failing router test, then conditional `userId` serialisation**

Router tests: bids response includes `userId` when the request carries a valid ADMIN token; excludes it otherwise. Then in `auction-router.ts` `GET /api/auctions/:lotId/bids`:

```ts
import { verifyJwt } from '@carat-room/shared-auth';
```

```ts
const authHeader = c.req.header('Authorization')?.replace('Bearer ', '');
let isAdminCaller = false;
if (authHeader) {
  try {
    isAdminCaller = verifyJwt(authHeader, deps.jwtPublicKey).role === 'ADMIN';
  } catch {
    isAdminCaller = false;
  }
}
return c.json({
  data: result.bids.map(b => ({
    id: b.id,
    ...(isAdminCaller ? { userId: b.userId } : {}),
    amount: b.amount,
    placedAt: b.placedAt.toISOString(),
  })),
  meta: { page, total: result.total },
});
```

(Check `verifyJwt`'s exact signature in `packages/shared-auth` before writing the call — Lesson: open the source, don't assume.)

Run: `pnpm turbo test --filter=auction-engine && pnpm turbo build --filter=auction-engine` — PASS. Commit:

```bash
git add apps/auction-engine/src
git commit -m "feat(auction-engine): expose bidder ids in bid history to admin callers"
```

- [ ] **Step 3: Admin Service — failing proxy tests, then enrich list and detail**

Tests: `GET /admin/api/auctions` maps engine rows to `{ lotId, lotTitle, status, currentBid, endAt }` using the catalogue client; `GET /admin/api/auctions/:lotId` embeds `bids` fetched from `/api/auctions/:lotId/bids?pageSize=100`. Then rewrite the two GET routes in `apps/admin/src/presentation/auctions-router.ts`:

```ts
import { fetchLotTitle } from './enrichment';

interface EngineLotRow {
  lotId: string;
  status: string;
  currentHighestBid: number | null;
  bidCount: number;
  endAt: string;
}

interface Clients {
  auction: ServiceClient;
  catalogue: ServiceClient;
}

export function buildAuctionsRouter(clients: Clients): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });
  const { auction, catalogue } = clients;

  const toSummary = async (row: EngineLotRow, token: string) => ({
    lotId: row.lotId,
    lotTitle: await fetchLotTitle(catalogue, row.lotId, token),
    status: row.status,
    currentBid: row.currentHighestBid,
    bidCount: row.bidCount,
    endAt: row.endAt,
  });

  r.get('/admin/api/auctions', auth, async c =>
    proxy(async () => {
      const res = await auction.get<{ data: EngineLotRow[] }>('/api/auctions', tok(c));
      return { data: await Promise.all(res.data.map(row => toSummary(row, tok(c)))) };
    }, c));

  r.get('/admin/api/auctions/:lotId', auth, async c =>
    proxy(async () => {
      const lotId = c.req.param('lotId');
      const token = tok(c);
      const [detail, bids] = await Promise.all([
        auction.get<{ data: EngineLotRow }>(`/api/auctions/${lotId}`, token),
        auction.get<{ data: unknown[] }>(`/api/auctions/${lotId}/bids?pageSize=100`, token),
      ]);
      return { data: { ...(await toSummary(detail.data, token)), bids: bids.data } };
    }, c));
  // POST/PATCH/DELETE routes unchanged — they still use the auction client
```

Update `apps/admin/src/main.ts`: `buildAuctionsRouter({ auction, catalogue })`.

- [ ] **Step 4: Portal — align remaining types**

- `apps/admin-portal/src/app/admin/auctions/[lotId]/page.tsx`: drop `autoExtendWindowMinutes`/`autoExtendDurationMinutes` from `AuctionDetail` (never returned, never rendered); `lotTitle` becomes `string | null`, heading renders `auction.lotTitle ?? auction.lotId`.
- `apps/admin-portal/src/app/admin/auctions/[lotId]/_bids-table.tsx`: `userId` becomes `string | null` (`userId?: string` from the engine when the proxy token isn't admin — it always is here, but guard anyway); cell renders `row.original.userId ?? '—'`.
- `apps/admin-portal/src/app/admin/auctions/_table.tsx` and `auction-live-stats.tsx`: `lotTitle: string | null`; render `?? '—'`. `currentBid` now arrives populated — no code change beyond the type.

Run: `pnpm turbo test --filter=admin --filter=admin-portal && pnpm turbo build --filter=admin --filter=admin-portal` — PASS. Commit:

```bash
git add apps/admin/src apps/admin-portal/src/app/admin/auctions apps/admin-portal/src/components/auction-live-stats.tsx
git commit -m "fix(admin): enrich auction list and detail so the portal contract is honoured"
```

---

### Task 15: Schedule Auction — lot picker + rendered lotId error (flow audit C7.3)

**Files:**
- Create: `apps/admin-portal/src/app/admin/auctions/new/_schedule-form.tsx`
- Modify: `apps/admin-portal/src/app/admin/auctions/new/page.tsx` (becomes a server component)

**Interfaces:**
- Consumes: `adminApi.get<{ data: Lot[] }>('/admin/api/lots')` (`Lot = { id, title, categoryName, status, createdAt }` from `lots/_table.tsx`); `scheduleAuction` action (unchanged); `searchParams` for the pre-selected lot.
- Produces: `ScheduleAuctionForm({ lots, preselectedLotId }: { lots: Array<{ id: string; title: string }>; preselectedLotId?: string })`.

- [ ] **Step 1: Move the form to a client component with a lot Select**

Create `_schedule-form.tsx`: copy the current form body, then
- replace the hidden `lotId` input + `LotIdInput`/`Suspense` with a visible Select:

```tsx
<div className='space-y-1'>
  <Label htmlFor='lotId'>Lot</Label>
  <Select name='lotId' defaultValue={preselectedLotId}>
    <SelectTrigger id='lotId'><SelectValue placeholder='Select a lot' /></SelectTrigger>
    <SelectContent>
      {lots.map(lot => <SelectItem key={lot.id} value={lot.id}>{lot.title}</SelectItem>)}
    </SelectContent>
  </Select>
  <FieldError messages={state.errors?.lotId} />
</div>
```

- add the `FieldError` helper and render it for **every** field (`lotId`, `startAt`, `endAt`, `reservePrice`, `minBidIncrement`, `autoExtendWindowMinutes`, `autoExtendDurationMinutes`) plus the general `state.ok === false && !state.errors` server-error block (same as Task 2 Step 5).

- [ ] **Step 2: Convert the page to a server component**

Replace `apps/admin-portal/src/app/admin/auctions/new/page.tsx`:

```tsx
import { adminApi } from '@/lib/admin-api';
import { ScheduleAuctionForm } from './_schedule-form';

interface Lot {
  id: string;
  title: string;
  status: string;
}

export default async function NewAuctionPage({ searchParams }: { searchParams: Promise<{ lotId?: string }> }) {
  const { lotId } = await searchParams;
  const res = await adminApi.get<{ data: Lot[] }>('/admin/api/lots');
  const lots = (Array.isArray(res.data) ? res.data : []).map(lot => ({ id: lot.id, title: lot.title }));

  return (
    <div className='max-w-lg space-y-4'>
      <h1 className='text-2xl font-semibold'>Schedule Auction</h1>
      <ScheduleAuctionForm lots={lots} preselectedLotId={lotId} />
    </div>
  );
}
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm turbo build --filter=admin-portal && pnpm turbo test --filter=admin-portal` — PASS.

```bash
git add apps/admin-portal/src/app/admin/auctions/new
git commit -m "fix(admin-portal): lot picker and full error rendering on the schedule auction form"
```

---

### Task 16: Event backbone — required routing keys, queue names, exchange fix (C8.1–C8.3)

**Files:**
- Modify: `packages/shared-events/src/subscriber.ts` (+ its test)
- Modify: `apps/payment/src/infrastructure/auction-closed-consumer.ts`
- Modify: `apps/shipping/src/main.ts` (subscribe call)
- Modify: `infra/rabbitmq/definitions.json`

**Interfaces:**
- Produces: `EventSubscriber.subscribe<T>(queue: string, handler: (payload: T) => Promise<void>, routingKey: string): Promise<void>` — routing key now **required**; every queue is always bound to `carat.events`.

- [ ] **Step 1: Failing test — subscribe always binds**

In `packages/shared-events/src/subscriber.test.ts`, update/add: calling `subscribe('q', handler, 'some.key')` asserts `bindQueue('q', 'carat.events', 'some.key')` was called; the two-argument form no longer compiles (delete tests that rely on it).

- [ ] **Step 2: Make `routingKey` required**

In `subscriber.ts` change the signature to `routingKey: string` (drop the `?`) and remove the `if (routingKey)` guard — always `bindQueue`. Build the workspace to surface every consumer that now fails to compile: `pnpm turbo build` — expected failures in `apps/payment` and `apps/shipping` only (notification already passes keys).

- [ ] **Step 3: Fix the two consumers**

`apps/payment/src/infrastructure/auction-closed-consumer.ts`:

```ts
await subscriber.subscribe<AuctionClosedPayload>(
  'payment.auction.closed',
  async (event) => { /* unchanged handler */ },
  'auction.closed',
);
```

`apps/shipping/src/main.ts`:

```ts
await subscriber.subscribe<PaymentReceivedPayload>(
  'shipping.payment.received',
  async (payload) => { await paymentReceivedHandler.handle(payload); },
  'payment.received',
);
```

(Queue names switch to the dotted form so they match `definitions.json`.)

- [ ] **Step 4: Fix the exchange in definitions.json**

In `infra/rabbitmq/definitions.json` replace every `"platform.events"` with `"carat.events"` (the exchange declaration and all 12 bindings). Runtime code already asserts/binds `carat.events`, so this makes the pre-provisioned infra match reality instead of contradicting it.

- [ ] **Step 5: Verify and commit**

Run: `pnpm turbo build && pnpm turbo test`
Expected: PASS across the workspace.

```bash
git add packages/shared-events infra/rabbitmq/definitions.json apps/payment/src/infrastructure/auction-closed-consumer.ts apps/shipping/src/main.ts
git commit -m "fix(events): require queue bindings and align queue/exchange names"
```

---

### Task 17: Auction event payload contracts + default currency AUD (C8.4, C8.5)

**Files:**
- Modify: `apps/auction-engine/src/application/auction-event-publisher.ts` and `apps/auction-engine/src/infrastructure/rabbitmq-auction-publisher.ts` (type against shared payloads)
- Modify: the engine handlers that call the publisher (`close-auction-handler.ts`, `place-bid-handler.ts`, and the closing-soon call site — locate with `grep -r publishAuctionClosingSoon apps/auction-engine/src`)
- Modify: `apps/auction-engine/src/application/lot-query-repository.ts` + `postgres-lot-query-repository.ts` (add `findBidderIds`)
- Modify: `apps/payment/src/infrastructure/auction-closed-consumer.ts`
- Tests: extend the co-located tests of every file touched

**Interfaces:**
- Consumes: `BidPlacedPayload`, `AuctionClosingSoonPayload`, `AuctionClosedPayload` from `@carat-room/shared-types` (the canonical shapes — see `packages/shared-types/src/events/auction-events.ts`).
- Produces: engine events that actually match those types; invoices created with `currency = process.env['DEFAULT_CURRENCY'] ?? 'AUD'`.

- [ ] **Step 1: Type the publisher against shared payloads**

Change `AuctionEventPublisher` (application port) and `RabbitMQAuctionPublisher` so each method takes the shared payload type directly:

```ts
import type { AuctionClosedPayload, AuctionClosingSoonPayload, BidPlacedPayload } from '@carat-room/shared-types';

export interface AuctionEventPublisher {
  publishBidPlaced(payload: BidPlacedPayload): Promise<void>;
  publishAuctionClosingSoon(payload: AuctionClosingSoonPayload): Promise<void>;
  publishAuctionClosed(payload: AuctionClosedPayload): Promise<void>;
}
```

The infrastructure implementation forwards the payload verbatim to `publisher.publish(...)` — no more hand-built inline objects that can drift. The compiler now forces every call site to supply the missing fields.

- [ ] **Step 2: Fix the call sites (compiler-guided)**

Run `pnpm turbo build --filter=auction-engine` and fix each error:
- **`close-auction-handler.ts`** — supply `highestBidId` and `highestAmount` (both available on the aggregate's `AuctionClosedPayload` domain event: `highest_bid_id`, `highest_amount`) and `closedAt: new Date().toISOString()`.
- **`place-bid-handler.ts`** — supply `previousHighestBidderId` (read the highest bidder from the aggregate state **before** applying the new bid; open the aggregate to find the exact accessor) and `placedAt` (already produced for the domain event). Drop `bidCount`/`endAt` from the event or keep them as extra fields — the shared type is the minimum contract; do not remove fields the SSE broadcaster needs (check its usage first).
- **Closing-soon call site** — supply `activeBidderIds` via a new repository method:

```ts
// application/lot-query-repository.ts
findBidderIds(lotId: string): Promise<string[]>;
```

```ts
// infrastructure/postgres-lot-query-repository.ts
async findBidderIds(lotId: string): Promise<string[]> {
  const rows = await this.db`
    SELECT DISTINCT user_id FROM bids WHERE lot_id = ${lotId}
  `;
  return rows.map(r => r['user_id'] as string);
}
```

Write the failing test for `findBidderIds` first, in the existing repository test style.

- [ ] **Step 3: Fix the payment consumer (default currency AUD)**

In `apps/payment/src/infrastructure/auction-closed-consumer.ts`, delete the local `AuctionClosedPayload` interface, import the shared one, and:

```ts
import type { AuctionClosedPayload } from '@carat-room/shared-types';

const DEFAULT_CURRENCY = process.env['DEFAULT_CURRENCY'] ?? 'AUD';
```

```ts
if (!event.reserveMet || !event.winnerUserId || event.highestAmount == null) {
  return;
}
await createInvoiceUseCase.execute({
  lotId: event.lotId,
  winnerUserId: event.winnerUserId,
  amount: event.highestAmount,
  currency: DEFAULT_CURRENCY,
});
```

Add a consumer test: an `auction.closed` event with `reserveMet: true` creates an invoice with `currency: 'AUD'` and `amount = highestAmount`; `reserveMet: false` creates nothing.

- [ ] **Step 4: Verify and commit**

Run: `pnpm turbo build && pnpm turbo test`
Expected: PASS (notification-service compiles unchanged — it already consumes the shared types).

```bash
git add apps/auction-engine/src apps/payment/src packages/shared-types
git commit -m "fix(auction-engine,payment): honour shared event contracts; invoices default to AUD"
```

---

### Task 18: Deployment config alignment (C8.6, C8.7)

**Files:**
- Modify: `apps/shipping/src/main.ts` (env var name)
- Modify: `apps/admin/src/main.ts` (env var name + fallback host)
- Modify: `docker-compose.yml` (+ mirror any equivalent entries in `docker-compose.test.yml` and `.env.example` if they exist — check both)

- [ ] **Step 1: Shipping reads `RABBITMQ_URL`**

In `apps/shipping/src/main.ts` replace `process.env.AMQP_URL` with `process.env.RABBITMQ_URL` (variable name `amqpUrl` can stay; update the error message listing required vars). In `docker-compose.yml` add to `shipping-service.environment`:

```yaml
JWT_PUBLIC_KEY: ${JWT_PUBLIC_KEY}
```

- [ ] **Step 2: Admin service reaches the auction engine**

In `apps/admin/src/main.ts` line ~22 replace:

```ts
const auction   = new ServiceClient(process.env['AUCTION_SERVICE_URL']   ?? 'http://auction-service:3003');
```

with:

```ts
const auction   = new ServiceClient(process.env['AUCTION_ENGINE_URL']    ?? 'http://auction-engine:3003');
```

(compose already sets `AUCTION_ENGINE_URL` and the compose service is named `auction-engine`). In `docker-compose.yml` add to `admin-service.environment`:

```yaml
RABBITMQ_URL: amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672
ADMIN_DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/admin
```

and add `postgres`/`rabbitmq` `depends_on` conditions matching the other services. Verify the `admin` database is created by the postgres init script (`tests/db-init/init.sql` / `infra` init) — if not, add it there too.

- [ ] **Step 3: Sweep for other env drift**

Grep every service's `main.ts` for `process.env` and diff against its `docker-compose.yml` block — fix any further mismatches the same way (compose is the source of truth for names).

- [ ] **Step 4: Verify and commit**

Run: `pnpm turbo build && pnpm turbo test`, then `docker compose config` (validates the YAML and interpolation).

```bash
git add apps/shipping/src/main.ts apps/admin/src/main.ts docker-compose.yml
git commit -m "fix(infra): align service env var names with docker-compose"
```

---

### Task 19: Valuation enquiries — table, admin endpoints, admin UI (C9.1–C9.3)

**Blocker found during scoping:** no DDL for `valuation_enquiries` exists anywhere — the public submission endpoint (`POST /api/admin/enquiries/valuation`) fails at runtime with "relation does not exist". This task creates the table first.

**Files:**
- Create: `apps/admin/migrations/001_create_admin.sql`
- Modify: `tests/db-init/init.sql` (mirror the DDL — Lesson: the test DB bootstrap does not run service migrations)
- Modify: `apps/admin/src/infrastructure/postgres-enquiry-repository.ts` (+ test)
- Modify: `apps/admin/src/presentation/enquiries-router.ts` (+ routers test)
- Modify: `apps/admin/src/main.ts` (inject repository into the router deps)
- Create: `apps/admin-portal/src/app/admin/enquiries/page.tsx`, `apps/admin-portal/src/app/admin/enquiries/_table.tsx`, `apps/admin-portal/src/app/admin/enquiries/_actions.ts`
- Modify: `apps/admin-portal/src/components/layout/sidebar.tsx`

**Interfaces:**
- Produces:
  - `GET /admin/api/enquiries?status=` (adminOnly) → `{ data: EnquiryDto[] }` where `EnquiryDto = { id: string; category: string; artistMaker: string | null; description: string; photoKeys: string[]; name: string; email: string; status: 'NEW' | 'RESPONDED' | 'CLOSED'; createdAt: string }`
  - `PATCH /admin/api/enquiries/:id/status` body `{ status: 'RESPONDED' | 'CLOSED' }` → `{ data: { id } }`; `404` unknown id; `400` bad status.

- [ ] **Step 1: Create the table**

`apps/admin/migrations/001_create_admin.sql`:

```sql
CREATE TABLE valuation_enquiries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category     TEXT NOT NULL,
  artist_maker TEXT,
  description  TEXT NOT NULL,
  photo_keys   TEXT[] NOT NULL DEFAULT '{}',
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','RESPONDED','CLOSED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX valuation_enquiries_status_idx ON valuation_enquiries (status, created_at DESC);
```

Mirror the same DDL into `tests/db-init/init.sql` (in the admin DB section; create the section if the admin DB has none).

- [ ] **Step 2: Failing repository tests, then extend the repository**

Tests (existing fake-Db style): `findAll({ status: 'NEW' })` filters by status; `findAll({})` returns all ordered newest-first; `updateStatus(id, 'RESPONDED')` issues an UPDATE and returns false when no row matched. Then:

```ts
export type EnquiryStatus = 'NEW' | 'RESPONDED' | 'CLOSED';

export interface StoredValuationEnquiry extends ValuationEnquiry {
  id: string;
  status: EnquiryStatus;
  createdAt: Date;
}

// added methods
async findAll(filter: { status?: string }): Promise<StoredValuationEnquiry[]> {
  const rows = filter.status
    ? await this.db`SELECT * FROM valuation_enquiries WHERE status = ${filter.status} ORDER BY created_at DESC`
    : await this.db`SELECT * FROM valuation_enquiries ORDER BY created_at DESC`;
  return rows.map(mapEnquiryRow);
}

async updateStatus(id: string, status: EnquiryStatus): Promise<boolean> {
  const rows = await this.db`
    UPDATE valuation_enquiries SET status = ${status} WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}
```

with `mapEnquiryRow` translating snake_case columns to the DTO (`artist_maker` → `artistMaker`, `photo_keys` → `photoKeys`, `created_at` → `createdAt`).

- [ ] **Step 3: Failing router tests, then add admin endpoints**

The existing enquiries routes are public (customer submission) — the new ones are adminOnly. Extend `Deps` with the repository (or two use-case functions following the file's function-style deps), then:

```ts
router.get('/admin/api/enquiries', adminOnly, async (c) => {
  const enquiries = await deps.listEnquiries({ status: c.req.query('status') });
  return c.json({ data: enquiries });
});

router.patch('/admin/api/enquiries/:id/status', adminOnly, async (c) => {
  const { status } = await c.req.json<{ status?: string }>();
  if (status !== 'RESPONDED' && status !== 'CLOSED') {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'status must be RESPONDED or CLOSED' } }, 400);
  }
  const wasUpdated = await deps.updateEnquiryStatus(c.req.param('id'), status);
  if (!wasUpdated) return c.json({ error: { code: 'NOT_FOUND', message: 'Enquiry not found' } }, 404);
  return c.json({ data: { id: c.req.param('id') } });
});
```

where `adminOnly = authMiddleware(jwtPublicKey, { adminOnly: true })` (import as in the other routers) and `main.ts` wires `listEnquiries` / `updateEnquiryStatus` to the repository methods.

- [ ] **Step 4: Portal page**

- `_table.tsx`: columns Name, Email, Category, Status (`StatusBadge`), Received (`createdAt` date), and an actions cell with "Mark Responded" / "Close" buttons calling the server actions (buttons hidden when the status already matches).
- `_actions.ts`: `updateEnquiryStatus(id: string, status: 'RESPONDED' | 'CLOSED')` → `adminApi.patch('/admin/api/enquiries/${id}/status', { status })` + `revalidatePath('/admin/enquiries')`, returning `{ ok, error? }` like `categories/_actions.ts`.
- `page.tsx`: server component fetching `adminApi.get<{ data: EnquiryDto[] }>('/admin/api/enquiries')`, rendering an expandable description/photos detail per row or a simple table (keep to the DataTable pattern used everywhere else).
- `sidebar.tsx`: add `{ href: '/admin/enquiries', label: 'Enquiries', icon: MessageSquare }` (import `MessageSquare` from `lucide-react`).

- [ ] **Step 5: Verify and commit**

Run: `pnpm turbo build --filter=admin --filter=admin-portal && pnpm turbo test --filter=admin --filter=admin-portal`

```bash
git add apps/admin apps/admin-portal tests/db-init/init.sql
git commit -m "feat(admin): valuation enquiries table, endpoints and admin UI"
```

---

### Task 20: Real dashboard counts (C9.4, C9.5)

**Files:**
- Modify: `apps/payment/src/domain/invoice-repository.ts`, `postgres-invoice-repository.ts`, `payment-router.ts`, `main.ts` (+ tests)
- Modify: `apps/shipping/src/domain/fulfilment-repository.ts`, `infrastructure/db/postgres-fulfilment-repository.ts`, `presentation/shipping-router.ts`, `main.ts` (+ tests)
- Modify: `apps/auction-engine/src/application/lot-query-repository.ts`, `get-dashboard-stats-handler.ts`, `postgres-lot-query-repository.ts` (drop the two hard-coded zeros — the engine reports only what it owns)
- Modify: `apps/admin/src/presentation/reports-router.ts` (dashboard route aggregates three services, fail-soft)
- Modify: `apps/admin-portal/src/app/admin/dashboard/page.tsx` (nullable counts render '—')

**Interfaces:**
- Produces:
  - Payment `GET /api/payments/reports/pending-count` (adminOnly) → `{ data: { count: number } }` (invoices with status `AWAITING_PAYMENT`).
  - Shipping `GET /fulfilments/pending-count` (mounted → `/api/shipping/fulfilments/pending-count`) → `{ data: { count: number } }` (statuses `PENDING_CHOICE` + `PENDING_DISPATCH`). **Route-order caveat:** register it BEFORE `GET /fulfilments/:id` or `:id` swallows it.
  - Engine `GET /api/reports/dashboard` → `{ data: { activeAuctions: number; endingSoon: number } }` (breaking change to this internal endpoint; the admin service is its only consumer and is updated in the same task).
  - Admin `GET /admin/api/reports/dashboard` → `{ data: { activeAuctions: number | null; endingSoon: number | null; pendingInvoices: number | null; pendingFulfilments: number | null } }` — `null` when that service is unreachable (fail-soft, same philosophy as `enrichment.ts`).

- [ ] **Step 1: Payment count (TDD)**

Failing repo test: `countAwaitingPayment()` returns the fake Db's count. Implement:

```ts
// domain/invoice-repository.ts
countAwaitingPayment(): Promise<number>;
```

```ts
// infrastructure/postgres-invoice-repository.ts
async countAwaitingPayment(): Promise<number> {
  const rows = await this.db`
    SELECT COUNT(*)::int AS count FROM invoices WHERE status = 'AWAITING_PAYMENT'
  `;
  return rows[0]['count'] as number;
}
```

Route (next to the Task 10 revenue route, adminOnly): `GET /api/payments/reports/pending-count` → `c.json({ data: { count } })`. Update in-memory test doubles of `InvoiceRepository` faithfully (count their stored invoices).

- [ ] **Step 2: Shipping count (TDD)**

```ts
// domain/fulfilment-repository.ts
countByStatuses(statuses: string[]): Promise<number>;
```

```ts
// infrastructure/db/postgres-fulfilment-repository.ts
async countByStatuses(statuses: string[]): Promise<number> {
  const rows = await this.db`
    SELECT COUNT(*)::int AS count FROM fulfilments WHERE status = ANY(${statuses})
  `;
  return rows[0]['count'] as number;
}
```

(Verify the table/column names against the shipping migration before writing the test — Lesson.) Route in `shipping-router.ts`, registered **above** `router.get('/fulfilments/:id', ...)`:

```ts
router.get('/fulfilments/pending-count', async (c) => {
  const count = await deps.countPendingFulfilments();
  return c.json({ data: { count } });
});
```

wired in `main.ts` as `countPendingFulfilments: () => repo.countByStatuses(['PENDING_CHOICE', 'PENDING_DISPATCH'])`.

- [ ] **Step 3: Slim the engine's dashboard stats**

Remove `pendingInvoices`/`pendingFulfilments` from `DashboardStats`, the handler, the repository implementation and their tests — the engine no longer fabricates other services' numbers.

- [ ] **Step 4: Aggregate in the admin reports router**

Replace the dashboard passthrough (Task 11's version) with fail-soft aggregation:

```ts
const countOrNull = async (fetchCount: () => Promise<{ data: { count: number } }>): Promise<number | null> => {
  try {
    return (await fetchCount()).data.count;
  } catch {
    return null;
  }
};

r.get('/admin/api/reports/dashboard', auth, async c =>
  proxy(async () => {
    const token = tok(c);
    const [engineStats, pendingInvoices, pendingFulfilments] = await Promise.all([
      auction.get<{ data: { activeAuctions: number; endingSoon: number } }>('/api/reports/dashboard', token)
        .then(res => res.data).catch(() => null),
      countOrNull(() => payment.get('/api/payments/reports/pending-count', token) as Promise<{ data: { count: number } }>),
      countOrNull(() => shipping.get('/api/shipping/fulfilments/pending-count', token) as Promise<{ data: { count: number } }>),
    ]);
    return {
      data: {
        activeAuctions: engineStats?.activeAuctions ?? null,
        endingSoon: engineStats?.endingSoon ?? null,
        pendingInvoices,
        pendingFulfilments,
      },
    };
  }, c));
```

`buildReportsRouter`'s `Clients` gains `shipping: ServiceClient`; `main.ts` passes it: `buildReportsRouter({ auction, payment, catalogue, user, shipping })`. Router tests: all healthy → four numbers; payment client throwing → `pendingInvoices: null`, others intact.

- [ ] **Step 5: Portal renders '—' for null**

In `dashboard/page.tsx`, `DashboardStats` fields become `number | null` and the card value renders:

```tsx
<p className='text-3xl font-bold'>{value ?? '—'}</p>
```

- [ ] **Step 6: Verify and commit**

Run: `pnpm turbo build && pnpm turbo test`

```bash
git add apps/payment/src apps/shipping/src apps/auction-engine/src apps/admin/src apps/admin-portal/src/app/admin/dashboard
git commit -m "feat(admin): real pending counts on the dashboard, aggregated fail-soft"
```

---

## Self-Review (spec coverage, run after writing)

Re-read `docs/bugs-report.md` forward, line by line:

| Bug report line | Covered by |
|---|---|
| Lots — "Can't create a new lots" | Tasks 2 (C1.1–C1.4); root cause fixed at the form layer; backend `POST /admin/api/lots` verified to exist |
| Users — "No button to create a new user" | Tasks 4–7 (C2.1–C2.6) |
| Users — "Can't edit the user" | Tasks 4–6, 8 (C2.3, C2.4, C2.5, C2.7) |
| Categories — "There is no new button to create a category" | Task 3 (C3.1, C3.2) |
| Auction — "new aution can't save - showing invalid start date and end date" | Task 1 (C4.1–C4.3) |
| Reports — "Getting Errors when click the reports menu" | Tasks 9–12 (C5.1–C5.7) |
| *(flow audit, not in report)* auctions list blank titles/bids, detail-page crash, silent schedule failure | Tasks 14–15 (C7.1–C7.4) |
| *(full-functionality audit)* invoices/fulfilments never created (unbound queues, payload drift, no currency), env-var/compose mismatches | Tasks 16–18 (C8.1–C8.7); currency decision: **AUD** |
| *(small issues promoted to now)* enquiries table missing + no admin endpoints/UI; dashboard fake zeros | Tasks 19–20 (C9.1–C9.5) |
| *(upstream rebase b0249dd)* categories are a flat list not a tree; FAIR condition doesn't exist; new contract-schema + PGlite test-db infrastructure adopted | Header "Upstream context"; C1.5, C3.3; Tasks 2, 3, 11 updated |

Known deliberate deviations:
- Unsold report loses its Reserve column — reserve price is intentionally absent from the auction read model (`lot_status`), and exposing it would require projecting it, contradicting the migration's explicit "reserve_price is NEVER stored here" rule.
- Admin-created users start unverified (status `REGISTERED`) and receive the standard verification email — they must verify email/phone like self-registered buyers before bidding.
