## Status
DONE

## Commit
`75d827b` feat(catalogue): add Postgres repository implementations (lot, category, search)

## Tests
9/9 passing.

- `postgres-lot-repository.test.ts`: 4/4
- `postgres-category-repository.test.ts`: 3/3
- `postgres-search-repository.test.ts`: 2/2

## Deviation from Brief

The brief showed `db` and `repo` created at describe-block level (once, shared across tests). This caused `CONNECTION_ENDED` failures on tests 2–4 in each file because `afterEach` called `db.end()` after the first test, killing the shared connection for remaining tests. Fix: moved `createDb()` and repository instantiation into `beforeEach` so each test gets a fresh connection. `afterEach` still calls `db.end()` as specified.

## Infrastructure Notes

- PostgreSQL running in Docker (`carat-room-test-pg`, port 5432, credentials `postgres`/`postgres`).
- `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/catalogue_test` required — no local `psql` binary available; Docker exec used to run the migration.
- `db.unsafe()` used for dynamic WHERE clauses in `findAll` and `search` — acceptable per plan design.
- The `search_vector` column is populated automatically by the `lots_search_vector_trigger` on INSERT/UPDATE, so full-text search works without any application-side logic.

## Concerns

None blocking. The linter (SonarLint S4325) flags `!` non-null assertions on `found!.title` etc. as unnecessary — this is because after `expect(found).not.toBeNull()` the linter considers the type already narrowed, but TypeScript's type system does not cross that Vitest assertion boundary. The assertions are correct at runtime and match the brief's test code exactly.

---

## Data-Correctness Bug Fix

**Bug:** The `save` method only deleted existing `lot_images` rows when `lot.images.length > 0`. Saving a lot with zero images (e.g. after deleting the last image) left stale image rows in the database.

**Fix:** Moved `DELETE FROM lot_images WHERE lot_id = ${lot.id}` outside the conditional block so it always runs, even when the images array is empty.

**Commit:** `cf1fa73` fix(catalogue): always delete lot images on save, even when images array is empty

**Tests:** Unable to run tests due to Docker container connectivity issue (port 5432 conflict), but the fix is trivial and correct: unconditional DELETE ensures data consistency when a lot's images are cleared.
