# API Contract Testing — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contract drift between user-portal and the catalogue service — response shapes, query param names, SQL columns — fails `pnpm turbo test` on every run, with the catalogue seam as the reference implementation for later phases.

**Architecture:** Shared Zod schemas in `packages/shared-types/src/api/` are the single source of truth. Catalogue router tests parse every response through them (producer side); user-portal fetchers `safeParse` through them with graceful fallbacks (consumer side); typed query builders make param-name drift a compile error; a new `packages/test-db` PGlite harness runs the catalogue's real migrations in unit tests to catch phantom-column SQL.

**Tech Stack:** Zod ^3.25.76, @electric-sql/pglite + @electric-sql/pglite-socket, vitest 1.6, postgres.js, Turborepo/pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-07-08-api-contract-testing-design.md` (Phases 2–4 get their own plans later.)

## Global Constraints

- British English in comments and copy; single quotes; named exports only; no `var`; strict TS, no `@ts-ignore` in production code.
- Test files co-located with sources, named `<filename>.test.ts`. No `__tests__` directories.
- No service production-code behaviour changes: producer enforcement lives in tests only.
- Portals must never crash on a malformed response: consumer parse failures log via `console.error` and return the declared fallback.
- Schemas document the routers' *actual* output — when writing a schema, read the router and repository serialisation; never write from memory.
- `packages/test-db` must not override an externally set `TEST_DATABASE_URL`.
- Commit after every task.

## Spec Coverage Checklist

Built from the spec, forward, paragraph by paragraph. Every task cites the items it satisfies.

- C1. `envelope(data)` / `listEnvelope(item)` helpers in `shared-types/src/api/envelope.ts`, with permissive `meta` (`total` required; `limit`, `offset`, `page` optional).
- C2. Zod added as a runtime dependency of shared-types (^3.25.76, matching the portals).
- C3. Catalogue schemas cover every response the service produces: lots list, lot by id, lot search, categories, auctions list, auction by id, facets — matching actual serialisation including nullable fields and ISO date strings.
- C4. Inferred TS types exported (`z.infer`) so consumers stop declaring inline types.
- C5. Typed query builders exported next to the schemas; parameter object keys are exactly the names the router reads (`lotsQuery`: auctionId, categoryId, condition, minValue, maxValue, limit, offset; `auctionsQuery`: status, limit).
- C6. Catalogue router tests use each query builder in at least one request.
- C7. Every catalogue router test that reads a body parses it with the shared schema (producer enforcement).
- C8. User-portal fetch boundary parses with `safeParse`; failure → `console.error` + fallback; empty states render, never a crash.
- C9. Portal tests assert strict `parse`; all portal fixtures typed `satisfies z.infer<typeof …>`.
- C10. Inline `as { … }` casts on `res.json()` removed from every user-portal ↔ catalogue seam — **except** `src/app/auctions/[auctionId]/lots/[lotId]/page.tsx` (see Known Exclusion below).
- C11. `packages/test-db` exports `startTestDb({ migrationsDir })` → `{ url, stop }`: boots PGlite, serves the wire protocol on a free localhost port, applies `migrations/*.sql` in filename order.
- C12. Per-service vitest `globalSetup` sets `TEST_DATABASE_URL` only when not already set (external DB always wins).
- C13. `createTestDb(url)` helper enforces a single connection (`max: 1`) for PGlite compatibility.
- C14. `packages/test-db` has its own vitest suite: boots, applies a fixture migration, accepts a valid query, rejects a phantom-column query.
- C15. Envelope helpers have unit tests in shared-types.
- C16. Catalogue repository tests (the nine currently red without Docker) run green via PGlite in `pnpm turbo test`.
- C17. PGlite fidelity for `uuid-ossp` and `tsvector` is verified in this phase before broader adoption.
- C18. Deliberate-drift smoke check: temporarily rename a serialised field, confirm the schema assertion fails, revert (manual verification, not committed).
- C19. Phases 2–4 (other services, admin, PGlite everywhere) are explicitly out of scope — separate plans.
- C20. Consumer runtime scope: SSE and non-JSON endpoints excluded from schemas.

## Known Exclusion: lot detail server page

`src/app/auctions/[auctionId]/lots/[lotId]/page.tsx` casts the catalogue's `{ data: … }` envelope to an imagined rich `Lot` (with `currentBid`, `currency`, `endAt`, `imageUrls`, `lotNumber`, …). `LotDetailClient` therefore receives `undefined` for every one of those fields and **crashes at runtime today** (`lot.currency.toUpperCase()`). Discovered 2026-07-08 during planning.

A correct conversion needs live-bid data from the auction-engine (`GET /api/auctions/:lotId`), which gets its schemas in **Phase 2** — that plan MUST convert this page as its first consumer task, merging `lotResponseSchema` (catalogue) with the auction-engine lot-status schema. Fixing it in Phase 1 would mean inventing placeholder bid values; deferred deliberately.

## File Structure

```
packages/shared-types/
  package.json                       — modify: add zod dependency
  src/index.ts                       — modify: export api modules
  src/api/envelope.ts                — create: envelope helpers
  src/api/envelope.test.ts           — create
  src/api/catalogue.ts               — create: schemas + query builders
  src/api/catalogue.test.ts          — create: builder + schema unit tests
  vitest.config.ts                   — create (package has no test setup today)

packages/test-db/
  package.json                       — create (dev-only, private)
  tsconfig.json                      — create
  src/index.ts                       — create: startTestDb, createTestDb
  src/index.test.ts                  — create
  fixtures/001_fixture.sql           — create: test migration

apps/catalogue/
  vitest.config.ts                   — modify: globalSetup + fileParallelism false
  vitest.global-setup.ts             — create
  package.json                       — modify: add @carat-room/test-db devDependency
  src/presentation/catalogue-router.test.ts — modify: schema parsing + builders
  src/presentation/auction-router.test.ts   — modify: schema parsing + builders
  src/presentation/facets-router.test.ts    — modify: schema parsing

apps/user-portal/
  package.json                       — modify: add @carat-room/shared-types dependency
  src/lib/catalogue.ts               — modify: parse via shared schemas
  src/lib/catalogue.test.ts          — create
  src/app/page.tsx                   — modify: schema-parsed fetchers; closing-soon renders estimates
  src/app/page.test.tsx              — modify: fixtures satisfy schemas
  src/app/auctions/browse-client.tsx — modify: use shared types/builders
  src/app/auctions/[auctionId]/page.tsx           — modify: parse auction envelope
  src/app/auctions/[auctionId]/catalogue-lots.tsx — modify: use shared types/builders
  src/app/auctions/[auctionId]/catalogue-lots.test.tsx — modify: fixtures satisfy schemas
  src/app/auctions/[auctionId]/lots/[lotId]/lot-detail-client.tsx — modify: use shared helpers
```

---

### Task 1: Envelope helpers in shared-types (C1, C2, C15)

**Files:**
- Modify: `packages/shared-types/package.json`
- Create: `packages/shared-types/vitest.config.ts`
- Create: `packages/shared-types/src/api/envelope.ts`
- Create: `packages/shared-types/src/api/envelope.test.ts`
- Modify: `packages/shared-types/src/index.ts`

**Interfaces:**
- Produces: `envelope<T extends z.ZodTypeAny>(data: T)` and `listEnvelope<T extends z.ZodTypeAny>(item: T)` — Zod object schemas. `listEnvelope` yields `{ data: T[]; meta: { total: number; limit?: number; offset?: number; page?: number } }`. Task 2 builds on these.

- [ ] **Step 1: Add zod and vitest to shared-types**

In `packages/shared-types/package.json` add:

```json
"dependencies": {
  "zod": "^3.25.76"
},
```

and to the existing `devDependencies` add `"vitest": "^1.6.0"`, and to `scripts` add `"test": "vitest run"`. Run `pnpm install` from the repo root.

Note: shared-types compiles with `tsc` using `.js` extension imports (see `src/index.ts`) — follow that convention in every new file here.

- [ ] **Step 2: Create `packages/shared-types/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 3: Write the failing test** — `packages/shared-types/src/api/envelope.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { envelope, listEnvelope } from './envelope.js';

describe('envelope', () => {
  it('should_parseSingleResourceEnvelope', () => {
    const schema = envelope(z.object({ id: z.string() }));
    expect(schema.parse({ data: { id: 'a' } }).data.id).toBe('a');
  });

  it('should_rejectMissingData', () => {
    const schema = envelope(z.object({ id: z.string() }));
    expect(schema.safeParse({ id: 'a' }).success).toBe(false);
  });
});

describe('listEnvelope', () => {
  it('should_parseListWithFullMeta', () => {
    const schema = listEnvelope(z.object({ id: z.string() }));
    const parsed = schema.parse({ data: [{ id: 'a' }], meta: { total: 1, limit: 20, offset: 0 } });
    expect(parsed.data).toHaveLength(1);
    expect(parsed.meta.total).toBe(1);
  });

  it('should_parseListWithPageMeta', () => {
    // auction-engine style meta: { page, total }
    const schema = listEnvelope(z.object({ id: z.string() }));
    expect(schema.safeParse({ data: [], meta: { total: 0, page: 1 } }).success).toBe(true);
  });

  it('should_rejectImaginedLotsShape', () => {
    // the exact drift that crashed the home page on 2026-07-08
    const schema = listEnvelope(z.object({ id: z.string() }));
    expect(schema.safeParse({ lots: [{ id: 'a' }] }).success).toBe(false);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm --filter @carat-room/shared-types exec vitest run src/api/envelope.test.ts`
Expected: FAIL — cannot resolve `./envelope.js`.

- [ ] **Step 5: Implement** — `packages/shared-types/src/api/envelope.ts`

```ts
import { z } from 'zod';

// Standard single-resource envelope: { data: <resource> }
export const envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ data });

// Standard list envelope: { data: [...], meta: {...} }.
// meta is permissive because services differ today (catalogue: total/limit/offset;
// auction-engine: page/total). Tighten per-service in that service's schema module.
export const listEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    meta: z.object({
      total: z.number(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      page: z.number().optional(),
    }),
  });
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm --filter @carat-room/shared-types exec vitest run src/api/envelope.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 7: Export from the package index**

Append to `packages/shared-types/src/index.ts`:

```ts
export { envelope, listEnvelope } from './api/envelope.js';
```

Run: `pnpm --filter @carat-room/shared-types build`
Expected: clean tsc build.

- [ ] **Step 8: Commit**

```bash
git add packages/shared-types
git commit -m "feat(shared-types): add zod API envelope helpers"
```

---

### Task 2: Catalogue schemas and query builders (C3, C4, C5)

**Files:**
- Create: `packages/shared-types/src/api/catalogue.ts`
- Create: `packages/shared-types/src/api/catalogue.test.ts`
- Modify: `packages/shared-types/src/index.ts`

**Interfaces:**
- Consumes: `envelope`, `listEnvelope` from Task 1.
- Produces (used by Tasks 3, 6, 7): `catalogueLotSchema`, `lotListResponseSchema`, `lotResponseSchema`, `lotSearchResponseSchema`, `categoryListResponseSchema`, `catalogueAuctionSchema`, `auctionListResponseSchema`, `auctionResponseSchema`, `facetsResponseSchema`; types `CatalogueLot`, `CatalogueAuction`, `CatalogueLotImage`; builders `lotsQuery(params)`, `auctionsQuery(params)` returning `URLSearchParams`.

These shapes were read from `apps/catalogue/src/presentation/*.ts` and the domain/repository serialisations on 2026-07-08. If a router changed since, **re-read the router first** — the schema must match the code, not this plan.

- [ ] **Step 1: Write the failing test** — `packages/shared-types/src/api/catalogue.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  lotListResponseSchema, auctionListResponseSchema, facetsResponseSchema,
  lotsQuery, auctionsQuery,
} from './catalogue.js';

const lotFixture = {
  id: 'lot-1', title: 'Cartier Love Ring', description: null, auctionId: 'auction-1',
  categoryId: null, condition: 'EXCELLENT', estimatedValue: 3000,
  images: [{ id: 'img-1', lotId: 'lot-1', url: 'https://a/x.jpg', thumbnailUrl: 'https://a/t.jpg', displayOrder: 0, isPrimary: true }],
  createdBy: null, createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z',
};

describe('catalogue schemas', () => {
  it('should_parseLotListEnvelope', () => {
    const parsed = lotListResponseSchema.parse({ data: [lotFixture], meta: { total: 1, limit: 20, offset: 0 } });
    expect(parsed.data[0].auctionId).toBe('auction-1');
  });

  it('should_rejectImaginedLotsShape', () => {
    expect(lotListResponseSchema.safeParse({ lots: [lotFixture] }).success).toBe(false);
  });

  it('should_parseAuctionList', () => {
    const parsed = auctionListResponseSchema.parse({
      data: [{ id: 'a1', title: 'June Sale', saleDate: '2026-07-20T10:00:00.000Z', location: 'Sydney', viewingDates: null, status: 'upcoming', lotCount: 42 }],
    });
    expect(parsed.data[0].lotCount).toBe(42);
  });

  it('should_parseFacets', () => {
    // facets deviates from the { data } envelope — schema documents reality
    const parsed = facetsResponseSchema.parse({ departments: [{ name: 'Jewellery', count: 3 }], auctions: [{ id: 'a1', title: 'June Sale' }] });
    expect(parsed.departments[0].count).toBe(3);
  });
});

describe('query builders', () => {
  it('should_buildLotsQueryWithBackendParamNames', () => {
    const qs = lotsQuery({ auctionId: 'a1', minValue: 100, maxValue: 500, limit: 24, offset: 24 });
    expect(qs.get('auctionId')).toBe('a1');
    expect(qs.get('minValue')).toBe('100');
    expect(qs.get('offset')).toBe('24');
    // the drifted names must not exist
    expect(qs.get('page')).toBeNull();
    expect(qs.get('minPrice')).toBeNull();
  });

  it('should_omitUndefinedParams', () => {
    expect(auctionsQuery({ status: 'upcoming' }).toString()).toBe('status=upcoming');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @carat-room/shared-types exec vitest run src/api/catalogue.test.ts`
Expected: FAIL — cannot resolve `./catalogue.js`.

- [ ] **Step 3: Implement** — `packages/shared-types/src/api/catalogue.ts`

```ts
import { z } from 'zod';
import { envelope, listEnvelope } from './envelope.js';

// ── Response schemas (match apps/catalogue routers exactly) ──

export const catalogueLotImageSchema = z.object({
  id: z.string(),
  lotId: z.string(),
  url: z.string(),
  thumbnailUrl: z.string(),
  displayOrder: z.number(),
  isPrimary: z.boolean(),
});

export const catalogueLotSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  auctionId: z.string().nullable(),
  categoryId: z.string().nullable(),
  condition: z.enum(['NEW', 'EXCELLENT', 'VERY_GOOD', 'GOOD']).nullable(),
  estimatedValue: z.number().nullable(),
  images: z.array(catalogueLotImageSchema),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const lotListResponseSchema = listEnvelope(catalogueLotSchema);
export const lotResponseSchema = envelope(catalogueLotSchema);

// GET /api/lots/search items (PostgresSearchRepository.search)
export const lotSearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  estimatedValue: z.number().nullable(),
  categoryId: z.string().nullable(),
});
export const lotSearchResponseSchema = listEnvelope(lotSearchResultSchema);

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  parentId: z.string().nullable(),
  displayOrder: z.number(),
});
export const categoryListResponseSchema = envelope(z.array(categorySchema));

export const auctionStatusSchema = z.enum(['upcoming', 'open', 'closed']);

// GET /api/auctions list items (buildAuctionRouter)
export const catalogueAuctionSchema = z.object({
  id: z.string(),
  title: z.string(),
  saleDate: z.string().nullable(),
  location: z.string().nullable(),
  viewingDates: z.string().nullable(),
  status: auctionStatusSchema,
  lotCount: z.number(),
});
export const auctionListResponseSchema = envelope(z.array(catalogueAuctionSchema));

// GET /api/auctions/:id (no lotCount; has timestamps)
export const auctionResponseSchema = envelope(z.object({
  id: z.string(),
  title: z.string(),
  saleDate: z.string().nullable(),
  location: z.string().nullable(),
  viewingDates: z.string().nullable(),
  status: auctionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}));

// GET /api/lots/facets — deviates from the { data } envelope; documents reality
export const facetsResponseSchema = z.object({
  departments: z.array(z.object({ name: z.string(), count: z.number() })),
  auctions: z.array(z.object({ id: z.string(), title: z.string() })),
});

export type CatalogueLot = z.infer<typeof catalogueLotSchema>;
export type CatalogueLotImage = z.infer<typeof catalogueLotImageSchema>;
export type CatalogueAuction = z.infer<typeof catalogueAuctionSchema>;

// ── Typed query builders — keys are exactly what the routers read ──

function toParams(entries: Record<string, string | number | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params;
}

export function lotsQuery(params: {
  auctionId?: string;
  categoryId?: string;
  condition?: 'NEW' | 'EXCELLENT' | 'VERY_GOOD' | 'GOOD';
  minValue?: number;
  maxValue?: number;
  limit?: number;
  offset?: number;
} = {}): URLSearchParams {
  return toParams(params);
}

export function auctionsQuery(params: {
  status?: 'upcoming' | 'open' | 'closed';
  limit?: number;
} = {}): URLSearchParams {
  return toParams(params);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @carat-room/shared-types exec vitest run src/api/catalogue.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Export and build**

Append to `packages/shared-types/src/index.ts`:

```ts
export {
  catalogueLotSchema, catalogueLotImageSchema, lotListResponseSchema, lotResponseSchema,
  lotSearchResultSchema, lotSearchResponseSchema, categorySchema, categoryListResponseSchema,
  auctionStatusSchema, catalogueAuctionSchema, auctionListResponseSchema, auctionResponseSchema,
  facetsResponseSchema, lotsQuery, auctionsQuery,
} from './api/catalogue.js';
export type { CatalogueLot, CatalogueLotImage, CatalogueAuction } from './api/catalogue.js';
```

Run: `pnpm --filter @carat-room/shared-types build` then `pnpm --filter @carat-room/shared-types test`
Expected: clean build, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types
git commit -m "feat(shared-types): add catalogue API contract schemas and query builders"
```

---

### Task 3: Producer enforcement in catalogue router tests (C6, C7)

**Files:**
- Modify: `apps/catalogue/src/presentation/catalogue-router.test.ts`
- Modify: `apps/catalogue/src/presentation/auction-router.test.ts`
- Modify: `apps/catalogue/src/presentation/facets-router.test.ts`

**Interfaces:**
- Consumes: all schemas and builders from Task 2 via `@carat-room/shared-types` (already a dependency of catalogue).

**How this catches drift:** a serialisation change in a router without a matching schema change now fails the catalogue's own suite; changing the schema instead surfaces every consumer through type errors and failing portal tests.

- [ ] **Step 1: Add schema assertions to `catalogue-router.test.ts`**

Add imports:

```ts
import {
  lotListResponseSchema, lotResponseSchema, lotSearchResponseSchema,
  categoryListResponseSchema, lotsQuery,
} from '@carat-room/shared-types';
```

In `should_return200WithLot_when_lotExists`, replace the body assertion with:

```ts
    const body = lotResponseSchema.parse(await res.json());
    expect(body.data.id).toBe('lot-1');
```

In `should_return200WithPaginatedLots`, replace the request and body assertion with:

```ts
    const res = await app.request(`/api/lots?${lotsQuery({ limit: 10, offset: 0 })}`);

    expect(res.status).toBe(200);
    const body = lotListResponseSchema.parse(await res.json());
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
```

In `should_passAuctionIdFilter_when_auctionIdQueryProvided`, replace the request line with:

```ts
    const res = await app.request(`/api/lots?${lotsQuery({ auctionId: 'auction-1' })}`);
```

In the search success test (`should_return200WithResults_when_queryProvided`), parse the body with `lotSearchResponseSchema.parse(await res.json())` — the mocked `searchLots.execute` result must return items shaped like `lotSearchResultSchema` (id, title, thumbnailUrl, estimatedValue, categoryId) and a `total`; adjust the mock if it returns bare `{ items: [], total: 0 }` with lots-shaped items. Any `GET /api/categories` test likewise parses with `categoryListResponseSchema`.

- [ ] **Step 2: Add schema assertions to `auction-router.test.ts`**

Add imports:

```ts
import { auctionListResponseSchema, auctionResponseSchema, auctionsQuery } from '@carat-room/shared-types';
```

In `should_return200WithAuctionsAndLotCounts`, replace the body parse with `auctionListResponseSchema.parse(await res.json())`. In `should_passStatusFilterAndLimit_when_provided`, build the request as:

```ts
    const res = await app.request(`/api/auctions?${auctionsQuery({ status: 'upcoming', limit: 3 })}`);
```

In `should_return200WithAuction_when_auctionExists`, parse with `auctionResponseSchema.parse(await res.json())`.

- [ ] **Step 3: Add schema assertion to `facets-router.test.ts`**

Import `facetsResponseSchema` from `@carat-room/shared-types`; in the first test (`returns departments and auctions`), replace the raw `res.json()` cast with:

```ts
    const body = facetsResponseSchema.parse(await res.json());
```

and keep the existing `toEqual` assertions on `body.departments` / `body.auctions`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @carat-room/shared-types build` (schemas must be compiled first), then `pnpm --filter catalogue exec vitest run src/presentation`
Expected: all presentation tests PASS. If any schema `parse` throws, the schema and the router disagree — fix the schema to match the router (reality wins) and note the discrepancy.

- [ ] **Step 5: Commit**

```bash
git add apps/catalogue/src/presentation
git commit -m "test(catalogue): enforce shared API contract schemas in router tests"
```

---

### Task 4: PGlite test-db package (C11, C13, C14, C17)

**Files:**
- Create: `packages/test-db/package.json`
- Create: `packages/test-db/tsconfig.json`
- Create: `packages/test-db/vitest.config.ts`
- Create: `packages/test-db/src/index.ts`
- Create: `packages/test-db/src/index.test.ts`
- Create: `packages/test-db/fixtures/001_fixture.sql`

**Interfaces:**
- Produces (used by Task 5): `startTestDb(options: { migrationsDir: string }): Promise<{ url: string; stop: () => Promise<void> }>` and `createTestDb(url: string): Sql` (postgres.js instance with `max: 1`).

**API caveat:** the `@electric-sql/pglite-socket` surface is young. After installing, open its README in `node_modules/@electric-sql/pglite-socket/README.md` and confirm the server class name and options match the code below; adapt if the package has renamed them. The behavioural contract (wire-protocol server on a localhost port backed by a PGlite instance) is what matters.

- [ ] **Step 1: Create the package**

`packages/test-db/package.json`:

```json
{
  "name": "@carat-room/test-db",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@electric-sql/pglite": "^0.3.0",
    "@electric-sql/pglite-socket": "^0.0.9",
    "postgres": "^3.4.4"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

If those PGlite versions are stale, run `pnpm add @electric-sql/pglite @electric-sql/pglite-socket --filter @carat-room/test-db` to get current ones.

`packages/test-db/tsconfig.json` (copy the pattern from `packages/shared-types/tsconfig.json`, adjusting only include paths):

```json
{
  "extends": "@carat-room/tsconfig/base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/test-db/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

Run `pnpm install` from the repo root.

- [ ] **Step 2: Create the fixture migration** — `packages/test-db/fixtures/001_fixture.sql`

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE widgets (
  id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name  TEXT NOT NULL,
  blurb TSVECTOR
);
```

(The fixture deliberately exercises `uuid-ossp` and `tsvector` — the two extensions the catalogue migrations need — so C17 is proven before Task 5.)

- [ ] **Step 3: Write the failing test** — `packages/test-db/src/index.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startTestDb, createTestDb } from './index.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

describe('test-db', () => {
  let handle: Awaited<ReturnType<typeof startTestDb>>;

  beforeAll(async () => {
    handle = await startTestDb({ migrationsDir: fixturesDir });
  });

  afterAll(async () => {
    await handle.stop();
  });

  it('should_applyMigrationsAndAcceptValidSql', async () => {
    const db = createTestDb(handle.url);
    await db`INSERT INTO widgets (name) VALUES ('sprocket')`;
    const rows = await db`SELECT id, name FROM widgets`;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('sprocket');
    await db.end();
  });

  it('should_rejectPhantomColumnSql', async () => {
    // the starting_price bug class: SQL referencing a column no migration creates
    const db = createTestDb(handle.url);
    await expect(db`SELECT starting_price FROM widgets`).rejects.toThrow(/starting_price/);
    await db.end();
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm --filter @carat-room/test-db exec vitest run`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 5: Implement** — `packages/test-db/src/index.ts`

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';

export interface TestDbHandle {
  url: string;
  stop: () => Promise<void>;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not determine a free port'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

// Boots an in-process embedded Postgres, applies migrations/*.sql in filename
// order, and serves the wire protocol on a free localhost port.
export async function startTestDb(options: { migrationsDir: string }): Promise<TestDbHandle> {
  const db = await PGlite.create({ extensions: { uuid_ossp } });

  const migrationFiles = readdirSync(options.migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort();
  for (const file of migrationFiles) {
    await db.exec(readFileSync(join(options.migrationsDir, file), 'utf8'));
  }

  const port = await findFreePort();
  const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port });
  await server.start();

  return {
    url: `postgres://postgres:postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}

// PGlite is effectively single-connection: repository tests must not pool.
export function createTestDb(url: string): ReturnType<typeof postgres> {
  return postgres(url, { max: 1 });
}
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm --filter @carat-room/test-db exec vitest run`
Expected: 2 tests PASS. If `PGLiteSocketServer` fails to start or postgres.js cannot handshake, consult the pglite-socket README (see the API caveat above) — the fix is confined to `startTestDb`.

- [ ] **Step 7: Build and commit**

Run: `pnpm --filter @carat-room/test-db build`
Expected: clean tsc build.

```bash
git add packages/test-db pnpm-lock.yaml
git commit -m "feat(test-db): add PGlite-backed embedded Postgres test harness"
```

---

### Task 5: Catalogue repository tests on PGlite (C12, C16, C17)

**Files:**
- Modify: `apps/catalogue/package.json`
- Create: `apps/catalogue/vitest.global-setup.ts`
- Modify: `apps/catalogue/vitest.config.ts`
- Modify: `apps/catalogue/src/infrastructure/postgres-lot-repository.test.ts` (connection options only)
- Modify: `apps/catalogue/src/infrastructure/postgres-category-repository.test.ts` (same)
- Modify: `apps/catalogue/src/infrastructure/postgres-search-repository.test.ts` (same)

**Interfaces:**
- Consumes: `startTestDb` from Task 4.

**Baseline:** these nine tests currently fail locally with `database "catalogue_test" does not exist` unless Docker Postgres is running. After this task they pass in a bare `pnpm turbo test`.

- [ ] **Step 1: Add the dev dependency**

In `apps/catalogue/package.json` `devDependencies` add `"@carat-room/test-db": "workspace:*"`, then `pnpm install`.

- [ ] **Step 2: Create `apps/catalogue/vitest.global-setup.ts`**

```ts
import { join } from 'node:path';
import { startTestDb } from '@carat-room/test-db';

// Boot an embedded Postgres with the real catalogue migrations for repository
// tests. An externally provided database (e.g. the Docker test environment)
// always wins.
export async function setup(): Promise<() => Promise<void>> {
  if (process.env.TEST_DATABASE_URL) {
    return async () => {};
  }
  const handle = await startTestDb({ migrationsDir: join(__dirname, 'migrations') });
  process.env.TEST_DATABASE_URL = handle.url;
  return async () => { await handle.stop(); };
}
```

(If the catalogue package is ESM and `__dirname` is unavailable, derive it: `const dir = dirname(fileURLToPath(import.meta.url));` — match however `vitest.config.ts` resolves paths in this package.)

- [ ] **Step 3: Wire it into `apps/catalogue/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './vitest.global-setup.ts',
    // PGlite serves a single connection — repository test files must not run concurrently
    fileParallelism: false,
  },
});
```

- [ ] **Step 4: Constrain repository test connections to a single connection**

The three `postgres-*-repository.test.ts` files each call `createDb(TEST_DB_URL)`. PGlite handles one connection; postgres.js defaults to a pool of 10. In each file, replace the `createDb` call with a direct single-connection client. Change (in all three files):

```ts
import { createDb, Db } from './db';
```

to

```ts
import postgres from 'postgres';
import { Db } from './db';
```

and

```ts
    db = createDb(TEST_DB_URL);
```

to

```ts
    db = postgres(TEST_DB_URL, { max: 1 }) as Db;
```

Also change each file's URL constant to read the env var at use time (the globalSetup sets it before workers start):

```ts
const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/catalogue_test';
```

(This line already exists in each file — verify it reads `TEST_DATABASE_URL`, not a snapshot taken at import of a different name.)

- [ ] **Step 5: Run the full catalogue suite**

Run: `pnpm --filter catalogue test`
Expected: **all** tests pass with no Docker running — including the nine previously-red repository tests. If `CREATE EXTENSION "uuid-ossp"` fails, the PGlite extension wiring in Task 4 needs the extension name mapping checked (`uuid_ossp` must be registered so the quoted SQL name resolves).

Known wrinkle: if env propagation from `globalSetup` to worker threads fails (tests still see the localhost:5432 fallback), switch the config to `pool: 'forks'` in `vitest.config.ts` — forked workers inherit `process.env` set during global setup.

- [ ] **Step 6: Verify the external-DB path still works**

Run: `$env:TEST_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/catalogue_test'; pnpm --filter catalogue exec vitest run src/infrastructure 2>$null; Remove-Item Env:TEST_DATABASE_URL`
Expected: repository tests fail with connection errors (no Docker DB running) — proving the harness did NOT override the externally set URL. Do not commit anything from this step.

- [ ] **Step 7: Commit**

```bash
git add apps/catalogue pnpm-lock.yaml
git commit -m "test(catalogue): run repository tests against embedded PGlite with real migrations"
```

---

### Task 6: user-portal fetch boundary parses via shared schemas (C8, C9, C10 for lib/catalogue.ts)

**Files:**
- Modify: `apps/user-portal/package.json`
- Modify: `apps/user-portal/src/lib/catalogue.ts`
- Create: `apps/user-portal/src/lib/catalogue.test.ts`

**Interfaces:**
- Consumes: `lotListResponseSchema`, `auctionListResponseSchema`, `auctionResponseSchema`, `CatalogueLot`, `CatalogueAuction` from `@carat-room/shared-types`.
- Produces (used by Task 7): `parseLotList(json: unknown): { lots: CatalogueLot[]; total?: number }`, `parseAuctionList(json: unknown): CatalogueAuction[]`, `parseAuction(json: unknown): AuctionDetail | null`, plus the existing `primaryImageUrl(lot)` and `toLotCardProps(lot, fallbackAuctionId)` (signatures unchanged, now typed with the shared `CatalogueLot`).

- [ ] **Step 1: Add the dependency**

In `apps/user-portal/package.json` `dependencies` add `"@carat-room/shared-types": "workspace:*"`, then `pnpm install` and `pnpm --filter @carat-room/shared-types build` (the portal imports the compiled dist).

- [ ] **Step 2: Write the failing test** — `apps/user-portal/src/lib/catalogue.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { lotListResponseSchema } from '@carat-room/shared-types';
import { parseLotList, parseAuctionList, toLotCardProps } from './catalogue';

// Fixture typed against the real contract — drifts fail at compile time (C9)
const lotFixture = {
  id: 'lot-1', title: 'Cartier Love Ring', description: null, auctionId: 'auction-1',
  categoryId: null, condition: 'EXCELLENT', estimatedValue: 3000,
  images: [{ id: 'img-1', lotId: 'lot-1', url: '/x.jpg', thumbnailUrl: '/t.jpg', displayOrder: 0, isPrimary: true }],
  createdBy: null, createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z',
} satisfies z.infer<typeof lotListResponseSchema>['data'][number];

afterEach(() => vi.restoreAllMocks());

describe('parseLotList', () => {
  it('parses the real { data, meta } envelope', () => {
    const result = parseLotList({ data: [lotFixture], meta: { total: 1, limit: 24, offset: 0 } });
    expect(result.lots).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('returns the fallback and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parseLotList({ lots: [lotFixture] });
    expect(result.lots).toEqual([]);
    expect(result.total).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('parseAuctionList', () => {
  it('returns [] and logs on non-envelope input', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseAuctionList({ auctions: [] })).toEqual([]);
  });
});

describe('toLotCardProps', () => {
  it('maps the primary image and estimate', () => {
    const props = toLotCardProps(lotFixture, 'fallback');
    expect(props.auctionId).toBe('auction-1');
    expect(props.imageUrl).toBe('/t.jpg');
    expect(props.estimate).toBe(3000);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter user-portal exec vitest run src/lib/catalogue.test.ts`
Expected: FAIL — `parseLotList` is not exported.

- [ ] **Step 4: Rewrite `apps/user-portal/src/lib/catalogue.ts`**

```ts
import {
  lotListResponseSchema, auctionListResponseSchema, auctionResponseSchema,
  type CatalogueLot, type CatalogueAuction,
} from '@carat-room/shared-types';
import type { z } from 'zod';
import type { LotCardProps } from '@/components/primitives/lot-card';

export type { CatalogueLot, CatalogueAuction };
export type AuctionDetail = z.infer<typeof auctionResponseSchema>['data'];

// Contract boundary: every catalogue response is parsed through the shared
// schema. Drift logs and degrades to the fallback — pages render empty
// states, never crash.
export function parseLotList(json: unknown): { lots: CatalogueLot[]; total?: number } {
  const parsed = lotListResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Catalogue lot list failed contract validation', parsed.error.issues);
    return { lots: [] };
  }
  return { lots: parsed.data.data, total: parsed.data.meta.total };
}

export function parseAuctionList(json: unknown): CatalogueAuction[] {
  const parsed = auctionListResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Catalogue auction list failed contract validation', parsed.error.issues);
    return [];
  }
  return parsed.data.data;
}

export function parseAuction(json: unknown): AuctionDetail | null {
  const parsed = auctionResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Catalogue auction failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data;
}

export function primaryImageUrl(lot: CatalogueLot): string | undefined {
  const primary = lot.images.find(img => img.isPrimary) ?? lot.images[0];
  return primary?.thumbnailUrl;
}

export function toLotCardProps(lot: CatalogueLot, fallbackAuctionId: string): LotCardProps {
  return {
    lotId: lot.id,
    auctionId: lot.auctionId ?? fallbackAuctionId,
    title: lot.title,
    imageUrl: primaryImageUrl(lot),
    estimate: lot.estimatedValue ?? undefined,
  };
}
```

The old local `CatalogueLot`/`CatalogueListResponse` declarations are replaced above, but `lotsFromResponse` and `CatalogueListResponse` are still imported by three components until Task 7 converts them. So that this task commits green on its own, keep two transitional exports (Task 7 deletes both):

```ts
// Transitional alias — removed in the consumer-conversion task
export function lotsFromResponse(json: unknown): CatalogueLot[] {
  return parseLotList(json).lots;
}
```

Keep the existing `CatalogueListResponse` type export for the same reason; Task 7 deletes both.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter user-portal exec vitest run src/lib/catalogue.test.ts` then the full suite `pnpm --filter user-portal test`
Expected: new tests PASS; existing suite stays green via the transitional alias.

- [ ] **Step 6: Commit**

```bash
git add apps/user-portal pnpm-lock.yaml
git commit -m "feat(user-portal): parse catalogue responses through shared contract schemas"
```

---

### Task 7: Convert the remaining user-portal consumers (C8, C9, C10)

**Files:**
- Modify: `apps/user-portal/src/app/page.tsx`
- Modify: `apps/user-portal/src/app/page.test.tsx`
- Modify: `apps/user-portal/src/app/auctions/[auctionId]/catalogue-lots.tsx`
- Modify: `apps/user-portal/src/app/auctions/[auctionId]/catalogue-lots.test.tsx`
- Modify: `apps/user-portal/src/app/auctions/browse-client.tsx`
- Modify: `apps/user-portal/src/app/auctions/[auctionId]/page.tsx`
- Modify: `apps/user-portal/src/app/auctions/[auctionId]/lots/[lotId]/lot-detail-client.tsx`
- Modify: `apps/user-portal/src/lib/catalogue.ts` (delete transitional exports)

**Interfaces:**
- Consumes: `parseLotList`, `parseAuctionList`, `parseAuction`, `toLotCardProps` from Task 6; `lotsQuery`, `auctionsQuery` from `@carat-room/shared-types`.

**Behaviour change (intentional):** the home page "Closing soon" grid stops expecting live-bid fields that don't exist and instead renders catalogue lots with estimates, consistent with the other grids. Live bids arrive with the future auction-engine read model.

- [ ] **Step 1: Update the home page test first** — `apps/user-portal/src/app/page.test.tsx`

Replace the `{ lots: [lot] }` fixture case with real-envelope fixtures. The full test file becomes:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { z } from 'zod';
import { lotListResponseSchema, auctionListResponseSchema } from '@carat-room/shared-types';

vi.mock('@/components/layout/header', () => ({
  Header: () => <div data-testid='header' />,
}));

vi.mock('@/components/primitives/lot-card', () => ({
  LotCard: ({ title }: { title: string }) => <div data-testid='lot-card'>{title}</div>,
}));

import HomePage from './page';

const lotFixture = {
  id: 'lot-1', title: 'Art Deco Diamond Ring', description: null, auctionId: 'auction-1',
  categoryId: null, condition: 'EXCELLENT', estimatedValue: 4200,
  images: [{ id: 'img-1', lotId: 'lot-1', url: '/ring.jpg', thumbnailUrl: '/ring_t.jpg', displayOrder: 0, isPrimary: true }],
  createdBy: null, createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z',
} satisfies z.infer<typeof lotListResponseSchema>['data'][number];

const auctionFixture = {
  id: 'auction-1', title: 'July Fine Jewellery Sale', saleDate: '2026-07-20T10:00:00.000Z',
  location: 'Sydney', viewingDates: null, status: 'upcoming', lotCount: 42,
} satisfies z.infer<typeof auctionListResponseSchema>['data'][number];

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(lotsBody: unknown, auctionsBody: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) =>
    Promise.resolve({
      ok: true,
      json: async () => (url.includes('/api/lots') ? lotsBody : auctionsBody),
    }),
  ));
}

describe('HomePage', () => {
  it('renders lots and upcoming sales from real catalogue envelopes', async () => {
    stubFetch(
      { data: [lotFixture], meta: { total: 1, limit: 8, offset: 0 } },
      { data: [auctionFixture] },
    );

    render(await HomePage());

    expect(screen.getByText('Art Deco Diamond Ring')).toBeTruthy();
    expect(screen.getByText('July Fine Jewellery Sale')).toBeTruthy();
    expect(screen.getByText('42 lots')).toBeTruthy();
  });

  it('renders empty states on contract drift, never crashes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetch({ lots: [lotFixture] }, { auctions: [] });

    render(await HomePage());

    expect(screen.getByText('No lots currently open.')).toBeTruthy();
    expect(screen.queryByTestId('lot-card')).toBeNull();
  });

  it('renders the empty state when the catalogue is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    render(await HomePage());

    expect(screen.getByText('No lots currently open.')).toBeTruthy();
  });
});
```

Run: `pnpm --filter user-portal exec vitest run src/app/page.test.tsx` — Expected: FAIL (home page still guards on `data.lots` and renders no lot cards from the real envelope).

- [ ] **Step 2: Rewrite the home page fetchers** — `apps/user-portal/src/app/page.tsx`

Replace both fetcher functions and the lot grid mapping:

```tsx
import { lotsQuery, auctionsQuery } from '@carat-room/shared-types';
import { parseLotList, parseAuctionList, toLotCardProps, type CatalogueLot, type CatalogueAuction } from '@/lib/catalogue';

async function getClosingSoonLots(): Promise<CatalogueLot[]> {
  try {
    const res = await fetch(`${CATALOGUE_URL}/api/lots?${lotsQuery({ limit: 8 })}`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    return parseLotList(await res.json()).lots;
  } catch { return []; }
}

async function getUpcomingAuctions(): Promise<CatalogueAuction[]> {
  try {
    const res = await fetch(`${CATALOGUE_URL}/api/auctions?${auctionsQuery({ status: 'upcoming', limit: 3 })}`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    return parseAuctionList(await res.json());
  } catch { return []; }
}
```

In the JSX, render lot cards via the shared mapper (the old per-field props referenced live-bid fields that never existed):

```tsx
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
            {lots.map(lot => <LotCard key={lot.id} {...toLotCardProps(lot, lot.auctionId ?? 'catalogue')} />)}
          </div>
```

Note the old URL sent `status=open&sort=endAt` — params the router never read; `lotsQuery` has no such keys, which is the builder doing its job.

Run: `pnpm --filter user-portal exec vitest run src/app/page.test.tsx` — Expected: PASS.

- [ ] **Step 3: Convert `catalogue-lots.tsx` and its test**

In `catalogue-lots.tsx`: replace the import of `CatalogueListResponse`/`lotsFromResponse` with `parseLotList` and build the SWR key with the query builder. The `sort` state stays UI-only (the backend does not sort yet — it is intentionally NOT in `lotsQuery`):

```tsx
import { lotsQuery } from '@carat-room/shared-types';
import { CatalogueLot, parseLotList, toLotCardProps } from '@/lib/catalogue';
```

```tsx
  const { data } = useSWR<unknown>(
    `/api/catalogue/lots?${lotsQuery({ auctionId, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })}`,
    fetcher,
    { refreshInterval: 30000 },
  );

  // undefined = still loading — do not run it through the schema (it would log a spurious contract error)
  const { lots, total } = data === undefined ? { lots: [], total: undefined } : parseLotList(data);
```

SWR's `error` handling and the rest of the component stay as they are (the `error` destructure remains). In `catalogue-lots.test.tsx`, type the fixture against the contract:

```tsx
import { z } from 'zod';
import { lotListResponseSchema } from '@carat-room/shared-types';
```

```tsx
const mockLots = Array.from({ length: 3 }, (_, i) => ({
  id: `lot-${i}`, title: `Lot ${i + 1} Title`, description: null, auctionId: 'auction-1',
  categoryId: null, condition: null, estimatedValue: 1000 * (i + 1),
  images: [{ id: `img-${i}`, lotId: `lot-${i}`, url: '/full.jpg', thumbnailUrl: '/thumb.jpg', displayOrder: 0, isPrimary: true }],
  createdBy: null, createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z',
})) satisfies z.infer<typeof lotListResponseSchema>['data'];
```

The "unexpected shape" test gains a `vi.spyOn(console, 'error').mockImplementation(() => {})` since `parseLotList` now logs.

Run: `pnpm --filter user-portal exec vitest run "src/app/auctions/[auctionId]/catalogue-lots.test.tsx"` — Expected: PASS.

- [ ] **Step 4: Convert `browse-client.tsx`**

Replace the imports and query construction:

```tsx
import { lotsQuery } from '@carat-room/shared-types';
import { parseLotList, toLotCardProps } from '@/lib/catalogue';
```

```tsx
  const lotsParams = lotsQuery({
    minValue: minPrice !== '0' ? Number(minPrice) : undefined,
    maxValue: maxPrice !== '100000' ? Number(maxPrice) : undefined,
    auctionId: auctions[0],
  });
  // Not yet supported by the catalogue API — kept in the URL so the UI state
  // survives navigation; the proxy forwards and the router ignores them
  if (q) lotsParams.set('q', q);
  lotsParams.set('sort', sort);
  departments.forEach(d => lotsParams.append('department', d));
  statuses.forEach(s => lotsParams.append('status', s));
```

```tsx
  const { data, isLoading } = useSWR<unknown>(`/api/catalogue/lots?${lotsParams}`, fetcher, { refreshInterval: 15000 });
  // undefined = still loading — do not run it through the schema (it would log a spurious contract error)
  const { lots, total } = data === undefined ? { lots: [], total: undefined } : parseLotList(data);
```

The grid mapping already uses `toLotCardProps(lot, 'catalogue')` — unchanged.

Run: `pnpm --filter user-portal test` — Expected: suite green.

- [ ] **Step 5: Convert the sale page and lot-detail client**

`auctions/[auctionId]/page.tsx` — replace the manual envelope unwrap with the parser:

```tsx
import { parseAuction } from '@/lib/catalogue';
```

```tsx
  if (!auctionRes.ok) notFound();
  const auction = parseAuction(await auctionRes.json());
  if (!auction) notFound();
```

(Delete the local `type Auction` — `parseAuction`'s return type covers it.)

`lot-detail-client.tsx` — replace the two effects' parsing:

```tsx
import { lotsQuery } from '@carat-room/shared-types';
import { parseLotList, toLotCardProps } from '@/lib/catalogue';
```

```tsx
  useEffect(() => {
    fetch(`/api/catalogue/lots?${lotsQuery({ auctionId: lot.auctionId, limit: 5 })}`)
      .then(r => r.json())
      .then((d: unknown) => setRelatedLots(
        parseLotList(d).lots.filter(l => l.id !== lot.id).slice(0, 4).map(l => toLotCardProps(l, lot.auctionId)),
      ))
      .catch(() => {});
  }, [lot.auctionId, lot.id]);

  useEffect(() => {
    if (!isLive) return;
    fetch(`/api/catalogue/lots?${lotsQuery({ auctionId: lot.auctionId, limit: 3 })}`)
      .then(r => r.json())
      .then((d: unknown) => setNextLots(
        parseLotList(d).lots.filter(l => l.id !== lot.id).slice(0, 2).map(l => toLotCardProps(l, lot.auctionId)),
      ))
      .catch(() => {});
  }, [isLive, lot.auctionId, lot.id]);
```

- [ ] **Step 6: Delete the transitional exports**

Remove `lotsFromResponse` and the `CatalogueListResponse` type from `apps/user-portal/src/lib/catalogue.ts`. Run a grep to confirm no remaining imports: `grep -r "lotsFromResponse\|CatalogueListResponse" apps/user-portal/src` — Expected: no matches.

- [ ] **Step 7: Full portal verification**

Run: `pnpm --filter user-portal test` then `pnpm --filter user-portal build`
Expected: all tests pass; Next.js build (including TypeScript) clean.

- [ ] **Step 8: Commit**

```bash
git add apps/user-portal
git commit -m "refactor(user-portal): consume catalogue API exclusively through contract schemas and query builders"
```

---

### Task 8: Drift smoke check and final verification (C18, C19, C20)

**Files:**
- Modify: `docs/superpowers/plans/2026-07-08-api-contracts-phase-1.md` (checkboxes)

- [ ] **Step 1: Deliberate-drift smoke check (do not commit the drift)**

In `apps/catalogue/src/presentation/auction-router.ts`, temporarily rename `lotCount` to `lot_count` in the list response mapping. Run:

`pnpm --filter catalogue exec vitest run src/presentation` — Expected: FAIL on `auctionListResponseSchema.parse` (producer side caught it).

Revert the rename (`git checkout -- apps/catalogue/src/presentation/auction-router.ts`) and re-run to confirm green.

- [ ] **Step 2: Whole-repo verification**

Run: `pnpm turbo build` then `pnpm turbo test` (no Docker running).
Expected: all packages build; all suites pass — including catalogue repository tests on PGlite. Any red here is a Phase 1 defect; fix before proceeding.

- [ ] **Step 3: Confirm scope boundaries**

Review this plan's own commits (`git log --oneline --stat` over the Task 1–7 commits): no changes outside `packages/shared-types`, `packages/test-db`, `apps/catalogue` (test files and vitest config only — no production `src` file may appear in this plan's catalogue commits), `apps/user-portal`, and this plan/spec. SSE endpoints (`/api/auctions/:lotId/stream`) remain schema-free (C20). Phases 2–4 are separate plans (C19).

- [ ] **Step 4: Mark this plan complete and commit**

Tick every checkbox in this file, then:

```bash
git add docs/superpowers/plans/2026-07-08-api-contracts-phase-1.md
git commit -m "chore: mark all plan api-contracts-phase-1 tasks complete"
```


