
# Observability Stack (Grafana, Loki, Prometheus) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship every backend service's logs into a searchable Loki store, expose Prometheus RED metrics per service, and surface both in Grafana dashboards with alerting to Slack + email in production — plus the same stack (minus alerting) always-on in local dev and the Playwright E2E stack.

**Architecture:** Promtail scrapes Docker container logs (zero app-code coupling) into Loki; each Hono service gains a `GET /metrics` endpoint (via a new `packages/shared-metrics`) scraped by Prometheus alongside cAdvisor/node-exporter/postgres-exporter/redis-exporter/RabbitMQ; Grafana is the single UI for both, with unified alerting routed through Alertmanager. A shared `docker-compose.observability.yml` (no Alertmanager, no alert rules) is included by both `docker-compose.override.yml` and `docker-compose.test.yml` so dev/E2E get the same log and metric visibility without duplicating service definitions.

**Tech Stack:** Grafana, Loki, Promtail, Prometheus, Alertmanager, cAdvisor, node-exporter, postgres_exporter, redis_exporter, `prom-client` (new `packages/shared-metrics`), existing `packages/shared-logger` (pino) — wired into services for the first time.

## Global Constraints

- British English in all comments and copy: "authorise" not "authorize", "cancelled" not "canceled", "fulfilment" not "fulfillment".
- Named exports only — never `export default`.
- No `var` — always `const` or `let`.
- TypeScript strict mode — no implicit `any`, no `@ts-ignore` in production code.
- Single quotes for string literals.
- No `_` prefix on private fields — use TypeScript `private` keyword.
- No `Manager`, `Helper`, `Utils` class names.
- Boolean variables/functions use `is`, `has`, `can`, `should`, `was`, or `will` prefix.
- Test file co-location — `<filename>.test.ts` next to the source file, no `__tests__` directories.
- Test coverage threshold: 90% for statements, lines, functions, and branches (per root `CLAUDE.md`) — applies to the new `packages/shared-metrics` package.
- Boy Scout Rule: fix small nearby issues in files you touch (e.g. the missing `service` field in `notification-service`'s health router) in the same commit; anything larger gets its own note, not silently ignored.
- Business logic never lives in a router/controller; this plan only adds cross-cutting middleware and infra config, no domain logic changes.

---

## Important context discovered during planning

`packages/shared-logger` already exists, fully built and tested (pino, `requestContextMiddleware`, `createLogger`), but **no service currently imports or uses it** — every service's `main.ts` only has bare `console.error` calls. This plan wires `shared-logger` into all 7 backend services for the first time (Task 2–8), alongside the new `shared-metrics` package, since without it there are no structured logs for Loki to ship.

Existing per-service health-check `service` field values (already a de facto convention) are reused as the `service` label for both logs and metrics, so dashboards/queries are consistent with what's already in each service's `/health` response:

| App directory | `service` value used (from existing `/health`) |
|---|---|
| `apps/user-auth` | `user-auth` |
| `apps/catalogue` | `catalogue` |
| `apps/auction-engine` | `auction-engine` |
| `apps/payment` | `payment` |
| `apps/notification-service` | *(none set today — added in Task 6)* → `notification` |
| `apps/shipping` | `shipping` |
| `apps/admin` | `admin` |

---

## Task 1: Create `packages/shared-metrics`

**Files:**
- Create: `packages/shared-metrics/package.json`
- Create: `packages/shared-metrics/tsconfig.json`
- Create: `packages/shared-metrics/src/metrics.ts`
- Create: `packages/shared-metrics/src/metrics.test.ts`
- Create: `packages/shared-metrics/src/middleware.ts`
- Create: `packages/shared-metrics/src/middleware.test.ts`
- Create: `packages/shared-metrics/src/index.ts`

**Interfaces:**
- Consumes: nothing (foundational package).
- Produces (used by Tasks 2–8):
  - `createMetrics(config: { service: string }): Metrics`
  - `interface Metrics { registry: Registry; httpRequestDuration: Histogram<'method' | 'route' | 'status'>; httpRequestsTotal: Counter<'method' | 'route' | 'status'> }`
  - `httpMetricsMiddleware(metrics: Metrics): MiddlewareHandler` (Hono middleware)
  - `metricsRoute(metrics: Metrics): (c: Context) => Promise<Response>` (Hono handler for `GET /metrics`)

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "@carat-room/shared-metrics",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run --coverage"
  },
  "dependencies": {
    "hono": "^4.4.0",
    "prom-client": "^15.1.3"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "@types/node": "^20.0.0",
    "@vitest/coverage-v8": "^3.2.4",
    "typescript": "^5.4.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create the TypeScript config (mirrors `packages/shared-logger/tsconfig.json`)**

```json
{
  "extends": "@carat-room/tsconfig/service",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "dist"]
}
```

- [ ] **Step 3: Write the failing test for `createMetrics`**

```typescript
// packages/shared-metrics/src/metrics.test.ts
import { describe, it, expect } from 'vitest';
import { createMetrics } from './metrics';

describe('createMetrics', () => {
  it('should_setServiceAsDefaultLabel_when_created', async () => {
    const metrics = createMetrics({ service: 'test-service' });

    const output = await metrics.registry.metrics();

    expect(output).toContain('service="test-service"');
  });

  it('should_registerHttpRequestMetrics_when_created', async () => {
    const metrics = createMetrics({ service: 'test-service' });

    metrics.httpRequestDuration.observe({ method: 'GET', route: '/health', status: '200' }, 0.05);
    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/health', status: '200' });
    const output = await metrics.registry.metrics();

    expect(output).toContain('http_request_duration_seconds');
    expect(output).toContain('http_requests_total');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd packages/shared-metrics && npx vitest run src/metrics.test.ts`
Expected: FAIL with "Cannot find module './metrics'"

- [ ] **Step 5: Implement `createMetrics`**

```typescript
// packages/shared-metrics/src/metrics.ts
import { Registry, Histogram, Counter, collectDefaultMetrics } from 'prom-client';

export interface MetricsConfig {
  service: string;
}

export interface Metrics {
  registry: Registry;
  httpRequestDuration: Histogram<'method' | 'route' | 'status'>;
  httpRequestsTotal: Counter<'method' | 'route' | 'status'>;
}

export function createMetrics(config: MetricsConfig): Metrics {
  const registry = new Registry();
  registry.setDefaultLabels({ service: config.service });
  collectDefaultMetrics({ register: registry });

  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });

  const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });

  return { registry, httpRequestDuration, httpRequestsTotal };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd packages/shared-metrics && npx vitest run src/metrics.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Write the failing test for the Hono middleware and metrics route**

```typescript
// packages/shared-metrics/src/middleware.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createMetrics } from './metrics';
import { httpMetricsMiddleware, metricsRoute } from './middleware';

describe('httpMetricsMiddleware', () => {
  it('should_recordRequestDurationAndCount_when_requestCompletes', async () => {
    const metrics = createMetrics({ service: 'test-service' });
    const app = new Hono();
    app.use('*', httpMetricsMiddleware(metrics));
    app.get('/health', (c) => c.json({ status: 'ok' }));
    app.get('/metrics', metricsRoute(metrics));

    await app.request('/health');
    const metricsResponse = await app.request('/metrics');
    const body = await metricsResponse.text();

    expect(body).toContain('http_requests_total{service="test-service",method="GET",route="/health",status="200"} 1');
  });

  it('should_labelRouteAsUnmatched_when_noRouteMatches', async () => {
    const metrics = createMetrics({ service: 'test-service' });
    const app = new Hono();
    app.use('*', httpMetricsMiddleware(metrics));
    app.get('/metrics', metricsRoute(metrics));

    await app.request('/does-not-exist');
    const metricsResponse = await app.request('/metrics');
    const body = await metricsResponse.text();

    expect(body).toContain('route="unmatched"');
  });
});

describe('metricsRoute', () => {
  it('should_returnPrometheusContentType_when_called', async () => {
    const metrics = createMetrics({ service: 'test-service' });
    const app = new Hono();
    app.get('/metrics', metricsRoute(metrics));

    const response = await app.request('/metrics');

    expect(response.headers.get('content-type')).toContain('text/plain');
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `cd packages/shared-metrics && npx vitest run src/middleware.test.ts`
Expected: FAIL with "Cannot find module './middleware'"

- [ ] **Step 9: Implement the middleware and metrics route**

```typescript
// packages/shared-metrics/src/middleware.ts
import { type Context, type MiddlewareHandler } from 'hono';
import { type Metrics } from './metrics';

export function httpMetricsMiddleware(metrics: Metrics): MiddlewareHandler {
  return async (c, next) => {
    const startedAt = process.hrtime.bigint();

    await next();

    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const route = c.req.routePath === '/*' ? 'unmatched' : c.req.routePath;
    const labels = { method: c.req.method, route, status: String(c.res.status) };

    metrics.httpRequestDuration.observe(labels, durationSeconds);
    metrics.httpRequestsTotal.inc(labels);
  };
}

export function metricsRoute(metrics: Metrics): (c: Context) => Promise<Response> {
  return async (c) => {
    const body = await metrics.registry.metrics();
    return c.text(body, 200, { 'Content-Type': metrics.registry.contentType });
  };
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `cd packages/shared-metrics && npx vitest run src/middleware.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 11: Create the barrel export**

```typescript
// packages/shared-metrics/src/index.ts
export { createMetrics } from './metrics';
export type { Metrics, MetricsConfig } from './metrics';

export { httpMetricsMiddleware, metricsRoute } from './middleware';
```

- [ ] **Step 12: Install dependencies, build, run full coverage**

Run: `pnpm install && cd packages/shared-metrics && npx tsc --build && npx vitest run --coverage`
Expected: build succeeds with no type errors; all 5 tests pass; coverage ≥ 90% statements/lines/functions/branches.

- [ ] **Step 13: Commit**

```bash
git add packages/shared-metrics
git commit -m "feat(shared-metrics): add Prometheus metrics package for Hono services"
```

---

## Task 2: Wire logging + metrics into `user-auth`

**Files:**
- Modify: `apps/user-auth/package.json`
- Modify: `apps/user-auth/src/main.ts:1-5, 92-94, 156-160`

**Interfaces:**
- Consumes: `createLogger`, `requestContextMiddleware` from `@carat-room/shared-logger` (existing, unused until now); `createMetrics`, `httpMetricsMiddleware`, `metricsRoute` from `@carat-room/shared-metrics` (Task 1).
- Produces: `GET /metrics` on `user-auth` (port 3001), structured JSON logs on stdout labelled `service: "user-auth"`.

- [ ] **Step 1: Add the new workspace dependencies**

Edit `apps/user-auth/package.json`, in `"dependencies"` add:

```json
    "@carat-room/shared-logger": "workspace:*",
    "@carat-room/shared-metrics": "workspace:*",
```

(alphabetical position: after `@carat-room/shared-events` and before `@carat-room/shared-rate-limit`)

- [ ] **Step 2: Add the imports**

In `apps/user-auth/src/main.ts`, after the existing `import { authMiddleware, JwtPayload } from '@carat-room/shared-auth';` line, add:

```typescript
import { createLogger, requestContextMiddleware } from '@carat-room/shared-logger';
import { createMetrics, httpMetricsMiddleware, metricsRoute } from '@carat-room/shared-metrics';
```

- [ ] **Step 3: Instantiate the logger and metrics, and mount them first**

Replace:

```typescript
  const app = new Hono<AppEnv>();

  app.get('/health', (c) => c.json({ status: 'ok', service: 'user-auth' }));
```

With:

```typescript
  const logger = createLogger({ service: 'user-auth', pretty: process.env.NODE_ENV !== 'production' });
  const metrics = createMetrics({ service: 'user-auth' });

  const app = new Hono<AppEnv>();

  app.use('*', requestContextMiddleware(logger));
  app.use('*', httpMetricsMiddleware(metrics));

  app.get('/health', (c) => c.json({ status: 'ok', service: 'user-auth' }));
  app.get('/metrics', metricsRoute(metrics));
```

- [ ] **Step 4: Replace the bare `console.error` fatal handler**

Replace:

```typescript
main().catch((err) => {
  console.error('Fatal error:', err);
```

With:

```typescript
main().catch((err) => {
  createLogger({ service: 'user-auth' }).fatal({ err }, 'Fatal error during startup');
```

(leave the rest of that catch block, e.g. `process.exit(1)`, unchanged)

- [ ] **Step 5: Install and build**

Run: `pnpm install && cd apps/user-auth && npx tsc --build`
Expected: no type errors.

- [ ] **Step 6: Run existing tests to confirm no regression**

Run: `cd apps/user-auth && npx vitest run`
Expected: all existing tests still PASS (this task adds no new test file — it's middleware wiring with no new branching logic, already covered indirectly by every route test hitting the app through `app.fetch`).

- [ ] **Step 7: Manually verify `/metrics` and structured logs**

Run: `cd apps/user-auth && npx tsx --env-file .env src/main.ts` (requires local Postgres/Redis/RabbitMQ up via `docker compose up -d postgres redis rabbitmq`)
Then in another terminal: `curl localhost:3001/health` then `curl localhost:3001/metrics`
Expected: `/health` returns `{"status":"ok","service":"user-auth"}`; `/metrics` returns Prometheus text format including `http_requests_total{service="user-auth",method="GET",route="/health",status="200"}`; the service's stdout shows one JSON line per request with `"service":"user-auth"` and a `logEvent` field.

- [ ] **Step 8: Commit**

```bash
git add apps/user-auth/package.json apps/user-auth/src/main.ts pnpm-lock.yaml
git commit -m "feat(user-auth): wire structured logging and Prometheus metrics"
```

---

## Task 3: Wire logging + metrics into `catalogue`

**Files:**
- Modify: `apps/catalogue/package.json`
- Modify: `apps/catalogue/src/main.ts:1-5, 78-80`

**Interfaces:**
- Consumes: same `@carat-room/shared-logger` / `@carat-room/shared-metrics` exports as Task 2.
- Produces: `GET /metrics` on `catalogue` (port 3002), logs labelled `service: "catalogue"`.

Note: `catalogue`'s `main.ts` is module-top-level code (no `async function main()` wrapper), unlike `user-auth`.

- [ ] **Step 1: Add the new workspace dependencies**

Edit `apps/catalogue/package.json`, in `"dependencies"` add (alphabetical order):

```json
    "@carat-room/shared-logger": "workspace:*",
    "@carat-room/shared-metrics": "workspace:*",
```

- [ ] **Step 2: Add the imports**

In `apps/catalogue/src/main.ts`, after `import { authMiddleware, JwtPayload } from '@carat-room/shared-auth';`, add:

```typescript
import { createLogger, requestContextMiddleware } from '@carat-room/shared-logger';
import { createMetrics, httpMetricsMiddleware, metricsRoute } from '@carat-room/shared-metrics';
```

- [ ] **Step 3: Instantiate and mount**

Replace:

```typescript
const app = new Hono<AppEnv>();

app.get('/health', c => c.json({ status: 'ok', service: 'catalogue' }));
```

With:

```typescript
const logger = createLogger({ service: 'catalogue', pretty: process.env.NODE_ENV !== 'production' });
const metrics = createMetrics({ service: 'catalogue' });

const app = new Hono<AppEnv>();

app.use('*', requestContextMiddleware(logger));
app.use('*', httpMetricsMiddleware(metrics));

app.get('/health', c => c.json({ status: 'ok', service: 'catalogue' }));
app.get('/metrics', metricsRoute(metrics));
```

- [ ] **Step 4: Find and replace the fatal-error console.error**

Run: `grep -n "console.error" apps/catalogue/src/main.ts`
Expected: one match near the `runMigrations`/startup error path (e.g. `console.error('Failed to apply catalogue migrations:', err);`). Replace that line's `console.error(...)` call with `createLogger({ service: 'catalogue' }).error({ err }, 'Failed to apply catalogue migrations');`, keeping the surrounding `try`/`catch`/`process.exit` structure unchanged.

- [ ] **Step 5: Install and build**

Run: `pnpm install && cd apps/catalogue && npx tsc --build`
Expected: no type errors.

- [ ] **Step 6: Run existing tests**

Run: `cd apps/catalogue && npx vitest run`
Expected: all existing tests PASS.

- [ ] **Step 7: Manually verify**

Run: `docker compose up -d postgres redis rabbitmq && cd apps/catalogue && npx tsx --env-file .env src/main.ts`
Then: `curl localhost:3002/health` and `curl localhost:3002/metrics`
Expected: same shape as Task 2 Step 7, with `service="catalogue"`.

- [ ] **Step 8: Commit**

```bash
git add apps/catalogue/package.json apps/catalogue/src/main.ts pnpm-lock.yaml
git commit -m "feat(catalogue): wire structured logging and Prometheus metrics"
```

---

## Task 4: Wire logging + metrics into `auction-engine`

**Files:**
- Modify: `apps/auction-engine/package.json`
- Modify: `apps/auction-engine/src/presentation/auction-router.ts:1-6, 22-44`
- Modify: `apps/auction-engine/src/main.ts:1-8, 91-120`

**Interfaces:**
- Consumes: same `@carat-room/shared-logger` / `@carat-room/shared-metrics` exports as Task 2.
- Produces: `GET /metrics` on `auction-engine` (port 3003), logs labelled `service: "auction-engine"`.

Note: unlike the other 6 services, `auction-engine` builds its Hono `app` inside `createAuctionRouter()` (in `auction-router.ts`), not directly in `main.ts` — the middleware must be added there, as the first `app.use()` calls, so it wraps every route including `/health`.

- [ ] **Step 1: Add the new workspace dependencies**

Edit `apps/auction-engine/package.json`, in `"dependencies"` add (alphabetical order, after `@carat-room/shared-events`):

```json
    "@carat-room/shared-logger": "workspace:*",
    "@carat-room/shared-metrics": "workspace:*",
```

- [ ] **Step 2: Add `logger`/`metrics` to `AuctionRouterDeps` and mount the middleware first**

In `apps/auction-engine/src/presentation/auction-router.ts`, after the existing import `import type { JwtPayload } from '@carat-room/shared-auth';`, add:

```typescript
import { type Logger } from 'pino';
import { requestContextMiddleware } from '@carat-room/shared-logger';
import { type Metrics, httpMetricsMiddleware, metricsRoute } from '@carat-room/shared-metrics';
```

Then extend the interface — replace:

```typescript
export interface AuctionRouterDeps {
  getActiveLots: GetActiveLotsHandler;
```

With:

```typescript
export interface AuctionRouterDeps {
  logger: Logger;
  metrics: Metrics;
  getActiveLots: GetActiveLotsHandler;
```

Then mount the middleware before anything else — replace:

```typescript
export function createAuctionRouter(deps: AuctionRouterDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', deps.defaultRateLimit);

  app.get('/health', (c) => c.json({ status: 'ok', service: 'auction-engine' }));
```

With:

```typescript
export function createAuctionRouter(deps: AuctionRouterDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', requestContextMiddleware(deps.logger));
  app.use('*', httpMetricsMiddleware(deps.metrics));
  app.use('*', deps.defaultRateLimit);

  app.get('/health', (c) => c.json({ status: 'ok', service: 'auction-engine' }));
  app.get('/metrics', metricsRoute(deps.metrics));
```

- [ ] **Step 3: Add the imports and instantiate logger/metrics in `main.ts`**

In `apps/auction-engine/src/main.ts`, after `import { buildAuctionEngineRateLimits } from './presentation/rate-limits';`, add:

```typescript
import { createLogger } from '@carat-room/shared-logger';
import { createMetrics } from '@carat-room/shared-metrics';
```

- [ ] **Step 4: Pass `logger`/`metrics` into `createAuctionRouter`**

Replace:

```typescript
  const redisClient = new Redis(redis);
  const rateLimits = buildAuctionEngineRateLimits(redisClient);

  // HTTP server
  const app = createAuctionRouter({
    getActiveLots: getActiveLotsHandler,
```

With:

```typescript
  const redisClient = new Redis(redis);
  const rateLimits = buildAuctionEngineRateLimits(redisClient);
  const logger = createLogger({ service: 'auction-engine', pretty: process.env.NODE_ENV !== 'production' });
  const metrics = createMetrics({ service: 'auction-engine' });

  // HTTP server
  const app = createAuctionRouter({
    logger,
    metrics,
    getActiveLots: getActiveLotsHandler,
```

- [ ] **Step 5: Replace the fatal-error console usage**

Replace:

```typescript
  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`Auction Engine running on :${PORT}`);
  });
}

main().catch(console.error);
```

With:

```typescript
  serve({ fetch: app.fetch, port: PORT }, () => {
    logger.info({ logEvent: 'SERVER_STARTED', payload: { port: PORT } }, `Auction Engine running on :${PORT}`);
  });
}

main().catch((err) => {
  createLogger({ service: 'auction-engine' }).fatal({ err }, 'Fatal error during startup');
  process.exit(1);
});
```

- [ ] **Step 6: Install and build**

Run: `pnpm install && cd apps/auction-engine && npx tsc --build`
Expected: type errors at `apps/auction-engine/src/presentation/auction-router.test.ts:50` and `:385` — both call `createAuctionRouter({...})` without `logger`/`metrics`. Fix both call sites in the same commit: at line 51 (`getActiveLots: mockGetActiveLots,`) and the equivalent line 386, add two lines directly above:

```typescript
  logger: createLogger({ service: 'auction-engine' }),
  metrics: createMetrics({ service: 'auction-engine' }),
```

Add the same two imports used in `main.ts` (`createLogger` from `@carat-room/shared-logger`, `createMetrics` from `@carat-room/shared-metrics`) to the top of `auction-router.test.ts`. Each `createAuctionRouter(...)` call creates its own `Registry` via `createMetrics`, so both call sites using the same `'auction-engine'` service label is safe — `prom-client`'s "metric already registered" error is per-`Registry`, not global.

- [ ] **Step 7: Run existing tests**

Run: `cd apps/auction-engine && npx vitest run`
Expected: all tests PASS after any call-site fixes from Step 6.

- [ ] **Step 8: Manually verify**

Run: `docker compose up -d postgres redis rabbitmq && cd apps/auction-engine && npx tsx --env-file .env src/main.ts`
Then: `curl localhost:3003/health` and `curl localhost:3003/metrics`
Expected: same shape as Task 2 Step 7, with `service="auction-engine"`.

- [ ] **Step 9: Commit**

```bash
git add apps/auction-engine/package.json apps/auction-engine/src/main.ts apps/auction-engine/src/presentation/auction-router.ts pnpm-lock.yaml
git commit -m "feat(auction-engine): wire structured logging and Prometheus metrics"
```

---

## Task 5: Wire logging + metrics into `payment`

**Files:**
- Modify: `apps/payment/package.json`
- Modify: `apps/payment/src/main.ts:1-8, 96-127, 129`

**Interfaces:**
- Consumes: same `@carat-room/shared-logger` / `@carat-room/shared-metrics` exports as Task 2.
- Produces: `GET /metrics` on `payment` (port 3004), logs labelled `service: "payment"`.

- [ ] **Step 1: Add the new workspace dependencies**

Edit `apps/payment/package.json`, in `"dependencies"` add (alphabetical order, after `@carat-room/shared-events` if present, else after `@carat-room/shared-auth`):

```json
    "@carat-room/shared-logger": "workspace:*",
    "@carat-room/shared-metrics": "workspace:*",
```

- [ ] **Step 2: Add the imports**

In `apps/payment/src/main.ts`, after `import { createAmqpConnection, EventPublisher, EventSubscriber } from '@carat-room/shared-events';`, add:

```typescript
import { createLogger, requestContextMiddleware } from '@carat-room/shared-logger';
import { createMetrics, httpMetricsMiddleware, metricsRoute } from '@carat-room/shared-metrics';
```

- [ ] **Step 3: Instantiate and mount**

Replace:

```typescript
  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok', service: 'payment' }));
```

With:

```typescript
  const logger = createLogger({ service: 'payment', pretty: process.env.NODE_ENV !== 'production' });
  const metrics = createMetrics({ service: 'payment' });

  const app = new Hono();
  app.use('*', requestContextMiddleware(logger));
  app.use('*', httpMetricsMiddleware(metrics));
  app.get('/health', (c) => c.json({ status: 'ok', service: 'payment' }));
  app.get('/metrics', metricsRoute(metrics));
```

- [ ] **Step 4: Replace the startup log and fatal handler**

Replace:

```typescript
  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`Payment service running on port ${PORT}`);
  });
}

main();
```

With:

```typescript
  serve({ fetch: app.fetch, port: PORT }, () => {
    logger.info({ logEvent: 'SERVER_STARTED', payload: { port: PORT } }, `Payment service running on port ${PORT}`);
  });
}

main().catch((err) => {
  createLogger({ service: 'payment' }).fatal({ err }, 'Fatal error during startup');
  process.exit(1);
});
```

- [ ] **Step 5: Install and build**

Run: `pnpm install && cd apps/payment && npx tsc --build`
Expected: no type errors.

- [ ] **Step 6: Run existing tests**

Run: `cd apps/payment && npx vitest run`
Expected: all tests PASS.

- [ ] **Step 7: Manually verify**

Run: `docker compose up -d postgres redis rabbitmq && cd apps/payment && npx tsx --env-file .env src/main.ts`
Then: `curl localhost:3004/health` and `curl localhost:3004/metrics`
Expected: same shape as Task 2 Step 7, with `service="payment"`.

- [ ] **Step 8: Commit**

```bash
git add apps/payment/package.json apps/payment/src/main.ts pnpm-lock.yaml
git commit -m "feat(payment): wire structured logging and Prometheus metrics"
```

---

## Task 6: Wire logging + metrics into `notification-service`

**Files:**
- Modify: `apps/notification-service/package.json`
- Modify: `apps/notification-service/src/main.ts:1-13, 66-78`
- Modify: `apps/notification-service/src/presentation/health-router.ts`

**Interfaces:**
- Consumes: same `@carat-room/shared-logger` / `@carat-room/shared-metrics` exports as Task 2.
- Produces: `GET /metrics` on `notification-service` (port 3005), logs labelled `service: "notification"`.

Boy Scout Rule: `health-router.ts` is missing the `service` field every other service's `/health` sets — fixed here since this task already touches the file.

- [ ] **Step 1: Add the new workspace dependencies**

Edit `apps/notification-service/package.json`, in `"dependencies"` add (alphabetical order, after `@carat-room/shared-events`):

```json
    "@carat-room/shared-logger": "workspace:*",
    "@carat-room/shared-metrics": "workspace:*",
```

- [ ] **Step 2: Fix the health router's missing `service` field**

Replace the entire contents of `apps/notification-service/src/presentation/health-router.ts`:

```typescript
import { Hono } from 'hono';

export const healthRouter = new Hono();

healthRouter.get('/health', (c) => c.json({ status: 'ok', service: 'notification' }));
```

- [ ] **Step 3: Add the imports**

In `apps/notification-service/src/main.ts`, after `import { buildNotificationRateLimits } from './presentation/rate-limits.js';`, add:

```typescript
import { createLogger, requestContextMiddleware } from '@carat-room/shared-logger';
import { createMetrics, httpMetricsMiddleware, metricsRoute } from '@carat-room/shared-metrics';
```

- [ ] **Step 4: Instantiate and mount**

Replace:

```typescript
  const app = new Hono();
  app.use('*', rateLimits.default);
  app.route('/', healthRouter);
```

With:

```typescript
  const logger = createLogger({ service: 'notification', pretty: process.env.NODE_ENV !== 'production' });
  const metrics = createMetrics({ service: 'notification' });

  const app = new Hono();
  app.use('*', requestContextMiddleware(logger));
  app.use('*', httpMetricsMiddleware(metrics));
  app.use('*', rateLimits.default);
  app.route('/', healthRouter);
  app.get('/metrics', metricsRoute(metrics));
```

- [ ] **Step 5: Replace the startup log and fatal handler**

Replace:

```typescript
  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`[NotificationService] Listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('[NotificationService] Fatal error:', err);
  process.exit(1);
});
```

With:

```typescript
  serve({ fetch: app.fetch, port: PORT }, () => {
    logger.info({ logEvent: 'SERVER_STARTED', payload: { port: PORT } }, `Notification service listening on port ${PORT}`);
  });
}

main().catch((err) => {
  createLogger({ service: 'notification' }).fatal({ err }, 'Fatal error during startup');
  process.exit(1);
});
```

- [ ] **Step 6: Install and build**

Run: `pnpm install && cd apps/notification-service && npx tsc --build`
Expected: no type errors. No existing test asserts the `GET /health` response body, so Step 2's field addition needs no test updates.

- [ ] **Step 7: Run existing tests**

Run: `cd apps/notification-service && npx vitest run`
Expected: all tests PASS.

- [ ] **Step 8: Manually verify**

Run: `docker compose up -d postgres redis rabbitmq && cd apps/notification-service && npx tsx --env-file .env src/main.ts`
Then: `curl localhost:3005/health` and `curl localhost:3005/metrics`
Expected: `/health` now returns `{"status":"ok","service":"notification"}`; `/metrics` shows `service="notification"`.

- [ ] **Step 9: Commit**

```bash
git add apps/notification-service/package.json apps/notification-service/src/main.ts apps/notification-service/src/presentation/health-router.ts pnpm-lock.yaml
git commit -m "feat(notification-service): wire structured logging and Prometheus metrics"
```

---

## Task 7: Wire logging + metrics into `shipping`

**Files:**
- Modify: `apps/shipping/package.json`
- Modify: `apps/shipping/src/main.ts:1-22, 65-90`

**Interfaces:**
- Consumes: same `@carat-room/shared-logger` / `@carat-room/shared-metrics` exports as Task 2.
- Produces: `GET /metrics` on `shipping` (port 3006), logs labelled `service: "shipping"`.

- [ ] **Step 1: Add the new workspace dependencies**

Edit `apps/shipping/package.json`, in `"dependencies"` add (alphabetical order, after `@carat-room/shared-events`):

```json
    "@carat-room/shared-logger": "workspace:*",
    "@carat-room/shared-metrics": "workspace:*",
```

- [ ] **Step 2: Add the imports**

In `apps/shipping/src/main.ts`, after `import { PaymentReceivedPayload } from '@carat-room/shared-types';`, add:

```typescript
import { createLogger, requestContextMiddleware } from '@carat-room/shared-logger';
import { createMetrics, httpMetricsMiddleware, metricsRoute } from '@carat-room/shared-metrics';
```

- [ ] **Step 3: Instantiate and mount**

Replace:

```typescript
  const app = new Hono<AppEnv>();

  app.get('/health', (c) => c.json({ status: 'ok', service: 'shipping' }));

  app.use('*', rateLimits.default);
```

With:

```typescript
  const logger = createLogger({ service: 'shipping', pretty: process.env.NODE_ENV !== 'production' });
  const metrics = createMetrics({ service: 'shipping' });

  const app = new Hono<AppEnv>();

  app.use('*', requestContextMiddleware(logger));
  app.use('*', httpMetricsMiddleware(metrics));

  app.get('/health', (c) => c.json({ status: 'ok', service: 'shipping' }));
  app.get('/metrics', metricsRoute(metrics));

  app.use('*', rateLimits.default);
```

- [ ] **Step 4: Replace the startup log and fatal handler**

Replace:

```typescript
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Shipping service listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

With:

```typescript
  serve({ fetch: app.fetch, port }, () => {
    logger.info({ logEvent: 'SERVER_STARTED', payload: { port } }, `Shipping service listening on port ${port}`);
  });
}

main().catch((err) => {
  createLogger({ service: 'shipping' }).fatal({ err }, 'Fatal error during startup');
  process.exit(1);
});
```

- [ ] **Step 5: Install and build**

Run: `pnpm install && cd apps/shipping && npx tsc --build`
Expected: no type errors.

- [ ] **Step 6: Run existing tests**

Run: `cd apps/shipping && npx vitest run`
Expected: all tests PASS.

- [ ] **Step 7: Manually verify**

Run: `docker compose up -d postgres redis rabbitmq && cd apps/shipping && npx tsx --env-file .env src/main.ts`
Then: `curl localhost:3006/health` and `curl localhost:3006/metrics`
Expected: same shape as Task 2 Step 7, with `service="shipping"`.

- [ ] **Step 8: Commit**

```bash
git add apps/shipping/package.json apps/shipping/src/main.ts pnpm-lock.yaml
git commit -m "feat(shipping): wire structured logging and Prometheus metrics"
```

---

## Task 8: Wire logging + metrics into `admin`

**Files:**
- Modify: `apps/admin/package.json`
- Modify: `apps/admin/src/main.ts:1-20, 55-80`

**Interfaces:**
- Consumes: same `@carat-room/shared-logger` / `@carat-room/shared-metrics` exports as Task 2.
- Produces: `GET /metrics` on `admin` (port 3007), logs labelled `service: "admin"`.

- [ ] **Step 1: Add the new workspace dependencies**

Edit `apps/admin/package.json`, in `"dependencies"` add (alphabetical order, after `@carat-room/db-migrate`):

```json
    "@carat-room/shared-logger": "workspace:*",
    "@carat-room/shared-metrics": "workspace:*",
```

- [ ] **Step 2: Add the imports**

In `apps/admin/src/main.ts`, after `import { buildAdminRateLimits } from './presentation/rate-limits';`, add:

```typescript
import { createLogger, requestContextMiddleware } from '@carat-room/shared-logger';
import { createMetrics, httpMetricsMiddleware, metricsRoute } from '@carat-room/shared-metrics';
```

- [ ] **Step 3: Instantiate and mount**

Replace:

```typescript
  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok', service: 'admin' }));
  app.use('*', rateLimits.default);
```

With:

```typescript
  const logger = createLogger({ service: 'admin', pretty: process.env.NODE_ENV !== 'production' });
  const metrics = createMetrics({ service: 'admin' });

  const app = new Hono();
  app.use('*', requestContextMiddleware(logger));
  app.use('*', httpMetricsMiddleware(metrics));
  app.get('/health', (c) => c.json({ status: 'ok', service: 'admin' }));
  app.get('/metrics', metricsRoute(metrics));
  app.use('*', rateLimits.default);
```

- [ ] **Step 4: Replace the startup log and fatal handler**

Replace:

```typescript
  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`Admin service running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start admin service:', err);
  process.exit(1);
});
```

With:

```typescript
  serve({ fetch: app.fetch, port: PORT }, () => {
    logger.info({ logEvent: 'SERVER_STARTED', payload: { port: PORT } }, `Admin service running on port ${PORT}`);
  });
}

