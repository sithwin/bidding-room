# Lot Status & Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give lots a real, catalogue-owned Active/Inactive status (admin-editable) and a live, view-only auctionStatus sourced from auction-engine; fix the missing PATCH /api/lots/:id endpoint; resolve categoryName on the admin Lots list.

**Architecture:** Catalogue service owns `status` as a normal CRUD field on `Lot`. Auction-engine's event-sourced per-lot status stays exactly where it is — admin-service enriches the Lots list with a live read from auction-engine plus a category-name lookup, following the same fail-soft enrichment pattern already used by `reports-router.ts`. No new services, no new cross-service writes.

**Tech Stack:** Hono (catalogue, admin services), Next.js App Router + Server Actions (admin-portal), Postgres via the `postgres` tagged-template client (`Db`), Vitest, Zod (`@carat-room/shared-types`).

## Global Constraints

- British English in all comments/copy ("authorise", "cancelled").
- Named exports only, no `export default` (except Next.js page components, which require it).
- TypeScript strict mode, no `any`, no `@ts-ignore`.
- Single quotes for string literals.
- Boolean vars use `is`/`has`/`can`/`should`/`was`/`will` prefixes.
- Test files co-located, named `<file>.test.ts`.
- SQL only in `infrastructure/`. Domain/application layers never import Hono, pg, or amqplib.
- Auction-engine's event-sourced aggregate is never written to directly from another service — `auctionStatus` is always read-only outside auction-engine.
- Any migration must be mirrored into `tests/db-init/init.sql` in the same task.

---

### Task 1: Add `status` to the shared Lot response contract

**Files:**
- Modify: `packages/shared-types/src/api/catalogue.ts`
- Modify: `packages/shared-types/src/api/catalogue.test.ts`

**Interfaces:**
- Produces: `catalogueLotSchema` now requires `status: 'ACTIVE' | 'INACTIVE'` on every parsed lot. `LOT_ACTIVE_STATUSES` — `readonly ['ACTIVE', 'INACTIVE']` — exported for reuse by both catalogue and admin-portal.

This is the single source of truth every later task's response shape must match (existing lesson: declare a service's response types once in a shared module).

- [ ] **Step 1: Write the failing test**

Open `packages/shared-types/src/api/catalogue.test.ts`, find the `lotFixture` object used by the `lotListResponseSchema`/`lotResponseSchema` tests (around line 10-20), and add `status: 'ACTIVE'` to it. Add a new test right after the existing "should parse a valid lot list response" test:

```ts
it('should_rejectLot_when_statusMissing', () => {
  const { status, ...lotWithoutStatus } = lotFixture;
  const result = lotResponseSchema.safeParse({ data: lotWithoutStatus });
  expect(result.success).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/shared-types`
Expected: FAIL — `lotFixture` has no `status` property yet (TS error) and the new test can't find `status` to destructure.

- [ ] **Step 3: Add `status` to the schema**

In `packages/shared-types/src/api/catalogue.ts`, add this export right above `catalogueLotSchema`:

```ts
export const LOT_ACTIVE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const lotActiveStatusSchema = z.enum(LOT_ACTIVE_STATUSES);
```

Then add the field to `catalogueLotSchema`:

```ts
export const catalogueLotSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  auctionId: z.string().nullable(),
  categoryId: z.string().nullable(),
  condition: z.enum(['NEW', 'EXCELLENT', 'VERY_GOOD', 'GOOD']).nullable(),
  estimatedValue: z.number().nullable(),
  status: lotActiveStatusSchema,
  images: z.array(catalogueLotImageSchema),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

Add `lotActiveStatusSchema` and `LOT_ACTIVE_STATUSES` to the export list in `packages/shared-types/src/index.ts` next to the other `catalogue.ts` exports (find the line starting `catalogueLotSchema, catalogueLotImageSchema, lotListResponseSchema, lotResponseSchema,` and append `lotActiveStatusSchema, LOT_ACTIVE_STATUSES,` to it).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/shared-types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/api/catalogue.ts packages/shared-types/src/api/catalogue.test.ts packages/shared-types/src/index.ts
git commit -m "feat(shared-types): add status field to catalogue lot schema"
```

---

### Task 2: Migration — add `lots.status` column

**Files:**
- Create: `apps/catalogue/migrations/003_add_lot_status.sql`
- Modify: `tests/db-init/init.sql`

**Interfaces:**
- Produces: `lots.status` column, `NOT NULL DEFAULT 'ACTIVE'`, `CHECK (status IN ('ACTIVE', 'INACTIVE'))`. Consumed by Task 3's repository.

- [ ] **Step 1: Write the migration**

Create `apps/catalogue/migrations/003_add_lot_status.sql`:

```sql
-- Lot's own availability flag (Active/Inactive), owned by catalogue.
-- Distinct from auction-engine's event-sourced per-lot auction status.
ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE'));
```

- [ ] **Step 2: Mirror into the test DB bootstrap**

In `tests/db-init/init.sql`, find the block mirroring migration 002 (starts with `-- Migration 002: auctions and department`, ends around the `lots_department_idx` index — see lines 100-119). Immediately after that block, add:

```sql
-- Migration 003: lot status (mirrors apps/catalogue/migrations/003)
ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE'));
```

- [ ] **Step 3: Verify the migration applies cleanly**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: catalogue's `vitest.global-setup.ts` boots an embedded Postgres and applies every file in `apps/catalogue/migrations/` in filename order — if `003_add_lot_status.sql` has a syntax error, every catalogue test fails at setup. Confirm the existing test suite still passes (it will not yet exercise `status`, but this proves the migration itself is valid SQL).

- [ ] **Step 4: Commit**

```bash
git add apps/catalogue/migrations/003_add_lot_status.sql tests/db-init/init.sql
git commit -m "feat(catalogue): add lots.status column migration"
```

---

### Task 3: Domain, repository, and create-lot support for `status`

**Files:**
- Modify: `apps/catalogue/src/domain/lot.ts`
- Modify: `apps/catalogue/src/infrastructure/postgres-lot-repository.ts`
- Modify: `apps/catalogue/src/infrastructure/postgres-lot-repository.test.ts`
- Modify: `apps/catalogue/src/application/create-lot-use-case.ts`
- Modify: `apps/catalogue/src/application/use-cases.test.ts`

