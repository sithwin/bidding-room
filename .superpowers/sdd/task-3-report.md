## Status
DONE_WITH_CONCERNS

## Commits
456efbd feat(user-auth): infrastructure layer — DB factory and postgres repositories (TDD)

## Tests
7/7 passing. Command: `node_modules/.pnpm/node_modules/.bin/vitest run apps/user-auth/src/infrastructure/db/`
- postgres-user-repository.test.ts: 3/3
- postgres-token-repository.test.ts: 4/4

Both RED phases confirmed before implementation (module-not-found errors).

## Self-review

TDD order followed strictly: user-repo test written and confirmed RED, PostgresUserRepository implemented and confirmed 3 GREEN; token-repo test written and confirmed RED, PostgresTokenRepository implemented, all 7 GREEN.

**pnpm deps not installed:** `postgres` package was in package.json but not in the pnpm store. Ran pnpm install via nvm node18 binary. pnpm-lock.yaml updated and committed.

**Docker not running / no local PostgreSQL:** Postgres was unavailable at task start. Opened Docker Desktop and ran a standalone test container (`docker run -d --name carat-room-test-pg ... postgres:16-alpine`). The main docker-compose postgres service fails due to an `init.sql` permissions error on macOS — this is a pre-existing issue unrelated to this task.

**Parallel test file execution caused FK violations:** Both test suites share the same DB and use `TRUNCATE … CASCADE`. When run in parallel (vitest default), one suite's truncate wiped the other's freshly inserted user, causing FK constraint violations. Fix: `fileParallelism: false` in vitest config. However, vitest running from the monorepo root ignores the app-level `vitest.config.ts` — it uses `process.cwd()` as its search root. Resolution: created a root-level `vitest.config.ts` with `fileParallelism: false` so the repo-root command works correctly.

## Concerns

**Root-level vitest.config.ts sets fileParallelism: false globally.** This forces sequential test file execution for all vitest runs from the repo root. Correct for integration tests sharing a DB; minor perf cost for pure unit suites. A `vitest.workspace.ts` would be the ideal long-term solution but failed during this task (the workspace config file itself could not resolve `vitest/config` due to pnpm hoisting). Should be revisited when the second service is scaffolded.

**docker-compose postgres service broken on this machine.** The `init.sql` volume mount fails with "Operation not permitted". Developers must use a standalone container for testing. A fix to the init.sql setup (or removing the volume mount for local dev) should be tracked.