main().catch((err) => {
  createLogger({ service: 'admin' }).fatal({ err }, 'Failed to start admin service');
  process.exit(1);
});
```

- [ ] **Step 5: Install and build**

Run: `pnpm install && cd apps/admin && npx tsc --build`
Expected: no type errors.

- [ ] **Step 6: Run existing tests**

Run: `cd apps/admin && npx vitest run`
Expected: all tests PASS.

- [ ] **Step 7: Manually verify**

Run: `docker compose up -d postgres redis rabbitmq && cd apps/admin && npx tsx --env-file .env src/main.ts`
Then: `curl localhost:3007/health` and `curl localhost:3007/metrics`
Expected: same shape as Task 2 Step 7, with `service="admin"`.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/package.json apps/admin/src/main.ts pnpm-lock.yaml
git commit -m "feat(admin): wire structured logging and Prometheus metrics"
```

---

## Task 9: Loki configuration

**Files:**
- Create: `infra/loki/loki-config.yaml`

**Interfaces:**
- Consumes: nothing.
- Produces: Loki server config, mounted by the `loki` container in Task 15 (production) and Task 17 (dev/E2E) at `/etc/loki/loki-config.yaml`.

- [ ] **Step 1: Create the Loki config**

```yaml
# infra/loki/loki-config.yaml
auth_enabled: false

server:
  http_listen_port: 3100

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 720h
  ingestion_rate_mb: 16
  ingestion_burst_size_mb: 32

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
  delete_request_store: filesystem
```