**Interfaces:**
- Consumes: `lots.status` column from Task 2.
- Produces: `Lot.status: LotActiveStatus` (`'ACTIVE' | 'INACTIVE'`), `CreateLotUseCase.execute(input)` accepts optional `status`, defaulting to `'ACTIVE'`. Consumed by Task 4 (update use case), Task 5 (router), Task 6 (admin-service guard).

- [ ] **Step 1: Write the failing repository test**

In `apps/catalogue/src/infrastructure/postgres-lot-repository.test.ts`, add a new test inside the existing `describe('PostgresLotRepository', ...)` block, after `'should_saveThenFindById_when_lotHasNoImages'`:

```ts
it('should_defaultStatusToActive_when_notProvidedOnSave', async () => {
  const lot = new Lot({
    id: '33333333-3333-3333-3333-333333333333',
    title: 'Unstatused Lot',
    description: null,
    categoryId: null,
    condition: LotCondition.Good,
    estimatedValue: 500,
    images: [],
    createdBy: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
    updatedAt: new Date('2026-06-20T00:00:00Z'),
  });

  await repo.save(lot);
  const found = await repo.findById(lot.id);

  expect(found!.status).toBe('ACTIVE');
});

it('should_persistInactiveStatus_when_saveThenFindById', async () => {
  const lot = new Lot({
    id: '44444444-4444-4444-4444-444444444444',
    title: 'Withdrawn Lot',
    description: null,
    categoryId: null,
    condition: LotCondition.Good,
    estimatedValue: 500,
    status: 'INACTIVE',
    images: [],
    createdBy: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
    updatedAt: new Date('2026-06-20T00:00:00Z'),
  });

  await repo.save(lot);
  const found = await repo.findById(lot.id);

  expect(found!.status).toBe('INACTIVE');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: FAIL — `Lot` constructor doesn't accept `status` yet (TypeScript error), and `found!.status` is `undefined`.

- [ ] **Step 3: Add `status` to the `Lot` domain object**

In `apps/catalogue/src/domain/lot.ts`, add above `LotProps`:

```ts
export type LotActiveStatus = 'ACTIVE' | 'INACTIVE';
```

In `LotProps`, add:

```ts
  status?: LotActiveStatus;
```

right after `estimatedValue: number | null;`. In the `Lot` class, add the field and constructor assignment:

```ts
  readonly status: LotActiveStatus;
```

right after `readonly estimatedValue: number | null;`, and in the constructor:

```ts
    this.status = props.status ?? 'ACTIVE';
```

right after `this.estimatedValue = props.estimatedValue;`.

- [ ] **Step 4: Persist `status` in the repository**

In `apps/catalogue/src/infrastructure/postgres-lot-repository.ts`:

Add `status: string;` to `LotRow` (after `estimated_value: string | null;`).

In `rowToLot`, add `status: row.status as LotActiveStatus,` after `estimatedValue: ...` — note this requires importing `LotActiveStatus` from `'../domain/lot'` (add it to the existing `import { Lot, LotCondition, LotImage } from '../domain/lot';` line).

In `findById`'s SELECT, add `status` to the column list:

```ts
      SELECT id, title, description, auction_id, category_id, condition, estimated_value, status, created_by, created_at, updated_at
      FROM lots WHERE id = ${id}
```

Do the same in `findAll`'s two SELECTs (the `SELECT id, title, description, auction_id, category_id, condition, estimated_value, created_by, created_at, updated_at FROM lots ...` string), adding `status` after `estimated_value`.

In `save`, add `status` to the INSERT:

```ts
    await this.db`
      INSERT INTO lots (id, title, description, auction_id, category_id, condition, estimated_value, status, created_by, created_at, updated_at)
      VALUES (
        ${lot.id}, ${lot.title}, ${lot.description}, ${lot.auctionId}, ${lot.categoryId},
        ${lot.condition}, ${lot.estimatedValue}, ${lot.status}, ${lot.createdBy},
        ${lot.createdAt}, ${lot.updatedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        auction_id = EXCLUDED.auction_id,
        category_id = EXCLUDED.category_id,
        condition = EXCLUDED.condition,
        estimated_value = EXCLUDED.estimated_value,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
    `;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: PASS for both new repository tests.

- [ ] **Step 6: Write the failing CreateLotUseCase test**

In `apps/catalogue/src/application/use-cases.test.ts`, find `describe('ListLotsUseCase', ...)` (there is currently no `describe('CreateLotUseCase', ...)` block) and add a new one right after it:

```ts
describe('CreateLotUseCase', () => {
  it('should_defaultStatusToActive_when_notProvided', async () => {
    const mockRepo: LotRepository = { findById: vi.fn(), findAll: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };

    await new CreateLotUseCase(mockRepo).execute({ title: 'Diamond Ring' });

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.status).toBe('ACTIVE');
  });

  it('should_useProvidedStatus_when_given', async () => {
    const mockRepo: LotRepository = { findById: vi.fn(), findAll: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };

    await new CreateLotUseCase(mockRepo).execute({ title: 'Diamond Ring', status: 'INACTIVE' });

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.status).toBe('INACTIVE');
  });
});
```

Add `CreateLotUseCase` to the imports at the top of the file: `import { CreateLotUseCase } from './create-lot-use-case';`.

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: FAIL — `CreateLotInput` has no `status` property (TS error).

- [ ] **Step 8: Add `status` to `CreateLotUseCase`**

In `apps/catalogue/src/application/create-lot-use-case.ts`, add to `CreateLotInput`:

```ts
  status?: LotActiveStatus;
```

after `estimatedValue?: number;` (update the import to `import { Lot, LotActiveStatus, LotCondition } from '../domain/lot';`). In `execute`, add to the `new Lot({...})` call:

```ts
      status: input.status ?? 'ACTIVE',
```

