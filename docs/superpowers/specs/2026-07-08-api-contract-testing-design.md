# API Contract Testing — Design

**Date:** 2026-07-08
**Status:** Approved
**Author:** Brainstormed with Claude

## Problem

On 2026-07-08 the user-portal home page crashed with `Cannot read properties of undefined (reading 'length')`. Root-cause analysis found a systemic class of defects, none caught by any automated check:

1. **Envelope drift** — portal consumers were written against imagined response shapes (`{ lots: [...] }`, `{ auctions: [...] }`) while services return `{ data, meta }` envelopes. TypeScript `as` casts on `res.json()` validated nothing.
2. **Query-param drift** — portals sent `page`, `minPrice`, `exclude`, `after`; routers read `offset`, `minValue`, and silently ignored the rest. Pagination and filters no-opped without any error.
3. **SQL column drift** — the facets router filtered on `starting_price`, a column no migration creates. Its unit tests passed because the mocked DB asserted the query string contained the same wrong name.
4. **Fixture drift** — portal test mocks encoded the same imagined shapes as the code, so both sides' suites were green while the integration was broken.

Each side was tested only against itself. Nothing exercised the seam.

## Goals

- Contract drift between any portal and any service fails `pnpm turbo test` — the fast, no-Docker suite that runs on every push.
- SQL referencing columns absent from migrations fails the owning service's unit suite.
- Production behaviour is unchanged for services; portals keep graceful degradation (bad shape → empty state, never a crash).
- Whole-monorepo coverage, landed in phases with the catalogue ↔ user-portal seam as the reference implementation.

## Non-Goals

- Changing any service's response shapes. Schemas document reality; normalising inconsistent responses is separate work, flagged where found.
- Replacing the Docker integration suite (`tests/integration/`) — it remains the end-to-end safety net.
- Runtime response validation inside services (adds latency and failure modes for drift that tests already catch).
- OpenAPI/Pact tooling — the monorepo makes shared code the cheaper, stronger mechanism.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Run context | Fast tests in every `pnpm turbo test` run — no Docker required |
| Mechanism | Shared Zod schemas as the single source of truth |
| Scope | Whole monorepo, phased |
| SQL drift | PGlite (embedded Postgres) in unit tests, running real migrations |

## Architecture

```
packages/shared-types/src/api/
  envelope.ts          — envelope(data) / listEnvelope(item) helpers ({ data, meta })
  catalogue.ts         — schemas + query builders for the catalogue API
  auction-engine.ts    — same for auction-engine
  user-auth.ts         — same for user-auth
  payment.ts           — same for payment
  shipping.ts          — same for shipping
  admin.ts             — mostly re-exports of downstream schemas (admin is a proxy)

packages/test-db/      — dev-only PGlite harness for repository tests
```

Zod (^3.25) becomes a dependency of `shared-types`. Both portals already depend on it.

**Enforcement points:**

| Bug class | Caught by |
|-----------|-----------|
| Envelope drift (producer side) | Router tests: `schema.parse(await res.json())` per endpoint |
| Envelope drift (consumer side) | Portal fetchers parse via shared schema; portal tests assert strict parses |
| Query-param drift | Portals build URLs only through typed query builders exported next to the schemas |
| SQL column drift | Repository tests run against PGlite with the service's real migrations applied |
| Fixture drift | Portal test mocks typed `satisfies z.infer<typeof schema>` |

## Component Design

### 1. Contract schemas (`shared-types/src/api/`)

One module per service. Each exports:

- Zod schemas for every response the service produces, built from the shared envelope helpers where the service follows the `{ data, meta }` convention.
- Inferred TypeScript types (`export type CatalogueLot = z.infer<typeof catalogueLotSchema>`) so consumers stop declaring inline types.

Example (catalogue):

```ts
export const catalogueLotSchema = z.object({
  id: z.string(),
  auctionId: z.string().nullable(),
  title: z.string(),
  estimatedValue: z.number().nullable(),
  images: z.array(lotImageSchema),
  // … remaining fields matching the actual router output
});

export const lotListResponseSchema = listEnvelope(catalogueLotSchema);
export const auctionListResponseSchema = z.object({ data: z.array(catalogueAuctionSchema) });
```

Schemas are written by reading each router's actual serialisation — never from memory of what the API "should" return. Where a service deviates from the envelope convention, the schema records the real shape and the deviation is noted in the plan for possible follow-up.

### 2. Typed query builders

Response schemas cannot catch a portal sending `page` when the router reads `offset`. Each API module therefore also exports query builders whose parameter objects contain exactly the names the router reads:

```ts
export function lotsQuery(params: {
  auctionId?: string;
  categoryId?: string;
  condition?: string;
  minValue?: number;
  maxValue?: number;
  limit?: number;
  offset?: number;
}): URLSearchParams { /* … */ }
```

Portals construct catalogue/service URLs exclusively through these builders. An invented or renamed param becomes a compile error. Router tests reference the same builder in at least one request so producer and builder cannot drift silently.