- [ ] **Step 2: Validate the YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('infra/loki/loki-config.yaml'))"`
Expected: no output (valid YAML, no exception).

- [ ] **Step 3: Commit**

```bash
git add infra/loki/loki-config.yaml
git commit -m "feat(observability): add Loki configuration"
```

---

## Task 10: Promtail configuration

**Files:**
- Create: `infra/promtail/promtail-config.yaml`

**Interfaces:**
- Consumes: Loki's push API at `http://loki:3100/loki/api/v1/push` (Task 9's `loki` service, same Docker network).
- Produces: Promtail config, mounted by the `promtail` container in Task 15 (production) and Task 17 (dev/E2E) at `/etc/promtail/promtail-config.yaml`. Promtail also needs `/var/run/docker.sock` mounted read-only (wired in Task 15/17) for Docker service discovery.

- [ ] **Step 1: Create the Promtail config**

```yaml
# infra/promtail/promtail-config.yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'
      - source_labels: ['__meta_docker_container_log_stream']
        target_label: 'stream'
    pipeline_stages:
      - json:
          expressions:
            service: service
            level: level
            logEvent: logEvent
      - labels:
          service:
          level:
          logEvent:
```

The `json` pipeline stage parses each pino JSON log line and lifts `service`, `level`, and `logEvent` (the fields already emitted by `requestContextMiddleware`, wired in Tasks 2–8) into Loki labels, so Grafana's Logs Explorer dashboard (Task 13) can filter by them directly. Non-JSON lines (rare — e.g. a raw crash trace) are still shipped, just without those extra labels.