after `estimatedValue: input.estimatedValue ?? null,`.

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/catalogue/src/domain/lot.ts apps/catalogue/src/infrastructure/postgres-lot-repository.ts apps/catalogue/src/infrastructure/postgres-lot-repository.test.ts apps/catalogue/src/application/create-lot-use-case.ts apps/catalogue/src/application/use-cases.test.ts
git commit -m "feat(catalogue): persist and default lot status (ACTIVE/INACTIVE)"
```

---

### Task 4: `UpdateLotUseCase` and `PATCH /api/lots/:id`

**Files:**
- Create: `apps/catalogue/src/application/update-lot-use-case.ts`
- Modify: `apps/catalogue/src/application/use-cases.test.ts`
- Modify: `apps/catalogue/src/main.ts`

**Interfaces:**
- Consumes: `LotRepository` (Task 3), `LotNotFoundError` (`apps/catalogue/src/domain/errors.ts`).
- Produces: `UpdateLotUseCase.execute(id: string, input: UpdateLotInput): Promise<void>` where `UpdateLotInput` is `Partial<{ title, description, categoryId, condition, estimatedValue, status }>`. Throws `LotNotFoundError` if the lot doesn't exist. `PATCH /api/lots/:id` route in `main.ts`, matching the admin-service proxy that already exists at `apps/admin/src/presentation/lots-router.ts:35-36`.

This fixes the previously-missing endpoint — lot editing was completely broken before this task regardless of the status field.

- [ ] **Step 1: Write the failing test**

In `apps/catalogue/src/application/use-cases.test.ts`, add a new `describe` block after `describe('CreateLotUseCase', ...)`:

```ts
describe('UpdateLotUseCase', () => {
  it('should_throw_when_lotDoesNotExist', async () => {
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(null), findAll: vi.fn(), save: vi.fn() };

    await expect(new UpdateLotUseCase(mockRepo).execute('nonexistent', { title: 'New Title' }))
      .rejects.toThrow(LotNotFoundError);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('should_applyOnlyProvidedFields_when_partialUpdate', async () => {
    const mockRepo: LotRepository = {
      findById: vi.fn().mockResolvedValue(buildLot()),
      findAll: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };

    await new UpdateLotUseCase(mockRepo).execute('lot-1', { title: 'Renamed Ring' });

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.title).toBe('Renamed Ring');
    expect(savedLot.estimatedValue).toBe(3000);
  });

  it('should_updateStatus_when_provided', async () => {
    const mockRepo: LotRepository = {
      findById: vi.fn().mockResolvedValue(buildLot()),
      findAll: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };

    await new UpdateLotUseCase(mockRepo).execute('lot-1', { status: 'INACTIVE' });

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.status).toBe('INACTIVE');
  });
});
```

Add `UpdateLotUseCase` to the imports: `import { UpdateLotUseCase } from './update-lot-use-case';`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: FAIL — `update-lot-use-case.ts` doesn't exist.

- [ ] **Step 3: Write `UpdateLotUseCase`**

Create `apps/catalogue/src/application/update-lot-use-case.ts`:

```ts
import { Lot, LotActiveStatus, LotCondition } from '../domain/lot';
import { LotRepository } from '../domain/lot-repository';
import { LotNotFoundError } from '../domain/errors';

export interface UpdateLotInput {
  title?: string;
  description?: string;
  categoryId?: string;
  condition?: LotCondition;
  estimatedValue?: number;
  status?: LotActiveStatus;
}

export class UpdateLotUseCase {
  constructor(private readonly lotRepository: LotRepository) {}

