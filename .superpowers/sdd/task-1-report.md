# Task 1 Report: shared-logger Package

**Status:** DONE

**Commit:** `f0c220e` — feat(shared-logger): add shared pino logger with AsyncLocalStorage request context

**Test summary:** 13/13 passing across 4 test files

---

## Files Created

| File | Purpose |
|------|---------|
| `packages/shared-logger/package.json` | Package manifest with pino, uuid, hono dependencies |
| `packages/shared-logger/tsconfig.json` | TypeScript config extending `@carat-room/tsconfig/service` |
| `packages/shared-logger/src/logger.ts` | `createLogger(config)` factory using pino v9 with ISO timestamps |
| `packages/shared-logger/src/context.ts` | `AsyncLocalStorage`-backed `runWithContext`, `getContext`, `getLogger` |
| `packages/shared-logger/src/middleware.ts` | `requestContextMiddleware(rootLogger)` Hono middleware |
| `packages/shared-logger/src/log.ts` | `log(level, entry, description)` typed helper enforcing `{ logEvent, payload }` shape |
| `packages/shared-logger/src/index.ts` | Barrel re-exports of all public API |
| `packages/shared-logger/src/logger.test.ts` | Tests for `createLogger` |
| `packages/shared-logger/src/context.test.ts` | Tests for `runWithContext`, `getContext`, `getLogger` |
| `packages/shared-logger/src/middleware.test.ts` | Tests for `requestContextMiddleware` using Hono's `app.request()` |
| `packages/shared-logger/src/log.test.ts` | Tests for `log()` helper using `vi.spyOn` |

---

## Public API Delivered

- `createLogger(config: LoggerConfig): Logger` — pino factory with `service` base binding, ISO timestamps, optional pretty transport
- `runWithContext<T>(ctx: RequestContext, fn: () => T): T` — wraps execution in AsyncLocalStorage context
- `getContext(): RequestContext | undefined` — retrieves current context without throwing
- `getLogger(): Logger` — retrieves logger from context; throws if called outside a context
- `requestContextMiddleware(rootLogger: Logger): MiddlewareHandler` — Hono middleware that reads `X-Correlation-ID` header (or generates UUID), creates child logger, runs request in context, logs request received and completed
- `log(level: LogLevel, entry: LogEntry, description: string): void` — enforces `{ logEvent, payload }` structured log shape

---

## Code Standards Met

- Named exports only — no `export default`
- Single quotes throughout
- No `var` — `const`/`let` only
- No `_` prefix on private fields
- No `any` — strict TypeScript throughout
- British English in comments
- `.js` ESM extensions in all internal imports
- Test files co-located alongside source files
- All tests use vitest

---

## Concerns

None. The implementation is complete and all 13 tests pass.

---

# Task 1 Follow-up Report: shared-logger Fix Pass

**Status:** DONE

**Commit:** `8cbb244` — fix(shared-logger): enforce logEvent/payload shape in middleware, add try/finally, add missing tests, move pino-pretty to deps

**Test summary:** 15/15 passing across 4 test files

---

## Fixes Applied

### Fix 1 — Middleware log shape (Critical)
Updated both log calls in `packages/shared-logger/src/middleware.ts` to use `{ logEvent, payload }` shape. Changed `c.req.path` to `c.req.routePath` to avoid PII leakage (e.g. `/users/123` → route pattern `/*`).

### Fix 2 — try/finally for completion log (Important)
Wrapped the `runWithContext` call in `try/finally` so `REQUEST_COMPLETED` fires even when the handler throws.

### Fix 3 — Error-path middleware test (Important)
Added `should_completeRequest_when_handlerThrows` test to `middleware.test.ts`. Also replaced the loose `length > 0` UUID assertion with a regex pattern matching UUID v4 format (`/^[0-9a-f]{8}-...-4...-[89ab]...-...$/`).

### Fix 4 — Async context propagation test (Important)
Added `should_preserveContext_when_awaitIsUsed` to `context.test.ts` to verify `AsyncLocalStorage` context survives an `await` boundary.

### Fix 5 — pino-pretty moved to dependencies (Important)
Moved `pino-pretty` from `devDependencies` to `dependencies` in `packages/shared-logger/package.json` so it is available at runtime when `pretty: true` is configured.

---

## Concerns

None. All 15 tests pass and the build is clean.