- [ ] **Step 2: Validate the YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('infra/promtail/promtail-config.yaml'))"`
Expected: no output (valid YAML, no exception).

- [ ] **Step 3: Commit**

```bash
git add infra/promtail/promtail-config.yaml
git commit -m "feat(observability): add Promtail configuration"
```

---

## Task 11: Prometheus configuration

**Files:**
- Create: `infra/prometheus/prometheus.yml`

**Interfaces:**
- Consumes: `GET /metrics` on each of the 7 backend services (Tasks 2–8, container names/ports per `docker-compose.yml`); cAdvisor, node-exporter, postgres-exporter, redis-exporter (Task 15); RabbitMQ's built-in `rabbitmq_prometheus` plugin, port 15692 (enabled in Task 15).
- Produces: scrape config mounted by the `prometheus` container at `/etc/prometheus/prometheus.yml`, feeding Grafana's Prometheus datasource (Task 13) and alert rules (Task 14).

- [ ] **Step 1: Create the Prometheus config**

```yaml
# infra/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: user-auth
    static_configs:
      - targets: ['user-service:3001']

  - job_name: catalogue
    static_configs:
      - targets: ['catalogue-service:3002']

  - job_name: auction-engine
    static_configs:
      - targets: ['auction-engine:3003']

  - job_name: payment
    static_configs:
      - targets: ['payment-service:3004']

  - job_name: notification
    static_configs:
      - targets: ['notification-service:3005']

  - job_name: shipping
    static_configs:
      - targets: ['shipping-service:3006']

  - job_name: admin
    static_configs:
      - targets: ['admin-service:3007']

  - job_name: cadvisor
    static_configs:
      - targets: ['cadvisor:8080']

  - job_name: node-exporter
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: postgres-exporter
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: redis-exporter
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: rabbitmq
    metrics_path: /metrics
    static_configs:
      - targets: ['rabbitmq:15692']
```