  async execute(id: string, input: UpdateLotInput): Promise<void> {
    const lot = await this.lotRepository.findById(id);
    if (!lot) {
      throw new LotNotFoundError(id);
    }

    const updatedLot = new Lot({
      id: lot.id,
      title: input.title ?? lot.title,
      description: input.description ?? lot.description,
      auctionId: lot.auctionId,
      categoryId: input.categoryId ?? lot.categoryId,
      condition: input.condition ?? lot.condition,
      estimatedValue: input.estimatedValue ?? lot.estimatedValue,
      status: input.status ?? lot.status,
      images: lot.images,
      createdBy: lot.createdBy,
      createdAt: lot.createdAt,
      updatedAt: new Date(),
    });

    await this.lotRepository.save(updatedLot);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: PASS

- [ ] **Step 5: Wire the PATCH route in `main.ts`**

In `apps/catalogue/src/main.ts`, add the import: `import { UpdateLotUseCase } from './application/update-lot-use-case';`.

Add to the `useCases` object (after `createLot: new CreateLotUseCase(lotRepository),`):

```ts
  updateLot: new UpdateLotUseCase(lotRepository),
```

Add the route after the existing `app.post('/api/lots', ...)` block (after its closing `});` around line 87):

```ts
app.patch('/api/lots/:id', authMiddleware(jwtPublicKey, { adminOnly: true }), async c => {
  const body = await c.req.json() as {
    title?: string;
    description?: string;
    categoryId?: string;
    condition?: string;
    estimatedValue?: number;
    status?: string;
  };
  if (body.status !== undefined && body.status !== 'ACTIVE' && body.status !== 'INACTIVE') {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'status must be ACTIVE or INACTIVE' } }, 400);
  }
  try {
    await useCases.updateLot.execute(c.req.param('id'), {
      title: body.title,
      description: body.description,
      categoryId: body.categoryId,
      condition: body.condition as LotCondition | undefined,
      estimatedValue: body.estimatedValue,
      status: body.status as 'ACTIVE' | 'INACTIVE' | undefined,
    });
    return c.json({ data: null });
  } catch (err) {
    if (err instanceof LotNotFoundError) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Lot not found' } }, 404);
    }
    throw err;
  }
});
```

This needs `LotCondition` and `LotNotFoundError` imported — add `LotCondition` to the existing lot import in `main.ts` (currently there may be none; add `import { LotCondition } from './domain/lot';`) and add `LotNotFoundError` to the existing `import { CategoryHasLotsError, CategoryNotFoundError, CategorySlugConflictError } from './domain/errors';` line, making it `import { CategoryHasLotsError, CategoryNotFoundError, CategorySlugConflictError, LotNotFoundError } from './domain/errors';`.

- [ ] **Step 6: Manually verify the route responds**

Run: `pnpm turbo build --filter=@carat-room/catalogue` (confirms no TypeScript errors in `main.ts`). There is no existing router-level test for routes defined directly in `main.ts` (the same is true for the pre-existing `POST /api/lots` and category routes) — this task follows that existing convention; correctness is covered by the `UpdateLotUseCase` unit tests above and by the end-to-end manual verification in the final task of this plan.

- [ ] **Step 7: Commit**

```bash
git add apps/catalogue/src/application/update-lot-use-case.ts apps/catalogue/src/application/use-cases.test.ts apps/catalogue/src/main.ts
git commit -m "feat(catalogue): add PATCH /api/lots/:id (was completely missing)"
```

---

### Task 5: Include `status` in lot API responses, exclude nothing else

**Files:**
- Modify: `apps/catalogue/src/presentation/catalogue-router.test.ts`

**Interfaces:**
- Consumes: `catalogueLotSchema` (Task 1), `Lot.status` (Task 3).

`GET /api/lots` and `GET /api/lots/:id` already serialize the full `Lot` domain object via `c.json({ data: lot })` (see `apps/catalogue/src/presentation/catalogue-router.ts:44-50, 52-71`) — no code change is needed there, since `Lot` now carries `status` and Hono's `c.json` serializes all enumerable class fields. This task only proves it with a test, since Task 1's shared schema is the contract this must satisfy.

- [ ] **Step 1: Write the failing test**

In `apps/catalogue/src/presentation/catalogue-router.test.ts`, update `buildLot()` to not special-case status (it will default to `'ACTIVE'` via the domain constructor from Task 3 — no change needed to `buildLot()` itself). Add a new test inside `describe('GET /api/lots/:id', ...)`, after the existing `'should_return200WithLot_when_lotExists'` test:

```ts
it('should_includeStatus_when_lotExists', async () => {
  const useCases = buildUseCases({ getLot: { execute: vi.fn().mockResolvedValue(buildLot()) } });
  const app = new Hono().route('/', buildCatalogueRouter(useCases));

  const res = await app.request('/api/lots/lot-1');

  const body = lotResponseSchema.parse(await res.json());
  expect(body.data.status).toBe('ACTIVE');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: FAIL — `lotResponseSchema.parse` throws because `Lot` (before Task 3 lands, if run standalone) has no `status`. If Tasks 1-4 are already applied in order, this passes immediately since `Lot.status` defaults to `'ACTIVE'` — in that case this step confirms it passes on the first run, which is fine; still run it once to see the schema validation actually exercised.

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/catalogue/src/presentation/catalogue-router.test.ts
git commit -m "test(catalogue): assert status is present in lot API responses"
```

---

### Task 6: Admin-service — reject scheduling an Inactive lot

**Files:**
- Modify: `apps/admin/src/presentation/auctions-router.ts`
- Modify: `apps/admin/src/presentation/routers.test.ts`

**Interfaces:**
- Consumes: `catalogue.get<{ data: { status: string } }>('/api/lots/:id', token)` (Task 5's response now includes `status`).
- Produces: `POST /admin/api/auctions` returns `409` with `{ error: { code: 'LOT_INACTIVE', message } }` when the target lot's `status` is `'INACTIVE'`; unchanged behaviour otherwise.

- [ ] **Step 1: Write the failing test**

In `apps/admin/src/presentation/routers.test.ts`, inside `describe('Auctions router', ...)`, add a new test after `'should_return200_when_schedulingAuction'`:

```ts
it('should_return409_when_schedulingInactiveLot', async () => {
  const auction = new ServiceClient('http://mock');
  const catalogue = new ServiceClient('http://mock');
  vi.mocked(catalogue.get).mockResolvedValue({ data: { id: 'lot-1', status: 'INACTIVE' } });
  const app = new Hono().route('/', buildAuctionsRouter({ auction, catalogue }));

  const res = await app.request('/admin/api/auctions', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ lotId: 'lot-1', startAt: '2026-07-01T10:00:00Z', endAt: '2026-07-01T12:00:00Z', reservePrice: 500, minBidIncrement: 10, autoExtendWindowMinutes: 3, autoExtendDurationMinutes: 3 }),
  });

  expect(res.status).toBe(409);
  expect(auction.post).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/admin`
Expected: FAIL — `POST /admin/api/auctions` currently proxies unconditionally, so `res.status` is `200`.

- [ ] **Step 3: Add the guard**

In `apps/admin/src/presentation/auctions-router.ts`, replace the `r.post('/admin/api/auctions', ...)` handler:

```ts
  r.post('/admin/api/auctions', auth, async c =>
    proxy(async () => auction.post('/api/auctions', tok(c), await c.req.json()), c));
```

with:

```ts
  r.post('/admin/api/auctions', auth, async c => {
    const token = tok(c);
    const body = await c.req.json() as { lotId?: string };
    if (body.lotId) {
      try {
        const lotRes = await catalogue.get<{ data: { status: string } }>(`/api/lots/${body.lotId}`, token);
        if (lotRes.data?.status === 'INACTIVE') {
          return c.json({ error: { code: 'LOT_INACTIVE', message: 'Cannot schedule an auction for an inactive lot' } }, 409);
        }
      } catch (err) {
        if (!(err instanceof ServiceError)) throw err;
        // Lot lookup failing (e.g. catalogue down) must not silently block scheduling — fall through to the proxy,
        // which will surface its own error if the lot truly doesn't exist.
      }
    }
    return proxy(async () => auction.post('/api/auctions', token, body), c);
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/admin`
Expected: PASS. Also re-run the existing `'should_return200_when_schedulingAuction'` test in the same file — it doesn't mock `catalogue.get` at all (uses the same `mockClient` for both `auction` and `catalogue`, see line 121: `buildAuctionsRouter({ auction: mockClient, catalogue: mockClient })`), so `catalogue.get` returns `undefined` by default. Confirm this doesn't throw — `lotRes.data?.status` on `undefined` is `undefined`, not `'INACTIVE'`, so it correctly falls through to scheduling. No test change needed there, but verify the full suite is green.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/presentation/auctions-router.ts apps/admin/src/presentation/routers.test.ts
git commit -m "feat(admin): block scheduling an auction for an inactive lot"
```

---

### Task 7: Admin-service — enrich the Lots list with `categoryName` and `auctionStatus`

**Files:**
- Modify: `apps/admin/src/presentation/enrichment.ts`
- Modify: `apps/admin/src/presentation/lots-router.ts`
- Modify: `apps/admin/src/main.ts`
- Modify: `apps/admin/src/presentation/routers.test.ts`

**Interfaces:**
- Consumes: `fetchCategoryNameMap` (already exists in `enrichment.ts`), auction-engine's `GET /api/auctions/:lotId` (returns `{ data: { status } }`, 404 if the lot has never been scheduled).
- Produces: `fetchLotAuctionStatus(auction: ServiceClient, lotId: string, token: string): Promise<string | null>`. `buildLotsRouter` now takes `{ catalogue: ServiceClient; auction: ServiceClient }` instead of a single `ServiceClient` — this is a **breaking signature change**, every call site must be updated in this task. `GET /admin/api/lots` and `GET /admin/api/lots/:id` responses gain `categoryName: string | null` and `auctionStatus: string | null | 'UNSCHEDULED'` on every lot.

- [ ] **Step 1: Write the failing test for the new enrichment helper**

`enrichment.ts` has no dedicated test file today (it's exercised indirectly through router tests) — this task keeps that convention and adds coverage via `routers.test.ts` instead of creating `enrichment.test.ts`, consistent with how `fetchLotTitle`/`fetchCategoryNameMap` are already tested only through `reports-router` tests.

In `apps/admin/src/presentation/routers.test.ts`, inside `describe('Lots router', ...)`, add three new tests after the existing `'should_propagateStatusCode_when_downstreamReturnsError'` test:

```ts
it('should_includeCategoryNameAndAuctionStatus_when_listingLots', async () => {
  const catalogue = new ServiceClient('http://mock');
  const auction = new ServiceClient('http://mock');
  vi.mocked(catalogue.get).mockImplementation(async (url: string) => {
    if (url === '/api/categories') return { data: [{ id: 'cat-1', name: 'Rings' }] };
    return { data: [{ id: 'lot-1', categoryId: 'cat-1', auctionId: 'auction-1' }], meta: { total: 1 } };
  });
  vi.mocked(auction.get).mockResolvedValue({ data: { status: 'LIVE' } });
  const app = new Hono().route('/', buildLotsRouter({ catalogue, auction }));

  const res = await app.request('/admin/api/lots', { headers: authHeader() });
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body.data[0].categoryName).toBe('Rings');
  expect(body.data[0].auctionStatus).toBe('LIVE');
});

it('should_setAuctionStatusUnscheduled_when_lotHasNoAuctionId', async () => {
  const catalogue = new ServiceClient('http://mock');
  const auction = new ServiceClient('http://mock');
  vi.mocked(catalogue.get).mockImplementation(async (url: string) => {
    if (url === '/api/categories') return { data: [] };
    return { data: [{ id: 'lot-1', categoryId: null, auctionId: null }], meta: { total: 1 } };
  });
  const app = new Hono().route('/', buildLotsRouter({ catalogue, auction }));

  const res = await app.request('/admin/api/lots', { headers: authHeader() });
  const body = await res.json();

  expect(body.data[0].auctionStatus).toBe('UNSCHEDULED');
  expect(auction.get).not.toHaveBeenCalled();
});

it('should_setAuctionStatusNull_when_auctionEngineLookupFails', async () => {
  const catalogue = new ServiceClient('http://mock');
  const auction = new ServiceClient('http://mock');
  vi.mocked(catalogue.get).mockImplementation(async (url: string) => {
    if (url === '/api/categories') return { data: [] };
    return { data: [{ id: 'lot-1', categoryId: null, auctionId: 'auction-1' }], meta: { total: 1 } };
  });
  vi.mocked(auction.get).mockRejectedValue(new ServiceError(500, { error: { code: 'INTERNAL_ERROR' } }));
  const app = new Hono().route('/', buildLotsRouter({ catalogue, auction }));

  const res = await app.request('/admin/api/lots', { headers: authHeader() });
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body.data[0].auctionStatus).toBeNull();
});
```

Update the four existing calls in `describe('Lots router', ...)` from `buildLotsRouter(mockClient)` to `buildLotsRouter({ catalogue: mockClient, auction: mockClient })` (the tests at `'should_return200_when_listingLots'`, `'should_return200_when_fetchingSingleLot'`, `'should_return200_when_postingNewLot'`, `'should_propagateStatusCode_when_downstreamReturnsError'`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/admin`
Expected: FAIL — `buildLotsRouter` doesn't accept an object yet (TS error), and the new tests can't find `categoryName`/`auctionStatus` on the response.

- [ ] **Step 3: Add `fetchLotAuctionStatus` to `enrichment.ts`**

In `apps/admin/src/presentation/enrichment.ts`, add at the end of the file:

```ts
export async function fetchLotAuctionStatus(
  auction: ServiceClient,
  lotId: string,
  token: string,
): Promise<string | null> {
  try {
    const res = await auction.get<{ data: { status?: string } }>(`/api/auctions/${lotId}`, token);
    return res.data?.status ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Rewrite `lots-router.ts` to take both clients and enrich responses**

Replace the full contents of `apps/admin/src/presentation/lots-router.ts` with:

```ts
import { type Context, Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';
import { fetchCategoryNameMap, fetchLotAuctionStatus } from './enrichment';

type Ctx = Context;

const jwtPublicKey = (process.env['JWT_PUBLIC_KEY'] ?? '').replace(/\\n/g, '\n');

function tok(c: Ctx): string {
  return c.req.header('Authorization')?.replace('Bearer ', '') ?? '';
}

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 401 | 403 | 404 | 409 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

interface CatalogueLot {
  id: string;
  categoryId: string | null;
  auctionId: string | null;
  [key: string]: unknown;
}

export interface LotsRouterClients {
  catalogue: ServiceClient;
  auction: ServiceClient;
}

async function enrichLot(
  lot: CatalogueLot,
  clients: LotsRouterClients,
  token: string,
  categoryNames: Map<string, string>,
): Promise<CatalogueLot & { categoryName: string | null; auctionStatus: string | null }> {
  const auctionStatus = lot.auctionId
    ? await fetchLotAuctionStatus(clients.auction, lot.id, token)
    : 'UNSCHEDULED';
  return {
    ...lot,
    categoryName: lot.categoryId ? categoryNames.get(lot.categoryId) ?? null : null,
    auctionStatus,
  };
}

export function buildLotsRouter(clients: LotsRouterClients): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });
  const { catalogue, auction } = clients;

  r.get('/admin/api/lots', auth, async c =>
    proxy(async () => {
      const token = tok(c);
      const query = new URLSearchParams(c.req.query() as Record<string, string>);
      const [lotsRes, categoryNames] = await Promise.all([
        catalogue.get<{ data: CatalogueLot[]; meta: unknown }>(`/api/lots?${query}`, token),
        fetchCategoryNameMap(catalogue, token),
      ]);
      const data = await Promise.all(
        lotsRes.data.map(lot => enrichLot(lot, clients, token, categoryNames)),
      );
      return { data, meta: lotsRes.meta };
    }, c));

  r.get('/admin/api/lots/:id', auth, async c =>
    proxy(async () => {
      const token = tok(c);
      const [lotRes, categoryNames] = await Promise.all([
        catalogue.get<{ data: CatalogueLot }>(`/api/lots/${c.req.param('id')}`, token),
        fetchCategoryNameMap(catalogue, token),
      ]);
      const data = await enrichLot(lotRes.data, clients, token, categoryNames);
      return { data };
    }, c));

  r.post('/admin/api/lots', auth, async c =>
    proxy(async () => catalogue.post('/api/lots', tok(c), await c.req.json()), c));

  r.patch('/admin/api/lots/:id', auth, async c =>
    proxy(async () => catalogue.patch(`/api/lots/${c.req.param('id')}`, tok(c), await c.req.json()), c));

  r.delete('/admin/api/lots/:id', auth, async c =>
    proxy(() => catalogue.delete(`/api/lots/${c.req.param('id')}`, tok(c)), c));

  r.post('/admin/api/lots/:id/images/upload-url', auth, async c =>
    proxy(async () => catalogue.post(`/api/lots/${c.req.param('id')}/images/upload-url`, tok(c), await c.req.json()), c));

  r.delete('/admin/api/lots/:id/images/:imageId', auth, async c =>
    proxy(() => catalogue.delete(`/api/lots/${c.req.param('id')}/images/${c.req.param('imageId')}`, tok(c)), c));

  r.patch('/admin/api/lots/:id/images/reorder', auth, async c =>
    proxy(async () => catalogue.patch(`/api/lots/${c.req.param('id')}/images/reorder`, tok(c), await c.req.json()), c));

  return r;
}
```

(The `/images/confirm` proxy route is added separately by the lot-image-management plan — out of scope here.)

- [ ] **Step 5: Update the `main.ts` call site**

In `apps/admin/src/main.ts`, change:

```ts
  app.route('/', buildLotsRouter(catalogue));