### 3. Producer enforcement (service router tests)

Every router test that asserts a response body also runs it through the shared schema:

```ts
const body = lotListResponseSchema.parse(await res.json());
expect(body.data).toHaveLength(1);
```

No production code changes in services. A service changing its output without updating the shared schema fails its own unit suite; updating the schema then surfaces every affected consumer through type errors and failing portal tests.

### 4. Consumer enforcement (portal fetch boundary)

Portal fetch helpers (e.g. `apps/user-portal/src/lib/catalogue.ts`) parse responses with `safeParse`:

- **Production path:** on failure, log the Zod issue summary via `console.error` and return the caller's declared fallback (empty list, `null`). Pages render their empty states — the graceful degradation established in the 2026-07-08 fixes is preserved, never a crash.
- **Test path:** portal tests assert `parse` (strict) succeeds against realistic fixtures, and all fixtures are typed `satisfies z.infer<typeof schema>` so a schema change breaks stale mocks at compile time.

Inline `as { … }` casts on `res.json()` at service seams are removed as each seam is converted.

### 5. PGlite repository testing (`packages/test-db`)

A dev-only workspace package wrapping `@electric-sql/pglite` + `@electric-sql/pglite-socket`:

- `startTestDb({ migrationsDir })` — boots an in-process embedded Postgres, serves the wire protocol on an ephemeral localhost port, applies every `migrations/*.sql` in filename order, and returns `{ url, stop }`.
- Wired in per-service via a vitest `globalSetup` that exports the URL through `TEST_DATABASE_URL` **only when the variable is not already set** — the existing repository tests already read that variable, so they need no rewrites beyond truncation-order fixes if any, and an externally provided database (e.g. the Docker test environment) always wins.
- PGlite is effectively single-connection: the harness documents that repository tests must create their client with `max: 1` (a `createTestDb` helper wraps `createDb` to enforce this).

Result: the facets `starting_price` bug class fails on every `pnpm turbo test`, and the nine currently-red Postgres tests (which today require a Docker database) run green locally and in CI.

### 6. Envelope helpers

`shared-types/src/api/envelope.ts`:

```ts
export const envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ data });
export const listEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    meta: z.object({ total: z.number(), limit: z.number().optional(), offset: z.number().optional(), page: z.number().optional() }),
  });
```

`meta` fields are permissive because services differ today (catalogue: `total/limit/offset`; auction-engine: `page/total`). Tightening per-service happens in each service's own schema if needed.

## Error Handling

- **Consumer runtime:** `safeParse` failure → log + fallback value; never throw in a page or component. SSE and non-JSON endpoints are out of schema scope.
- **PGlite startup failure:** the globalSetup fails fast with a clear message; repository tests are not silently skipped.
- **Schema/producer disagreement discovered during rollout:** the schema is corrected to match the producer (reality wins), and any consumer relying on the imagined shape is fixed in the same change — this is exactly the drift the system exists to surface.

## Phasing

| Phase | Contents |
|-------|----------|
| **1 — Infrastructure + reference seam** | `shared-types/src/api/` layout, envelope helpers, `packages/test-db`; full catalogue schemas + query builders; catalogue router tests parse schemas; user-portal catalogue consumers (home, browse, sale page, lot detail, `lib/catalogue.ts`) converted; catalogue repository tests on PGlite |
| **2 — Remaining user-portal seams** | user-auth, auction-engine, payment, shipping schemas + query builders; portal auth/bid/payment/shipping fetchers and API-route proxies converted |
| **3 — Admin** | admin service schemas (largely re-exports of downstream schemas since it proxies); admin-portal consumers converted |
| **4 — PGlite everywhere** | user-auth, auction-engine, payment, shipping repository tests moved onto `packages/test-db` |

Each phase is independently shippable and leaves the repo green.

## Testing the System Itself

- `packages/test-db` gets its own vitest suite (boots, applies a fixture migration, rejects a phantom-column query).
- Envelope helpers get unit tests in shared-types.
- A deliberate-drift smoke check is part of each phase's verification: temporarily rename a field in a router serialisation and confirm the schema assertion fails (manual verification step in the plan, not committed).

## Risks

- **PGlite fidelity:** PGlite is real Postgres compiled to WASM, but extensions differ. The catalogue migrations use `uuid-ossp` and `tsvector` — PGlite bundles `uuid_ossp` as a loadable extension and full-text search is core Postgres, so both work; the plan verifies this first in Phase 1 before broad adoption. If an extension proves unsupported, the affected service keeps Docker-only repo tests and the schema/query-builder layers still apply.
- **Schema maintenance cost:** every response change now touches shared-types. This is the point — the cost is the enforcement — but phases keep the initial conversion reviewable.
- **`as` cast reintroduction:** convention only (recorded in CLAUDE.md lessons); a lint rule banning `as` after `res.json()` is possible later but out of scope.