Note: `alerting.alertmanagers` points at the production `alertmanager` service (Task 15). The dev/E2E `docker-compose.observability.yml` (Task 17) reuses this same file but that service simply doesn't exist there — Prometheus logs a harmless "connection refused" for the Alertmanager target on startup in dev/E2E, which is expected since no alert rules are provisioned there either (Task 14 is production-only).

- [ ] **Step 2: Validate the YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('infra/prometheus/prometheus.yml'))"`
Expected: no output (valid YAML, no exception).

- [ ] **Step 3: Commit**

```bash
git add infra/prometheus/prometheus.yml
git commit -m "feat(observability): add Prometheus scrape configuration"
```

---

## Task 12: Alertmanager configuration (production only)

**Files:**
- Create: `infra/alertmanager/alertmanager.yml.template`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `SLACK_WEBHOOK_URL`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM` (new secrets, added to `.env`/deploy env in Task 16).
- Produces: rendered `infra/alertmanager/alertmanager.yml`, mounted by the `alertmanager` container (Task 15) at `/etc/alertmanager/alertmanager.yml`.

Alertmanager's config file format has no built-in `${VAR}` expansion, so secrets can't be baked into a committed YAML file directly. This task commits a `.template` file with placeholders and renders it to the real file (which contains secrets, so it's git-ignored) as part of the deploy step.

- [ ] **Step 1: Create the Alertmanager template**

```yaml
# infra/alertmanager/alertmanager.yml.template
global:
  smtp_from: '${ALERT_EMAIL_FROM}'
  smtp_smarthost: '${SMTP_HOST}:587'
  smtp_auth_username: '${SMTP_USER}'
  smtp_auth_password: '${SMTP_PASSWORD}'