```

to:

```ts
  app.route('/', buildLotsRouter({ catalogue, auction }));
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/admin`
Expected: PASS for all Lots router tests, including the three new enrichment tests.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/presentation/enrichment.ts apps/admin/src/presentation/lots-router.ts apps/admin/src/main.ts apps/admin/src/presentation/routers.test.ts
git commit -m "feat(admin): enrich lots list with categoryName and live auctionStatus"
```

---

### Task 8: `StatusBadge` — add the missing variants

**Files:**
- Modify: `apps/admin-portal/src/components/status-badge.tsx`
- Modify: `apps/admin-portal/src/components/status-badge.test.tsx`

**Interfaces:**
- Produces: `STATUS_VARIANTS` now covers `INACTIVE`, `DRAFT`, `CLOSING`, `SOLD`, `UNSOLD`, `UNSCHEDULED` in addition to the existing entries.

- [ ] **Step 1: Write the failing test**

In `apps/admin-portal/src/components/status-badge.test.tsx`, add after `'should_applyDestructiveVariant_when_statusIsCancelled'`:

```ts
it('should_applyDestructiveVariant_when_statusIsInactive', () => {
  const { container } = render(<StatusBadge status='INACTIVE' />);
  expect(container.firstChild).toHaveClass('destructive');
});

it('should_applyDefaultVariant_when_statusIsSold', () => {
  const { container } = render(<StatusBadge status='SOLD' />);
  expect(container.firstChild).toHaveClass('default');
});

it('should_applyOutlineVariant_when_statusIsUnscheduled', () => {
  render(<StatusBadge status='UNSCHEDULED' />);
  expect(screen.getByText('UNSCHEDULED')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/admin-portal`