route:
  receiver: slack-and-email
  group_by: ['alertname', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: slack-and-email
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#alerts'
        send_resolved: true
    email_configs:
      - to: '${ALERT_EMAIL_TO}'
        send_resolved: true
```

- [ ] **Step 2: Git-ignore the rendered file**

Append to `.gitignore`:

```
infra/alertmanager/alertmanager.yml
```

- [ ] **Step 3: Add the render step to the deploy sequence**

Document (and, where the deploy is scripted, add) this command to run on the Hetzner VM before `docker compose up`, after `.env` is populated:

```bash
export $(grep -v '^#' .env | xargs) && envsubst < infra/alertmanager/alertmanager.yml.template > infra/alertmanager/alertmanager.yml
```

`envsubst` ships in the `gettext-base` package — confirm with `which envsubst`; if missing on the VM, install with `apt-get install -y gettext-base` (one-time VM setup, not part of every deploy).

- [ ] **Step 4: Render locally and validate**

Run (with real or dummy env values exported first):

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T0/B0/x \
SMTP_HOST=smtp.example.com SMTP_USER=alerts@example.com SMTP_PASSWORD=x \
ALERT_EMAIL_TO=oncall@example.com ALERT_EMAIL_FROM=alerts@example.com \
envsubst < infra/alertmanager/alertmanager.yml.template > /tmp/alertmanager.yml
python3 -c "import yaml; yaml.safe_load(open('/tmp/alertmanager.yml'))"
```

Expected: no output from the `python3` command (valid YAML with all placeholders substituted).

- [ ] **Step 5: Commit**

```bash
git add infra/alertmanager/alertmanager.yml.template .gitignore
git commit -m "feat(observability): add Alertmanager configuration template"
```

---

## Task 13: Grafana datasources and dashboards (provisioned as code)

**Files:**
- Create: `infra/grafana/provisioning/datasources/datasources.yml`
- Create: `infra/grafana/provisioning/dashboards/dashboards.yml`
- Create: `infra/grafana/provisioning/dashboards/json/service-overview.json`
- Create: `infra/grafana/provisioning/dashboards/json/logs-explorer.json`
- Create: `infra/grafana/provisioning/dashboards/json/infra.json`
- Create: `infra/grafana/provisioning/dashboards/json/data-layer.json`

**Interfaces:**
- Consumes: Prometheus at `http://prometheus:9090` (Task 11), Loki at `http://loki:3100` (Task 9). Datasource UIDs `prometheus_uid` / `loki_uid` are referenced by Task 14's alert rules.
- Produces: two datasources and 4 dashboards, auto-loaded on Grafana startup by both the production Grafana (Task 15) and dev/E2E Grafana (Task 17), which both mount `infra/grafana/provisioning/`.

- [ ] **Step 1: Create the datasources provisioning file**

```yaml
# infra/grafana/provisioning/datasources/datasources.yml
apiVersion: 1

datasources:
  - name: Prometheus
    uid: prometheus_uid
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true

  - name: Loki
    uid: loki_uid
    type: loki
    access: proxy
    url: http://loki:3100
```

- [ ] **Step 2: Create the dashboard provider config**

```yaml
# infra/grafana/provisioning/dashboards/dashboards.yml
apiVersion: 1

providers:
  - name: carat-room
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /etc/grafana/provisioning/dashboards/json
```

- [ ] **Step 3: Create the Service overview dashboard**

```json
{
  "title": "Service overview",
  "uid": "service-overview",
  "schemaVersion": 39,
  "tags": ["carat-room"],
  "timezone": "browser",
  "templating": {
    "list": [
      {
        "name": "service",
        "type": "query",
        "datasource": { "type": "prometheus", "uid": "prometheus_uid" },
        "query": "label_values(http_requests_total, service)",
        "refresh": 2,
        "includeAll": false
      }
    ]
  },
  "panels": [
    {
      "id": 1,
      "title": "Request rate by status",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus_uid" },
      "targets": [
        {
          "expr": "sum by (status) (rate(http_requests_total{service=\"$service\"}[5m]))",
          "legendFormat": "{{status}}"
        }
      ]
    },
    {
      "id": 2,
      "title": "Error rate (%)",
      "type": "stat",
      "gridPos": { "h": 8, "w": 6, "x": 12, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus_uid" },
      "targets": [
        {
          "expr": "sum(rate(http_requests_total{service=\"$service\",status=~\"5..\"}[5m])) / sum(rate(http_requests_total{service=\"$service\"}[5m])) * 100"
        }
      ]
    },
    {
      "id": 3,
      "title": "Latency p50 / p95 / p99",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 18, "x": 0, "y": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus_uid" },
      "targets": [
        {
          "expr": "histogram_quantile(0.50, sum by (le) (rate(http_request_duration_seconds_bucket{service=\"$service\"}[5m])))",
          "legendFormat": "p50"
        },
        {
          "expr": "histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{service=\"$service\"}[5m])))",
          "legendFormat": "p95"
        },
        {
          "expr": "histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{service=\"$service\"}[5m])))",
          "legendFormat": "p99"
        }
      ]
    }
  ]
}
```

- [ ] **Step 4: Create the Logs explorer dashboard**

```json
{
  "title": "Logs explorer",
  "uid": "logs-explorer",
  "schemaVersion": 39,
  "tags": ["carat-room"],
  "timezone": "browser",
  "templating": {
    "list": [
      {
        "name": "service",
        "type": "query",
        "datasource": { "type": "loki", "uid": "loki_uid" },
        "query": "label_values(service)",
        "refresh": 2,
        "includeAll": true,
        "multi": true
      },
      {
        "name": "level",
        "type": "query",
        "datasource": { "type": "loki", "uid": "loki_uid" },
        "query": "label_values(level)",
        "refresh": 2,
        "includeAll": true,
        "multi": true
      }
    ]
  },
  "panels": [
    {
      "id": 1,
      "title": "Logs",
      "type": "logs",
      "gridPos": { "h": 20, "w": 24, "x": 0, "y": 0 },
      "datasource": { "type": "loki", "uid": "loki_uid" },
      "targets": [
        {
          "expr": "{service=~\"$service\", level=~\"$level\"}"
        }
      ]
    }
  ]
}
```

- [ ] **Step 5: Create the Infra dashboard**

```json
{
  "title": "Infra",
  "uid": "infra",
  "schemaVersion": 39,
  "tags": ["carat-room"],
  "timezone": "browser",
  "panels": [
    {
      "id": 1,
      "title": "Host CPU usage (%)",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus_uid" },
      "targets": [
        {
          "expr": "100 - (avg by (instance) (rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)"
        }
      ]
    },
    {
      "id": 2,
      "title": "Host memory used (%)",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus_uid" },
      "targets": [
        {
          "expr": "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100"
        }
      ]
    },
    {
      "id": 3,
      "title": "Per-container CPU usage",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus_uid" },
      "targets": [
        {
          "expr": "sum by (name) (rate(container_cpu_usage_seconds_total{name!=\"\"}[5m]))"
        }
      ]
    },
    {
      "id": 4,
      "title": "Per-container memory usage",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus_uid" },
      "targets": [
        {
          "expr": "sum by (name) (container_memory_usage_bytes{name!=\"\"})"
        }
      ]
    }
  ]
}
```

- [ ] **Step 6: Create the Data layer dashboard**

```json
{
  "title": "Data layer",
  "uid": "data-layer",
  "schemaVersion": 39,
  "tags": ["carat-room"],
  "timezone": "browser",
  "panels": [
    {
      "id": 1,
      "title": "Postgres active connections",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus_uid" },
      "targets": [
        { "expr": "pg_stat_activity_count" }
      ]
    },
    {
      "id": 2,
      "title": "Redis memory used (bytes)",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus_uid" },
      "targets": [
        { "expr": "redis_memory_used_bytes" }
      ]
    },
    {
      "id": 3,
      "title": "RabbitMQ queue depth (ready messages)",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus_uid" },
      "targets": [
        { "expr": "sum by (queue) (rabbitmq_queue_messages_ready)" }
      ]
    },
    {
      "id": 4,
      "title": "RabbitMQ consumers per queue",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus_uid" },
      "targets": [
        { "expr": "sum by (queue) (rabbitmq_queue_consumers)" }
      ]
    }
  ]
}
```

- [ ] **Step 7: Validate all JSON parses**

Run: `for f in infra/grafana/provisioning/dashboards/json/*.json; do python3 -m json.tool "$f" > /dev/null && echo "$f OK"; done`
Expected: 4 lines, each ending in `OK`.

- [ ] **Step 8: Commit**

```bash
git add infra/grafana/provisioning
git commit -m "feat(observability): add Grafana datasources and dashboards"
```

---

## Task 14: Grafana alert rules (production only)

**Files:**
- Create: `infra/grafana/provisioning/alerting/contactpoints.yml`
- Create: `infra/grafana/provisioning/alerting/rules.yml`

**Interfaces:**
- Consumes: `prometheus_uid` / `loki_uid` datasources (Task 13); `${SLACK_WEBHOOK_URL}` / `${ALERT_EMAIL_TO}` (Task 16 env vars — Grafana, unlike Alertmanager, does expand `${VAR}` in its own provisioning files natively via `GF_...` env passthrough, so no `envsubst` step is needed here).
- Produces: 6 alert rules evaluated by Grafana, routed to the `slack-and-email` contact point. Each rule aggregates `by (service)`, so Grafana creates one alert instance per service automatically — no per-service duplication needed.

Each rule follows one PromQL/LogQL query (`refId: A`) feeding a threshold condition (`refId: B`), matching Grafana's unified-alerting provisioning schema.

- [ ] **Step 1: Create the contact point and notification policy**

```yaml
# infra/grafana/provisioning/alerting/contactpoints.yml
apiVersion: 1

contactPoints:
  - orgId: 1
    name: slack-and-email
    receivers:
      - uid: slack-receiver
        type: slack
        settings:
          url: '${SLACK_WEBHOOK_URL}'
      - uid: email-receiver
        type: email
        settings:
          addresses: '${ALERT_EMAIL_TO}'

policies:
  - orgId: 1
    receiver: slack-and-email
    group_by: ['alertname', 'service']
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
```

- [ ] **Step 2: Create the alert rules**

```yaml
# infra/grafana/provisioning/alerting/rules.yml
apiVersion: 1

groups:
  - orgId: 1
    name: service-health
    folder: Alerts
    interval: 1m
    rules:
      - uid: high-error-rate
        title: High error rate
        condition: B
        for: 5m
        noDataState: NoData
        execErrState: Error
        labels: { severity: critical }
        annotations:
          summary: '5xx rate for {{ $labels.service }} exceeds 5% over 5 minutes'
        data:
          - refId: A
            datasourceUid: prometheus_uid
            relativeTimeRange: { from: 300, to: 0 }
            model:
              refId: A
              expr: 'sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total[5m])) * 100'
          - refId: B
            datasourceUid: __expr__
            relativeTimeRange: { from: 300, to: 0 }
            model:
              refId: B
              type: threshold
              expression: A
              conditions:
                - evaluator: { type: gt, params: [5] }

      - uid: error-log-spike
        title: Error log spike
        condition: B
        for: 5m
        noDataState: NoData
        execErrState: Error
        labels: { severity: warning }
        annotations:
          summary: '{{ $labels.service }} is logging more than 10 error-level lines/min'
        data:
          - refId: A
            datasourceUid: loki_uid
            relativeTimeRange: { from: 300, to: 0 }
            model:
              refId: A
              expr: 'sum by (service) (count_over_time({level="error"}[1m]))'
          - refId: B
            datasourceUid: __expr__
            relativeTimeRange: { from: 300, to: 0 }
            model:
              refId: B
              type: threshold
              expression: A
              conditions:
                - evaluator: { type: gt, params: [10] }

      - uid: high-latency
        title: High latency
        condition: B
        for: 5m
        noDataState: NoData
        execErrState: Error
        labels: { severity: warning }
        annotations:
          summary: '{{ $labels.service }} p99 latency exceeds 2s over 5 minutes'
        data:
          - refId: A
            datasourceUid: prometheus_uid
            relativeTimeRange: { from: 300, to: 0 }
            model:
              refId: A
              expr: 'histogram_quantile(0.99, sum by (le, service) (rate(http_request_duration_seconds_bucket[5m])))'
          - refId: B
            datasourceUid: __expr__
            relativeTimeRange: { from: 300, to: 0 }
            model:
              refId: B
              type: threshold
              expression: A
              conditions:
                - evaluator: { type: gt, params: [2] }

      - uid: service-down
        title: Service down
        condition: B
        for: 2m
        noDataState: Alerting
        execErrState: Error
        labels: { severity: critical }
        annotations:
          summary: '{{ $labels.job }} scrape target has been unreachable for 2 minutes'
        data:
          - refId: A
            datasourceUid: prometheus_uid
            relativeTimeRange: { from: 300, to: 0 }
            model:
              refId: A
              expr: 'up{job=~"user-auth|catalogue|auction-engine|payment|notification|shipping|admin"}'
          - refId: B
            datasourceUid: __expr__
            relativeTimeRange: { from: 300, to: 0 }
            model:
              refId: B
              type: threshold
              expression: A
              conditions:
                - evaluator: { type: lt, params: [1] }

      - uid: queue-backlog
        title: Queue backlog
        condition: B
        for: 5m
        noDataState: NoData
        execErrState: Error
        labels: { severity: warning }
        annotations:
          summary: 'RabbitMQ queue {{ $labels.queue }} has messages ready but no consumers'
        data:
          - refId: A
            datasourceUid: prometheus_uid
            relativeTimeRange: { from: 300, to: 0 }
            model:
              refId: A
              expr: '(rabbitmq_queue_messages_ready > 100) and (rabbitmq_queue_consumers == 0)'
          - refId: B
            datasourceUid: __expr__
            relativeTimeRange: { from: 300, to: 0 }
            model:
              refId: B
              type: threshold
              expression: A
              conditions:
                - evaluator: { type: gt, params: [0] }

      - uid: db-connection-saturation
        title: DB connection saturation
        condition: B
        for: 5m
        noDataState: NoData
        execErrState: Error
        labels: { severity: warning }
        annotations:
          summary: 'Postgres connections exceed 80% of max_connections'
        data:
          - refId: A
            datasourceUid: prometheus_uid
            relativeTimeRange: { from: 300, to: 0 }
            model:
              refId: A
              expr: 'pg_stat_activity_count / pg_settings_max_connections * 100'
          - refId: B
            datasourceUid: __expr__
            relativeTimeRange: { from: 300, to: 0 }
            model:
              refId: B
              type: threshold
              expression: A
              conditions:
                - evaluator: { type: gt, params: [80] }
```

- [ ] **Step 3: Validate all YAML parses**

Run: `for f in infra/grafana/provisioning/alerting/*.yml; do python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" "$f" && echo "$f OK"; done`
Expected: 2 lines, each ending in `OK`.

- [ ] **Step 4: Commit**

```bash
git add infra/grafana/provisioning/alerting
git commit -m "feat(observability): add Grafana alert rules and Slack/email contact point"
```

---

## Task 15: Add production observability services to `docker-compose.yml`

**Files:**
- Create: `infra/rabbitmq/enabled_plugins`
- Modify: `docker-compose.yml:30-52` (rabbitmq service), `:245-248` (volumes block)

**Interfaces:**
- Consumes: `infra/loki/loki-config.yaml` (Task 9), `infra/promtail/promtail-config.yaml` (Task 10), `infra/prometheus/prometheus.yml` (Task 11), `infra/alertmanager/alertmanager.yml` (Task 12, rendered at deploy time), `infra/grafana/provisioning/` (Tasks 13–14).
- Produces: 9 new services (`loki`, `promtail`, `prometheus`, `cadvisor`, `node-exporter`, `postgres-exporter`, `redis-exporter`, `alertmanager`, `grafana`), all `profiles: [production]`, reachable by Task 16's Nginx `/grafana/` block and by each other over the default Compose network.

- [ ] **Step 1: Enable the RabbitMQ Prometheus plugin**

```
# infra/rabbitmq/enabled_plugins
[rabbitmq_management,rabbitmq_prometheus].
```

The stock `rabbitmq:3.13-management-alpine` image only pre-enables `rabbitmq_management`; this file overrides that list to also enable `rabbitmq_prometheus`, which exposes metrics on port 15692 (used by Task 11's `rabbitmq` scrape job).

- [ ] **Step 2: Mount the plugins file and expose the metrics port**

In `docker-compose.yml`, in the `rabbitmq` service, replace:

```yaml
    volumes:
      - ./infra/rabbitmq/definitions.json:/etc/rabbitmq/definitions.json
      - rabbitmq_data:/var/lib/rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
```

With:

```yaml
    volumes:
      - ./infra/rabbitmq/definitions.json:/etc/rabbitmq/definitions.json
      - ./infra/rabbitmq/enabled_plugins:/etc/rabbitmq/enabled_plugins:ro
      - rabbitmq_data:/var/lib/rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
      - "15692:15692"
```

- [ ] **Step 3: Add the observability services**

In `docker-compose.yml`, immediately before the `volumes:` top-level key at the end of the file, add:

```yaml
  loki:
    profiles: [production]
    image: grafana/loki:3.0.0
    volumes:
      - ./infra/loki/loki-config.yaml:/etc/loki/loki-config.yaml:ro
      - loki_data:/loki
    command: -config.file=/etc/loki/loki-config.yaml
    ports:
      - "3100:3100"
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:3100/ready || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  promtail:
    profiles: [production]
    image: grafana/promtail:3.0.0
    volumes:
      - ./infra/promtail/promtail-config.yaml:/etc/promtail/promtail-config.yaml:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/promtail-config.yaml
    depends_on:
      loki:
        condition: service_healthy

  prometheus:
    profiles: [production]
    image: prom/prometheus:v2.53.0
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus
      - --storage.tsdb.retention.time=30d
    ports:
      - "9090:9090"
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:9090/-/healthy || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  cadvisor:
    profiles: [production]
    image: gcr.io/cadvisor/cadvisor:v0.49.1
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    ports:
      - "8080:8080"

  node-exporter:
    profiles: [production]
    image: prom/node-exporter:v1.8.1
    pid: host
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - --path.procfs=/host/proc
      - --path.sysfs=/host/sys
      - --path.rootfs=/rootfs
    ports:
      - "9100:9100"

  postgres-exporter:
    profiles: [production]
    image: quay.io/prometheuscommunity/postgres-exporter:v0.15.0
    environment:
      DATA_SOURCE_URI: postgres:5432/postgres?sslmode=disable
      DATA_SOURCE_USER: postgres
      DATA_SOURCE_PASS: ${POSTGRES_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "9187:9187"

  redis-exporter:
    profiles: [production]
    image: oliver006/redis_exporter:v1.62.0
    environment:
      REDIS_ADDR: redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy
    ports:
      - "9121:9121"

  alertmanager:
    profiles: [production]
    image: prom/alertmanager:v0.27.0
    volumes:
      - ./infra/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
      - alertmanager_data:/alertmanager
    ports:
      - "9093:9093"
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:9093/-/healthy || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  grafana:
    profiles: [production]
    image: grafana/grafana:11.1.0
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
      GF_SERVER_ROOT_URL: https://yourdomain.com/grafana/
      GF_SERVER_SERVE_FROM_SUB_PATH: "true"
    volumes:
      - ./infra/grafana/provisioning:/etc/grafana/provisioning:ro
      - grafana_data:/var/lib/grafana
    depends_on:
      prometheus:
        condition: service_healthy
      loki:
        condition: service_healthy
    ports:
      - "3009:3000"

```

- [ ] **Step 4: Add the new named volumes**

Replace:

```yaml
volumes:
  postgres_data:
  rabbitmq_data:
```

With:

```yaml
volumes:
  postgres_data:
  rabbitmq_data:
  loki_data:
  prometheus_data:
  alertmanager_data:
  grafana_data:
```

- [ ] **Step 5: Validate the compose file parses**

Run: `docker compose -f docker-compose.yml --profile production config -q`
Expected: no output, exit code 0 (config is valid — this does not require secrets to be set since `config -q` only validates syntax/structure, not that every `${VAR}` resolves to a non-empty value).

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml infra/rabbitmq/enabled_plugins
git commit -m "feat(observability): add Loki, Prometheus, Grafana and exporters to production compose"
```

---

## Task 16: Nginx `/grafana/` route and new secrets

**Files:**
- Modify: `infra/nginx/nginx.conf:1-15, 58-64`
- Modify: `.env.example`

**Interfaces:**
- Consumes: the `grafana` service on port 3000 internally (Task 15).
- Produces: `https://yourdomain.com/grafana/`, IP-allowlisted the same way as `/admin/`; documents the 6 new secrets operators must set.

- [ ] **Step 1: Add the Grafana upstream**

In `infra/nginx/nginx.conf`, replace:

```nginx
  upstream user_portal          { server user-portal:3000; }
  upstream admin_portal         { server admin-portal:3008; }
```

With:

```nginx
  upstream user_portal          { server user-portal:3000; }
  upstream admin_portal         { server admin-portal:3008; }
  upstream grafana              { server grafana:3000; }
```

- [ ] **Step 2: Add the IP-allowlisted `/grafana/` location**

Replace:

```nginx
    location /admin/ {
      allow 10.0.0.0/8;
      deny all;
      proxy_pass http://admin_portal;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $remote_addr;
    }
    location / { proxy_pass http://user_portal; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; }
```

With:

```nginx
    location /admin/ {
      allow 10.0.0.0/8;
      deny all;
      proxy_pass http://admin_portal;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $remote_addr;
    }
    location /grafana/ {
      # Replace with your office/VPN IP range, same as /admin/ above
      allow 10.0.0.0/8;
      deny all;
      proxy_pass http://grafana;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $remote_addr;
    }
    location / { proxy_pass http://user_portal; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; }
```

- [ ] **Step 3: Document the new secrets**

Append to `.env.example`:

```
# Grafana
GRAFANA_ADMIN_PASSWORD=changeme

# Alerting (Slack + email, rendered into infra/alertmanager/alertmanager.yml via envsubst — see Task 12)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SMTP_HOST=smtp.example.com
SMTP_USER=alerts@example.com
SMTP_PASSWORD=
ALERT_EMAIL_TO=oncall@example.com
ALERT_EMAIL_FROM=alerts@example.com
```

- [ ] **Step 4: Validate the Nginx config syntax**

Run: `docker run --rm -v "$(pwd)/infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:alpine nginx -t`
Expected: `nginx: configuration file /etc/nginx/nginx.conf syntax is ok` and `test is successful`.

- [ ] **Step 5: Commit**

```bash
git add infra/nginx/nginx.conf .env.example
git commit -m "feat(observability): expose Grafana behind Nginx IP allowlist, document alert secrets"
```

---

## Task 17: `docker-compose.observability.yml` (shared dev/E2E stack)

**Files:**
- Create: `infra/prometheus/prometheus.dev.yml`
- Create: `docker-compose.observability.yml`
- Modify: `docker-compose.override.yml` (rabbitmq block)
- Modify: `docker-compose.test.yml` (rabbitmq block)

**Interfaces:**
- Consumes: `infra/loki/loki-config.yaml` (Task 9), `infra/promtail/promtail-config.yaml` (Task 10), `infra/grafana/provisioning/datasources` and `/dashboards` (Task 13 — **not** `/alerting`, see below), `infra/rabbitmq/enabled_plugins` (Task 15).
- Produces: `loki`, `promtail`, `prometheus`, `cadvisor`, `node-exporter`, `grafana` services, included by both `docker-compose.override.yml` and `docker-compose.test.yml`.

**Scope note (deliberate, not a silent gap):** `postgres-exporter` and `redis-exporter` are production-only. Local dev's Postgres runs as user `postgres` (from `.env`'s `POSTGRES_PASSWORD`), while the E2E stack's Postgres (`docker-compose.test.yml`) runs as a hardcoded `carat`/`carat_test` user with no shell-variable indirection — wiring one exporter config to work for both would mean changing the E2E stack's already-working credential handling, which isn't worth the risk for a debugging convenience. Dev/E2E still get full application-level metrics (all 7 services' `/metrics`), RabbitMQ, container, and host metrics — only the Postgres/Redis *exporter* dashboards are production-only.