Expected: FAIL — `INACTIVE` and `SOLD` currently fall through to the `outline` variant, not `destructive`/`default`.

- [ ] **Step 3: Add the missing variants**

In `apps/admin-portal/src/components/status-badge.tsx`, replace the `STATUS_VARIANTS` object:

```ts
const STATUS_VARIANTS: Record<string, BadgeProps['variant']> = {
  ACTIVE: 'default',
  INACTIVE: 'destructive',
  SCHEDULED: 'secondary',
  DRAFT: 'secondary',
  LIVE: 'default',
  CLOSING: 'destructive',
  CLOSED: 'secondary',
  SOLD: 'default',
  UNSOLD: 'secondary',
  UNSCHEDULED: 'outline',
  CANCELLED: 'destructive',
  PAID: 'default',
  UNPAID: 'secondary',
  EXPIRED: 'destructive',
  DISPATCHED: 'default',
  COLLECTED: 'default',
  PENDING: 'secondary',
  SUSPENDED: 'destructive',
  VERIFIED: 'default',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/admin-portal`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/components/status-badge.tsx apps/admin-portal/src/components/status-badge.test.tsx
git commit -m "feat(admin-portal): add status-badge variants for lot status and auctionStatus"
```

---

### Task 9: Lots list — split into Status and Auction Status columns

**Files:**
- Modify: `apps/admin-portal/src/app/admin/lots/_table.tsx`

**Interfaces:**
- Consumes: `status`, `categoryName`, `auctionStatus` now present on every lot returned by `GET /admin/api/lots` (Task 7).

No `_table.tsx` file in this codebase has a dedicated test file today (column definitions are exercised only by manual verification) — this task follows that existing convention. Correctness is confirmed in the final manual-verification task of this plan.

- [ ] **Step 1: Update the `Lot` interface and columns**

In `apps/admin-portal/src/app/admin/lots/_table.tsx`, replace the `Lot` interface:

```ts
export interface Lot {
  id: string;
  title: string;
  categoryName: string | null;
  status: string;
  auctionStatus: string | null;
  createdAt: string;
}
```

Replace the `columns` array's Category/Status entries:

```ts
const columns: ColumnDef<Lot>[] = [
  { accessorKey: 'title', header: 'Title' },
  {
    accessorKey: 'categoryName',
    header: 'Category',
    cell: ({ row }) => row.original.categoryName ?? '—',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'auctionStatus',
    header: 'Auction Status',
    cell: ({ row }) =>
      row.original.auctionStatus ? <StatusBadge status={row.original.auctionStatus} /> : '—',
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <div className='flex gap-2'>
        <Button variant='outline' size='sm' asChild>
          <Link href={`/admin/lots/${row.original.id}`}>Edit</Link>
        </Button>
        <Button variant='outline' size='sm' asChild>
          <Link href={`/admin/auctions/new?lotId=${row.original.id}`}>Schedule Auction</Link>
        </Button>
      </div>
    ),
  },
];
```

(Only the Category and Status column definitions changed, plus the new Auction Status column — the imports, `LotsTable` export, and Title/Created/actions columns stay as they are.)

- [ ] **Step 2: Type-check**

Run: `pnpm turbo build --filter=@carat-room/admin-portal`
Expected: PASS — confirms `Lot` and the column cell renderers type-check against the new fields.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/app/admin/lots/_table.tsx
git commit -m "feat(admin-portal): split lots list Status column into Status and Auction Status"
```

---

### Task 10: Lot form schema + create-lot form gain the Status field

**Files:**
- Modify: `apps/admin-portal/src/lib/schemas/lot.schema.ts`
- Modify: `apps/admin-portal/src/app/admin/lots/_actions.ts`
- Modify: `apps/admin-portal/src/app/admin/lots/_actions.test.ts`
- Modify: `apps/admin-portal/src/app/admin/lots/new/_new-lot-form.tsx`

**Interfaces:**
- Consumes: `LOT_ACTIVE_STATUSES` (`@carat-room/shared-types`, Task 1).
- Produces: `LotFormValues.status: 'ACTIVE' | 'INACTIVE'`, required on both create and edit (both forms already resubmit every field on save, matching the existing pattern — this is not a true partial update from the UI, even though the backend PATCH accepts partial bodies).

- [ ] **Step 1: Write the failing test**

In `apps/admin-portal/src/app/admin/lots/_actions.test.ts`, update the `createLot` test's `FormData` (inside `'should_callAdminApiPostAndReturn_when_formDataIsValid'`) to add:

```ts
fd.append('status', 'ACTIVE');
```

right after the `estimatedValue` append. Then add a new test in `describe('createLot', ...)`, after the existing two tests:

```ts
it('should_returnErrors_when_statusMissing', async () => {
  const fd = new FormData();
  fd.append('title', 'Emerald Ring');
  fd.append('description', 'Natural 2ct emerald');
  fd.append('categoryId', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  fd.append('condition', 'EXCELLENT');
  fd.append('estimatedValue', '3000');

  const result = await createLot({}, fd);

  expect(result).toMatchObject({ ok: false, errors: expect.objectContaining({ status: expect.any(Array) }) });
});
```

Add a new `describe('updateLot', ...)` block after `describe('createLot', ...)`:

```ts
describe('updateLot', () => {
  it('should_callAdminApiPatchWithStatus_when_formDataIsValid', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: null });

    const fd = new FormData();
    fd.append('title', 'Emerald Ring');
    fd.append('description', 'Natural 2ct emerald');
    fd.append('categoryId', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    fd.append('condition', 'EXCELLENT');
    fd.append('estimatedValue', '3000');
    fd.append('status', 'INACTIVE');

    const result = await updateLot('lot-1', {}, fd);

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/lots/lot-1', expect.objectContaining({ status: 'INACTIVE' }));
    expect(result).toEqual({ ok: true });
  });
});
```

Add `updateLot` to the existing `import { createLot, updateLot, deleteLot } from './_actions';` line (currently only imports `createLot, deleteLot` — confirm and adjust).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/admin-portal`
Expected: FAIL — `LotFormSchema` doesn't require or accept `status` yet.

- [ ] **Step 3: Add `status` to the schema**

In `apps/admin-portal/src/lib/schemas/lot.schema.ts`, add the import: `import { LOT_ACTIVE_STATUSES } from '@carat-room/shared-types';`. Add to `LotFormSchema`:

```ts
  status: z.enum(LOT_ACTIVE_STATUSES),