- [ ] **Step 1: Mount the RabbitMQ Prometheus plugin in local dev**

In `docker-compose.override.yml`, in the `rabbitmq` service, replace:

```yaml
  rabbitmq:
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: carat
      RABBITMQ_DEFAULT_PASS: devpassword123
      RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS: " "
```

With:

```yaml
  rabbitmq:
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
      - ./infra/rabbitmq/enabled_plugins:/etc/rabbitmq/enabled_plugins:ro
    environment:
      RABBITMQ_DEFAULT_USER: carat
      RABBITMQ_DEFAULT_PASS: devpassword123
      RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS: " "
    ports:
      - "15692:15692"
```

- [ ] **Step 2: Mount the RabbitMQ Prometheus plugin in the E2E stack**

Run: `grep -n "rabbitmq:" docker-compose.test.yml` to find the `rabbitmq` service block's `volumes:`/`ports:` (added at `docker-compose.test.yml:75` per current line numbers). Add, inside that service's `volumes:` list:

```yaml
      - ./infra/rabbitmq/enabled_plugins:/etc/rabbitmq/enabled_plugins:ro
```

And inside its `ports:` list:

```yaml
      - "15692:15692"
```

- [ ] **Step 3: Create the dev/E2E Prometheus config**

Local dev (via `docker-compose.override.yml`, which inherits `docker-compose.yml`'s service names) and the E2E stack (`docker-compose.test.yml`, which uses different service names per app directory) are never running at once on the same host, but share one Prometheus config file — so each job lists both naming variants as separate targets. Whichever variant isn't running for a given context simply shows as a "down" target — harmless.

```yaml
# infra/prometheus/prometheus.dev.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: user-auth
    static_configs:
      - targets: ['user-service:3001', 'user-auth:3001']

  - job_name: catalogue
    static_configs:
      - targets: ['catalogue-service:3002', 'catalogue:3002']

  - job_name: auction-engine
    static_configs:
      - targets: ['auction-engine:3003']

  - job_name: payment
    static_configs:
      - targets: ['payment-service:3004', 'payment:3004']

  - job_name: notification
    static_configs:
      - targets: ['notification-service:3005', 'notification:3005']

  - job_name: shipping
    static_configs:
      - targets: ['shipping-service:3006', 'shipping:3006']

  - job_name: admin
    static_configs:
      - targets: ['admin-service:3007']

  - job_name: cadvisor
    static_configs:
      - targets: ['cadvisor:8080']

  - job_name: node-exporter
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: rabbitmq
    metrics_path: /metrics
    static_configs:
      - targets: ['rabbitmq:15692']
```

- [ ] **Step 4: Create `docker-compose.observability.yml`**

```yaml
# docker-compose.observability.yml
# Shared dev/E2E observability stack. Included by docker-compose.override.yml
# (local dev) and docker-compose.test.yml (Playwright E2E) via Compose's
# top-level `include:` — see Task 18. No Alertmanager, no alert rules: this
# is for inspecting logs/metrics during development and debugging E2E
# failures, not for paging anyone.
services:
  loki:
    image: grafana/loki:3.0.0
    volumes:
      - ./infra/loki/loki-config.yaml:/etc/loki/loki-config.yaml:ro
      - loki_dev_data:/loki
    command: -config.file=/etc/loki/loki-config.yaml
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:3100/ready || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  promtail:
    image: grafana/promtail:3.0.0
    volumes:
      - ./infra/promtail/promtail-config.yaml:/etc/promtail/promtail-config.yaml:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/promtail-config.yaml
    depends_on:
      loki:
        condition: service_healthy

  prometheus:
    image: prom/prometheus:v2.53.0
    volumes:
      - ./infra/prometheus/prometheus.dev.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_dev_data:/prometheus
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.49.1
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro

  node-exporter:
    image: prom/node-exporter:v1.8.1
    pid: host
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - --path.procfs=/host/proc
      - --path.sysfs=/host/sys
      - --path.rootfs=/rootfs

  grafana:
    image: grafana/grafana:11.1.0
    environment:
      GF_SECURITY_ADMIN_PASSWORD: dev
      GF_AUTH_ANONYMOUS_ENABLED: "true"
      GF_AUTH_ANONYMOUS_ORG_ROLE: Admin
    volumes:
      - ./infra/grafana/provisioning/datasources:/etc/grafana/provisioning/datasources:ro
      - ./infra/grafana/provisioning/dashboards:/etc/grafana/provisioning/dashboards:ro
      - grafana_dev_data:/var/lib/grafana
    depends_on:
      prometheus:
        condition: service_started
      loki:
        condition: service_healthy
    ports:
      - "3009:3000"

volumes:
  loki_dev_data:
  prometheus_dev_data:
  grafana_dev_data:
```

Only `datasources` and `dashboards` are mounted from `infra/grafana/provisioning/` — `alerting/` (Task 14) is deliberately excluded, so no alert rules exist to fire. `GF_AUTH_ANONYMOUS_ENABLED` skips the login screen for local/CI convenience since this Grafana is never internet-facing.

- [ ] **Step 5: Validate both new/changed compose files parse**

Run: `python3 -c "import yaml; yaml.safe_load(open('docker-compose.observability.yml'))"` and `python3 -c "import yaml; yaml.safe_load(open('infra/prometheus/prometheus.dev.yml'))"`
Expected: no output from either (valid YAML).

- [ ] **Step 6: Commit**

```bash
git add infra/prometheus/prometheus.dev.yml docker-compose.observability.yml docker-compose.override.yml docker-compose.test.yml
git commit -m "feat(observability): add shared dev/E2E observability stack (no alerting)"
```

---

## Task 18: Auto-start the observability stack in dev and E2E

**Files:**
- Modify: `docker-compose.override.yml` (top of file)
- Modify: `docker-compose.test.yml` (top of file)

**Interfaces:**
- Consumes: `docker-compose.observability.yml` (Task 17).
- Produces: `docker compose up` (local dev) and `docker compose --env-file .env.test -f docker-compose.test.yml up -d --build` (E2E — unchanged command) both start the observability stack automatically.

Compose's top-level `include:` directive requires Compose v2.20.0+.

- [ ] **Step 1: Check the installed Compose version**

Run: `docker compose version`
Expected: `Docker Compose version v2.20.0` or newer. If older, this task's `include:` approach won't work — fall back to documenting an extra `-f docker-compose.observability.yml` flag on both commands instead of using `include:`, and skip to Step 4.

- [ ] **Step 2: Add `include:` to `docker-compose.override.yml`**

At the very top of `docker-compose.override.yml`, before the existing `services:` key, add:

```yaml
include:
  - docker-compose.observability.yml

```

- [ ] **Step 3: Add `include:` to `docker-compose.test.yml`**

At the very top of `docker-compose.test.yml`, before the `x-jwt-private-key: &jwt-private-key |` block, add:

```yaml
include:
  - docker-compose.observability.yml

```

- [ ] **Step 4: Verify local dev starts the stack automatically**

Run: `docker compose up -d` then `docker compose ps`
Expected: output includes `loki`, `promtail`, `prometheus`, `cadvisor`, `node-exporter`, `grafana` alongside `postgres`, `redis`, `rabbitmq`, all `Up` (or `Up (healthy)` where a healthcheck is defined) — with no extra flags beyond the existing documented command.

- [ ] **Step 5: Verify the E2E stack starts the same way**

Run: `docker compose --env-file .env.test -f docker-compose.test.yml up -d --build` then `docker compose -f docker-compose.test.yml ps`
Expected: same 6 observability containers listed alongside the E2E service containers, all `Up`/`Up (healthy)`.

- [ ] **Step 6: Tear down**

Run: `docker compose down` (local dev) and `docker compose -f docker-compose.test.yml down -v` (E2E, matching the existing documented teardown command).

- [ ] **Step 7: Commit**

```bash
git add docker-compose.override.yml docker-compose.test.yml
git commit -m "feat(observability): auto-start observability stack in dev and E2E via Compose include"
```

---

## Task 19: End-to-end verification

**Files:** none (operational verification only, per the design spec's "Verification" section).

**Interfaces:** none — this task exercises everything built in Tasks 1–18 together.

- [ ] **Step 1: Production stack starts healthy**

Run (on a host/VM with `.env` populated per Task 16's new vars, and `infra/alertmanager/alertmanager.yml` rendered per Task 12 Step 3): `docker compose --profile production up -d`
Expected: `docker compose ps` shows `loki`, `promtail`, `prometheus`, `cadvisor`, `node-exporter`, `postgres-exporter`, `redis-exporter`, `alertmanager`, `grafana` all `Up`/`Up (healthy)`.

- [ ] **Step 2: All Prometheus scrape targets are up**

Open `http://<host>:9090/targets` (or `localhost:9090/targets` if port-forwarded).
Expected: every target (7 services + cadvisor + node-exporter + postgres-exporter + redis-exporter + rabbitmq) shows state `UP`.

- [ ] **Step 3: A log line reaches Grafana's Loki explorer**

Run: `curl https://yourdomain.com/api/users/health` a few times (or the equivalent local port), then open Grafana's "Logs explorer" dashboard (Task 13) at `https://yourdomain.com/grafana/d/logs-explorer`.
Expected: `REQUEST_RECEIVED`/`REQUEST_COMPLETED` log lines from `user-auth` appear within seconds, filterable by the `service` and `level` template variables.

- [ ] **Step 4: A synthetic error triggers the Slack + email alert**

Temporarily point a load generator (e.g. `for i in $(seq 1 50); do curl -s -o /dev/null -w "%{http_code}\n" https://yourdomain.com/api/users/does-not-exist; done`) at a route that reliably 404s/500s until the "High error rate" condition (>5% 5xx over 5 min) is met.
Expected: within ~5–10 minutes (rule's `for: 5m` plus Alertmanager's `group_wait`/`group_interval`), a Slack message and an email arrive referencing `user-auth` and the "High error rate" rule.

- [ ] **Step 5: Grafana access control works**

Run: `curl -I https://yourdomain.com/grafana/` from an IP outside the allowlisted range (e.g. via a cloud shell or mobile hotspot, not the office/VPN range configured in Task 16).
Expected: `403 Forbidden` (or connection refused, depending on the exact `deny all` behaviour) — same as `/admin/` already exhibits.

- [ ] **Step 6: Local dev stack starts automatically**

Run: `docker compose up -d`
Expected: (already verified in Task 18 Step 4) — additionally, open `http://localhost:3009` and confirm the same 4 dashboards from Task 13 are present and querying live data from local Postgres/Redis/RabbitMQ/services.

- [ ] **Step 7: E2E logs are inspectable, with no alert noise**

Run: `docker compose --env-file .env.test -f docker-compose.test.yml up -d --build`, then `pnpm --filter @carat-room/e2e test:e2e`.
Expected: during/after the run, `http://localhost:3009`'s "Logs explorer" dashboard shows log lines from `user-auth`, `catalogue`, `auction-engine`, `payment`, `shipping`, `notification` (the 6 services present in the E2E stack); no Slack message or email arrives regardless of whether any E2E test fails, since Task 17 deliberately ships no alert rules to the dev/E2E Grafana.

- [ ] **Step 8: Tear down**

Run: `docker compose down` and `docker compose -f docker-compose.test.yml down -v`, and `docker compose --profile production down` on any environment used for Steps 1–5.

- [ ] **Step 9: Mark the plan complete**

Update every `- [ ]` checkbox in this file to `- [x]` once Steps 1–8 have all passed, and commit:

```bash
git add docs/superpowers/plans/2026-07-18-observability-grafana.md
git commit -m "chore: mark observability stack plan complete"
```