```

after `condition: LotCondition,`.

- [ ] **Step 4: Pass `status` through in the server actions**

In `apps/admin-portal/src/app/admin/lots/_actions.ts`, add `status: formData.get('status'),` to the `raw` object in both `createLot` and `updateLot` (after `estimatedValue: Number(formData.get('estimatedValue')),` in each).

- [ ] **Step 5: Add the Status select to the create form**

In `apps/admin-portal/src/app/admin/lots/new/_new-lot-form.tsx`, add the import: `import { LOT_ACTIVE_STATUSES } from '@carat-room/shared-types';`. Add this block after the Estimated Value field and before `<SubmitButton />`:

```tsx
      <div className='space-y-1'>
        <Label htmlFor='status'>Status</Label>
        <Select name='status' defaultValue='ACTIVE'>
          <SelectTrigger id='status'><SelectValue /></SelectTrigger>
          <SelectContent>
            {LOT_ACTIVE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <FieldError messages={state.errors?.status} />
      </div>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/admin-portal`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/admin-portal/src/lib/schemas/lot.schema.ts apps/admin-portal/src/app/admin/lots/_actions.ts apps/admin-portal/src/app/admin/lots/_actions.test.ts apps/admin-portal/src/app/admin/lots/new/_new-lot-form.tsx
git commit -m "feat(admin-portal): add Status field to lot form schema and create-lot form"
```

---

### Task 11: Edit-lot page — Status field, plus a confirm dialog when the auction is live

**Files:**
- Modify: `apps/admin-portal/src/app/admin/lots/[id]/page.tsx`
- Modify: `apps/admin-portal/src/app/admin/lots/[id]/_edit-form.tsx`

**Interfaces:**
- Consumes: `status`, `auctionStatus` now present on `GET /admin/api/lots/:id` (Task 7).
- Produces: editing is always allowed; if `auctionStatus === 'LIVE'`, submitting shows a confirmation dialog before the `PATCH` request fires (per the product decision captured in the spec).

There is no existing test file for `_edit-form.tsx` or `page.tsx` in this codebase (form components here are verified manually, not via component tests — see Task 10's action-level tests for the parts that are covered). This task follows that convention; the confirm-dialog behaviour specifically is verified in the final manual-verification task of this plan.

- [ ] **Step 1: Update `page.tsx`'s `Lot` interface and pass new fields through**

In `apps/admin-portal/src/app/admin/lots/[id]/page.tsx`, replace the `Lot` interface:

```ts
interface Lot {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  condition: string;
  estimatedValue: number;
  status: string;
  auctionStatus: string | null;
  images: LotImage[];
}
```

No other change is needed in this file — `lot` (containing the new fields) is already passed whole to `<EditLotForm lot={lot} categories={categories} />`.

- [ ] **Step 2: Add the Status field and live-auction confirm dialog to `_edit-form.tsx`**

Replace the full contents of `apps/admin-portal/src/app/admin/lots/[id]/_edit-form.tsx`:

```tsx
'use client';

import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { updateLot } from '../_actions';
import { LOT_CONDITIONS } from '@/lib/schemas/lot.schema';
import { LOT_ACTIVE_STATUSES } from '@carat-room/shared-types';
import type { CategoryOption } from '@/lib/categories';

interface Lot {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  condition: string;
  estimatedValue: number;
  status: string;
  auctionStatus: string | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type='submit' disabled={pending}>{pending ? 'Saving…' : 'Save Changes'}</Button>;
}

function FieldError({ messages }: { messages: string[] | undefined }) {
  if (!messages?.length) return null;
  return <p className='text-sm text-destructive'>{messages[0]}</p>;
}

export function EditLotForm({ lot, categories }: { lot: Lot; categories: CategoryOption[] }) {
  const router = useRouter();
  const boundAction = updateLot.bind(null, lot.id);
  const [state, formAction] = useActionState(boundAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const hasConfirmedRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (state.ok) router.push('/admin/lots');
  }, [state, router]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    if (lot.auctionStatus === 'LIVE' && !hasConfirmedRef.current) {
      e.preventDefault();
      setConfirmOpen(true);
    }
  }

  function handleConfirmSave(): void {
    hasConfirmedRef.current = true;
    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} className='space-y-4'>
        {state.ok === false && !state.errors && (
          <p className='rounded border border-destructive p-2 text-sm text-destructive'>
            Could not save the lot. Please try again.
          </p>
        )}
        <div className='space-y-1'>
          <Label htmlFor='title'>Title</Label>
          <Input id='title' name='title' defaultValue={lot.title} />
          <FieldError messages={state.errors?.title} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='description'>Description</Label>
          <Textarea id='description' name='description' rows={4} defaultValue={lot.description} />
          <FieldError messages={state.errors?.description} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='categoryId'>Category</Label>
          <Select name='categoryId' defaultValue={lot.categoryId}>
            <SelectTrigger id='categoryId'><SelectValue placeholder='Select a category' /></SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError messages={state.errors?.categoryId} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='condition'>Condition</Label>
          <Select name='condition' defaultValue={lot.condition}>
            <SelectTrigger id='condition'><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOT_CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError messages={state.errors?.condition} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='estimatedValue'>Estimated Value</Label>
          <Input id='estimatedValue' name='estimatedValue' type='number' min={0} step={0.01} defaultValue={lot.estimatedValue} />
          <FieldError messages={state.errors?.estimatedValue} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='status'>Status</Label>
          <Select name='status' defaultValue={lot.status}>
            <SelectTrigger id='status'><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOT_ACTIVE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError messages={state.errors?.status} />
        </div>
        <SubmitButton />
      </form>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This lot&apos;s auction is currently live</AlertDialogTitle>
            <AlertDialogDescription>
              Bidders are actively bidding on this lot right now. Save changes anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSave}>Save Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm turbo build --filter=@carat-room/admin-portal`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/admin-portal/src/app/admin/lots/[id]/page.tsx apps/admin-portal/src/app/admin/lots/[id]/_edit-form.tsx
git commit -m "feat(admin-portal): add Status field and live-auction confirm dialog to edit-lot form"
```

---

### Task 12: Schedule Auction page — exclude Inactive lots from the picker

**Files:**
- Modify: `apps/admin-portal/src/app/admin/auctions/new/page.tsx`

**Interfaces:**
- Consumes: `status` field on lots returned by `GET /admin/api/lots` (Task 7 — was already declared in this file's `Lot` interface but never used).

This is defense-in-depth alongside Task 6's backend `409` — filtering here means an admin never sees an Inactive lot in the picker at all, rather than discovering the block only after submitting. No test file exists for this server component today (same convention as Task 11); verified manually in the final task.

- [ ] **Step 1: Filter out Inactive lots**

In `apps/admin-portal/src/app/admin/auctions/new/page.tsx`, replace:

```ts
  const lots = (Array.isArray(res.data) ? res.data : []).map(lot => ({ id: lot.id, title: lot.title }));
```

with:

```ts
  const lots = (Array.isArray(res.data) ? res.data : [])
    .filter(lot => lot.status !== 'INACTIVE')
    .map(lot => ({ id: lot.id, title: lot.title }));
```

- [ ] **Step 2: Type-check**

Run: `pnpm turbo build --filter=@carat-room/admin-portal`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/app/admin/auctions/new/page.tsx
git commit -m "feat(admin-portal): hide inactive lots from the Schedule Auction picker"
```

---

### Task 13: Full workspace verification and manual browser walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Run every affected workspace's test suite**

```bash
pnpm turbo test --filter=@carat-room/shared-types --filter=@carat-room/catalogue --filter=@carat-room/admin --filter=@carat-room/admin-portal
```

Expected: all green.

- [ ] **Step 2: Run the full build**

```bash
pnpm turbo build
```

Expected: no TypeScript errors anywhere in the monorepo (confirms nothing outside the four touched workspaces references the old `buildLotsRouter(client)` single-argument signature or the old `Lot`/`LotFormValues` shapes).

- [ ] **Step 3: Run `pnpm lint`**

Expected: passes — confirms no Clean Architecture layer-boundary violations were introduced (e.g. no SQL leaked outside `apps/catalogue/src/infrastructure/`).

- [ ] **Step 4: Manual browser walkthrough (required — do not skip)**

Start the stack per `CLAUDE.md` (`docker compose up -d`, then `pnpm turbo dev`), then in a real browser:

1. Go to `/admin/lots/new`, create a lot with Status = Active. Confirm it appears on `/admin/lots` with an "ACTIVE" badge in the Status column and "UNSCHEDULED" in the Auction Status column, and a real category name (not blank) in the Category column.
2. Create a second lot with Status = Inactive.
3. Go to `/admin/auctions/new` — confirm the Inactive lot does **not** appear in the Lot dropdown, and the Active lot does.
4. Edit the Active lot at `/admin/lots/[id]` — change its title and save. Confirm the change persists (this proves `PATCH /api/lots/:id` now actually works — it did not exist before this plan).
5. Schedule an auction for the Active lot, then edit that same lot again while its auction is live — confirm the "This lot's auction is currently live" dialog appears before saving, and that clicking "Save Anyway" actually saves.
6. Go back to `/admin/lots` — confirm the Active lot's Auction Status badge now shows the real live status (e.g. "LIVE"), not blank.

- [ ] **Step 5: Report completion**

Once all six manual checks pass, this plan is complete. Do not mark it done based on automated tests alone — Steps 1-3 catch regressions, but only Step 4 proves the actual bug (blank Category/Status columns, broken edit) is fixed.
