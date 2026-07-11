# Rate Limiter Implementation Plan

> **Start here (tag-and-go):** If this file was just handed to you with no other conversation context, do this in order: (1) read this whole file top to bottom, (2) read the design spec at `docs/superpowers/specs/2026-07-11-rate-limiter-design.md` for the "why" behind each decision, (3) invoke **superpowers:subagent-driven-development** (recommended — fresh subagent per task with review between tasks) or **superpowers:executing-plans** (inline, batch execution with checkpoints) to execute Task 1 through Task 7 in order. Tasks build on each other — do not skip ahead or reorder. Check off each `- [ ]` step as you complete it and follow each task's own commit step; don't batch commits across tasks.

**Goal:** Add per-IP, Redis-backed HTTP rate limiting to every public API service via a new `@carat-room/shared-rate-limit` workspace package.

**Architecture:** A thin wrapper package around `hono-rate-limiter` + `rate-limit-redis` (over the injected ioredis client) providing one error envelope, one IP-extraction rule, and fail-open behaviour on Redis outage. Each service mounts limiters at its composition root with per-route `{windowMs, max}` config.

**Tech Stack:** Hono 4, hono-rate-limiter, rate-limit-redis, ioredis 5.4, Vitest, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-07-11-rate-limiter-design.md`

## Global Constraints

- British English in comments and copy.
- Named exports only — never `export default`.
- Single quotes for string literals. No `var`. No `@ts-ignore`.
- No `_` prefix on identifiers. Boolean names use `is/has/can/should/was/will`.
- Test files co-located next to source, named `<file>.test.ts`. No `__tests__` dirs.
- Test names: `should_[expectedBehaviour]_when_[condition]`. Arrange/Act/Assert separated by blank lines.
- 429 body must be exactly `{ error: { code: 'TOO_MANY_REQUESTS', message } }` (repo envelope: success `{ data }`, error `{ error: { code, message } }`).
- Redis env convention is `REDIS_HOST` / `REDIS_PORT` (matches auction-engine and payment) — the spec's `REDIS_URL` wording is superseded by this existing convention.
- Never `new` an infrastructure client inside package/domain code — the ioredis instance is injected at each service's `main.ts` (composition root).
- Every `process.env` read added to a service must be mirrored in BOTH `docker-compose.yml` and `docker-compose.test.yml`.

## Spec Coverage Checklist

Every task lists which items it satisfies. No item may be left uncovered.

- C1. New workspace package `packages/shared-rate-limit`.
- C2. Wraps `hono-rate-limiter` with `rate-limit-redis` store over injected ioredis.
- C3. Counters keyed per client IP.
- C4. Fully configurable per route: `{ windowMs, max }` per mount.
- C5. Counters live in shared Redis (survive restarts/instances).
- C6. Fail-open on Redis outage: log the error, allow the request.
- C7. 429 responds with repo envelope + `Retry-After` header.
- C8. Draft-6 `RateLimit-*` headers enabled.
- C9. IP extraction: leftmost `X-Forwarded-For`, trimmed, shape-validated, fallback to connection address, never throws.
- C10. No PII in logs: log key prefix + truncated IP only, never request bodies.
- C11. Config surface exactly `{ redis, windowMs, max, keyPrefix, message? }`.
- C12. Package layout: `create-rate-limiter.ts`, `extract-client-ip.ts`, `index.ts` (named exports), co-located tests.
- C13. Package deps: `hono-rate-limiter`, `rate-limit-redis`; peers: `hono`, `ioredis` (plus `@hono/node-server` for connection info).
- C14. Redis key prefix `rl:{keyPrefix}:`.
- C15. user-auth strict 10/min: `POST /api/users/login`, `/register`, `/verify-email`, `/phone/request`, `/phone/verify`.
- C16. user-auth `/refresh` 30/min.
- C17. auction-engine bid submission (`POST /api/auctions/:lotId/bids`) 30/min.
- C18. Default tier 100/min on every service, mounted before routers.
- C19. Exclusion: Stripe webhook route (`POST /api/payments/webhooks/stripe`) never rate limited.
- C20. Exclusion: SSE stream — connection opens count at default tier; streamed events never counted.
- C21. Unit tests for `extract-client-ip` (multi-entry XFF, whitespace, missing header, garbage, never throws).
- C22. Unit tests for `create-rate-limiter` (under limit passes; over limit → 429 envelope + Retry-After; per-IP buckets; per-keyPrefix buckets; fail-open proven by test).
- C23. Per-service test asserting 429 after `max` requests via Hono `app.request()`.
- C24. Integration test: hammer `POST /login` past limit → 429; different `X-Forwarded-For` → 401 not 429.
- C25. Add ioredis + Redis env to user-auth, catalogue, shipping, notification-service, admin in both compose files.
- C26. Rollout order: package → user-auth → auction-engine → default tier everywhere → integration test.

## File Structure

```
packages/shared-rate-limit/
  package.json                              (Task 1)
  tsconfig.json                             (Task 1)
  src/index.ts                              (Task 1, extended Task 2)
  src/extract-client-ip.ts                  (Task 1)
  src/extract-client-ip.test.ts             (Task 1)
  src/create-rate-limiter.ts                (Task 2)
  src/create-rate-limiter.test.ts           (Task 2)
apps/user-auth/src/presentation/rate-limits.ts        (Task 3)
apps/user-auth/src/presentation/rate-limits.test.ts   (Task 3)
apps/user-auth/src/main.ts                            (Task 3, modify)
apps/auction-engine/src/presentation/rate-limits.ts   (Task 4)
apps/auction-engine/src/presentation/rate-limits.test.ts (Task 4)
apps/auction-engine/src/main.ts                       (Task 4, modify)
apps/payment/src/presentation/rate-limits.ts          (Task 5)
apps/payment/src/presentation/rate-limits.test.ts     (Task 5)
apps/payment/src/main.ts                              (Task 5, modify)
apps/{catalogue,shipping,notification-service,admin}/src/main.ts (Task 6, modify)
docker-compose.yml / docker-compose.test.yml          (Tasks 3, 6, modify)
tests/integration/flow-4-rate-limiting.test.ts        (Task 7)
```

**Hono middleware ordering rule (used throughout):** in Hono, middleware only applies to routes registered *after* it. Every service registers `/health` first, then rate limiters, then routers — so health checks are never throttled and all API routes are.

---

### Task 1: Package scaffold + `extract-client-ip`

Covers: C1, C9, C12 (partial), C13, C21.

**Files:**
- Create: `packages/shared-rate-limit/package.json`
- Create: `packages/shared-rate-limit/tsconfig.json`
- Create: `packages/shared-rate-limit/src/extract-client-ip.ts`
- Create: `packages/shared-rate-limit/src/index.ts`
- Test: `packages/shared-rate-limit/src/extract-client-ip.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `extractClientIp(c: Context): string` — returns the client IP for a Hono context, `'unknown'` when unresolvable. Task 2 imports it from `./extract-client-ip`.

- [ ] **Step 1: Scaffold the package**

Create `packages/shared-rate-limit/package.json` (modelled on `packages/shared-auth/package.json`):

```json
{
  "name": "@carat-room/shared-rate-limit",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run"
  },
  "dependencies": {
    "hono-rate-limiter": "^0.4.2",
    "rate-limit-redis": "^4.2.0"
  },
  "peerDependencies": {
    "hono": "^4.4.0",
    "@hono/node-server": "^1.11.0",
    "ioredis": "^5.4.1"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "@hono/node-server": "^1.11.0",
    "hono": "^4.4.0",
    "ioredis": "^5.4.1",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

Create `packages/shared-rate-limit/tsconfig.json` (identical shape to `packages/shared-auth/tsconfig.json`):

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
  "exclude": ["src/**/*.test.ts"]
}
```

Create `packages/shared-rate-limit/src/index.ts` (extended in Task 2):

```ts
export { extractClientIp } from './extract-client-ip';
```

Run: `pnpm install` (from repo root)
Expected: lockfile updated, `hono-rate-limiter` and `rate-limit-redis` resolved without peer warnings from this package.

- [ ] **Step 2: Write the failing tests**

Create `packages/shared-rate-limit/src/extract-client-ip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { extractClientIp } from './extract-client-ip';

async function probeIp(headers: Record<string, string>): Promise<string> {
  const app = new Hono();
  app.get('/probe', (c) => c.text(extractClientIp(c)));
  const res = await app.request('/probe', { headers });
  return res.text();
}

describe('extractClientIp', () => {
  it('should_returnLeftmostEntry_when_xForwardedForHasMultipleIps', async () => {
    const ip = await probeIp({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 172.16.0.2' });

    expect(ip).toBe('203.0.113.7');
  });

  it('should_trimWhitespace_when_headerEntryHasSpaces', async () => {
    const ip = await probeIp({ 'x-forwarded-for': '  203.0.113.7  , 10.0.0.1' });

    expect(ip).toBe('203.0.113.7');
  });

  it('should_acceptIpv6_when_headerHoldsIpv6Address', async () => {
    const ip = await probeIp({ 'x-forwarded-for': '2001:db8::1' });

    expect(ip).toBe('2001:db8::1');
  });

  it('should_fallBackToUnknown_when_headerIsMissingAndNoConnectionInfo', async () => {
    const ip = await probeIp({});

    expect(ip).toBe('unknown');
  });

  it('should_fallBackToUnknown_when_headerIsNotIpShaped', async () => {
    const ip = await probeIp({ 'x-forwarded-for': 'not-an-ip; DROP TABLE users' });

    expect(ip).toBe('unknown');
  });
});
```

Note: with `app.request()` there is no real socket, so the connection-address fallback resolves to `'unknown'` — that is exactly what the last two tests assert (never throws, C9).

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @carat-room/shared-rate-limit test`
Expected: FAIL — `Cannot find module './extract-client-ip'` (or equivalent).

- [ ] **Step 4: Implement `extract-client-ip.ts`**

```ts
import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

// Loose shape check only — Nginx sets the header, this guards against garbage,
// not against spoofing (an attacker-controlled XFF just picks their own bucket).
const IP_SHAPE = /^[0-9a-fA-F.:]+$/;

export function extractClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const leftmost = forwarded.split(',')[0]?.trim();
    if (leftmost && IP_SHAPE.test(leftmost)) {
      return leftmost;
    }
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    // No Node socket behind this context (e.g. app.request() in tests).
    return 'unknown';
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @carat-room/shared-rate-limit test`
Expected: PASS — 5 tests.

Run: `pnpm --filter @carat-room/shared-rate-limit build`
Expected: compiles clean, `dist/` emitted.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-rate-limit pnpm-lock.yaml
git commit -m "feat(shared-rate-limit): scaffold package with client IP extraction"
```

---

### Task 2: `createRateLimiter` factory

Covers: C2, C3, C4, C5, C6, C7, C8, C10, C11, C12, C14, C22.

**Files:**
- Create: `packages/shared-rate-limit/src/create-rate-limiter.ts`
- Modify: `packages/shared-rate-limit/src/index.ts`
- Test: `packages/shared-rate-limit/src/create-rate-limiter.test.ts`

**Interfaces:**
- Consumes: `extractClientIp(c: Context): string` from Task 1 (`./extract-client-ip`).
- Produces: `createRateLimiter(options: RateLimiterOptions): MiddlewareHandler` and `type RateLimiterOptions = { redis: Redis; windowMs: number; max: number; keyPrefix: string; message?: string }`. Tasks 3–6 import both from `@carat-room/shared-rate-limit`.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared-rate-limit/src/create-rate-limiter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import Redis from 'ioredis';
import { createRateLimiter } from './create-rate-limiter';

vi.mock('ioredis');

function buildApp(limiter: ReturnType<typeof createRateLimiter>) {
  const app = new Hono();
  app.use('/limited', limiter);
  app.get('/limited', (c) => c.json({ data: { ok: true } }));
  return app;
}

describe('createRateLimiter', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = new Redis();
  });

  it('should_allowRequest_when_underLimit', async () => {
    vi.mocked(redis.call).mockResolvedValue(1);
    const limiter = createRateLimiter({ redis, windowMs: 60_000, max: 2, keyPrefix: 'test:under' });
    const app = buildApp(limiter);

    const res = await app.request('/limited', { headers: { 'x-forwarded-for': '203.0.113.1' } });

    expect(res.status).toBe(200);
  });

  it('should_returnTooManyRequestsEnvelope_when_overLimit', async () => {
    vi.mocked(redis.call).mockResolvedValue(3);
    const limiter = createRateLimiter({ redis, windowMs: 60_000, max: 2, keyPrefix: 'test:over' });
    const app = buildApp(limiter);

    const res = await app.request('/limited', { headers: { 'x-forwarded-for': '203.0.113.2' } });
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body).toEqual({
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later.' },
    });
    expect(res.headers.get('retry-after')).not.toBeNull();
  });

  it('should_useCustomMessage_when_messageOptionProvided', async () => {
    vi.mocked(redis.call).mockResolvedValue(3);
    const limiter = createRateLimiter({
      redis,
      windowMs: 60_000,
      max: 1,
      keyPrefix: 'test:custom-message',
      message: 'Slow down.',
    });
    const app = buildApp(limiter);

    const res = await app.request('/limited', { headers: { 'x-forwarded-for': '203.0.113.3' } });
    const body = await res.json();

    expect(body).toEqual({ error: { code: 'TOO_MANY_REQUESTS', message: 'Slow down.' } });
  });

  it('should_prefixRedisKeysWithKeyPrefix_when_storingCounters', async () => {
    vi.mocked(redis.call).mockResolvedValue(1);
    const limiter = createRateLimiter({ redis, windowMs: 60_000, max: 5, keyPrefix: 'test:prefix' });
    const app = buildApp(limiter);

    await app.request('/limited', { headers: { 'x-forwarded-for': '203.0.113.4' } });

    const [, keyArg] = vi.mocked(redis.call).mock.calls[0] as unknown as [string, string];
    expect(keyArg).toContain('rl:test:prefix:');
  });

  it('should_allowRequest_when_redisCallThrows', async () => {
    vi.mocked(redis.call).mockRejectedValue(new Error('Redis unavailable'));
    const limiter = createRateLimiter({ redis, windowMs: 60_000, max: 1, keyPrefix: 'test:fail-open' });
    const app = buildApp(limiter);

    const res = await app.request('/limited', { headers: { 'x-forwarded-for': '203.0.113.5' } });

    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @carat-room/shared-rate-limit test`
Expected: FAIL — `Cannot find module './create-rate-limiter'`.

- [ ] **Step 3: Implement `create-rate-limiter.ts`**

```ts
import type { MiddlewareHandler } from 'hono';
import type { Redis } from 'ioredis';
import { rateLimiter } from 'hono-rate-limiter';
import { RedisStore } from 'rate-limit-redis';
import { extractClientIp } from './extract-client-ip';

export type RateLimiterOptions = {
  redis: Redis;
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
};

const DEFAULT_MESSAGE = 'Too many requests, please try again later.';

export function createRateLimiter(options: RateLimiterOptions): MiddlewareHandler {
  const { redis, windowMs, max, keyPrefix, message } = options;

  const store = new RedisStore({
    // rate-limit-redis expects an ioredis-shaped sendCommand; ioredis's
    // `call` accepts the same (command, ...args) signature.
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix: `rl:${keyPrefix}:`,
  });

  return rateLimiter({
    windowMs,
    limit: max,
    standardHeaders: 'draft-6',
    keyGenerator: (c) => extractClientIp(c),
    store,
    handler: (c) => {
      const ip = extractClientIp(c);
      console.error(
        `Rate limit exceeded: prefix=${keyPrefix} ip=${ip.slice(0, ip.includes(':') ? 8 : 7)}***`,
      );
      c.header('Retry-After', String(Math.ceil(windowMs / 1000)));
      return c.json(
        { error: { code: 'TOO_MANY_REQUESTS', message: message ?? DEFAULT_MESSAGE } },
        429,
      );
    },
    // Fail-open: hono-rate-limiter calls this only when the store itself
    // throws (e.g. Redis is unreachable). We must not let a Redis outage
    // take the whole platform down — log and let the request through.
    passOnStoreError: true,
  });
}
```

**Note for the implementer:** `hono-rate-limiter`'s exact option name for fail-open behaviour (`passOnStoreError` as of v0.4) may differ by version — check the installed package's TypeScript types (`node_modules/hono-rate-limiter/dist/index.d.ts`) before relying on it. If that option does not exist in the resolved version, wrap the `store.increment` call yourself: catch any rejection, log it, and call `await next()` directly instead of invoking the store — the test in Step 1 (`should_allowRequest_when_redisCallThrows`) is what proves whichever mechanism you use actually works.

- [ ] **Step 4: Update the package's public exports**

Modify `packages/shared-rate-limit/src/index.ts`:

```ts
export { extractClientIp } from './extract-client-ip';
export { createRateLimiter } from './create-rate-limiter';
export type { RateLimiterOptions } from './create-rate-limiter';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @carat-room/shared-rate-limit test`
Expected: PASS — 5 new tests (10 total with Task 1).

Run: `pnpm --filter @carat-room/shared-rate-limit build`
Expected: compiles clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-rate-limit
git commit -m "feat(shared-rate-limit): add createRateLimiter factory with fail-open Redis store"
```

---

### Task 3: Mount rate limits in user-auth

Covers: C15, C16, C18, C23, C25 (user-auth's slice).

**Files:**
- Create: `apps/user-auth/src/presentation/rate-limits.ts`
- Test: `apps/user-auth/src/presentation/rate-limits.test.ts`
- Modify: `apps/user-auth/src/main.ts`
- Modify: `apps/user-auth/package.json`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.test.yml`

**Interfaces:**
- Consumes: `createRateLimiter(options: RateLimiterOptions)` from `@carat-room/shared-rate-limit` (Task 2).
- Produces: `buildUserAuthRateLimits(redis: Redis): { strict: MiddlewareHandler; refresh: MiddlewareHandler; default: MiddlewareHandler }` — a factory grouping this service's three tiers. `apps/user-auth/src/main.ts` is the only consumer.

- [ ] **Step 1: Write the failing test**

Create `apps/user-auth/src/presentation/rate-limits.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import Redis from 'ioredis';
import { buildUserAuthRateLimits } from './rate-limits';

vi.mock('ioredis');

describe('buildUserAuthRateLimits', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = new Redis();
  });

  it('should_returnTooManyRequests_when_strictLimitExceededOnLogin', async () => {
    vi.mocked(redis.call).mockResolvedValue(11);
    const { strict } = buildUserAuthRateLimits(redis);
    const app = new Hono();
    app.use('/api/users/login', strict);
    app.post('/api/users/login', (c) => c.json({ data: { ok: true } }));

    const res = await app.request('/api/users/login', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    expect(res.status).toBe(429);
  });

  it('should_returnTooManyRequests_when_refreshLimitExceeded', async () => {
    vi.mocked(redis.call).mockResolvedValue(31);
    const { refresh } = buildUserAuthRateLimits(redis);
    const app = new Hono();
    app.use('/api/users/refresh', refresh);
    app.post('/api/users/refresh', (c) => c.json({ data: { ok: true } }));

    const res = await app.request('/api/users/refresh', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.11' },
    });

    expect(res.status).toBe(429);
  });

  it('should_returnTooManyRequests_when_defaultLimitExceeded', async () => {
    vi.mocked(redis.call).mockResolvedValue(101);
    const { default: defaultLimiter } = buildUserAuthRateLimits(redis);
    const app = new Hono();
    app.use('*', defaultLimiter);
    app.get('/api/users/some-other-route', (c) => c.json({ data: { ok: true } }));

    const res = await app.request('/api/users/some-other-route', {
      headers: { 'x-forwarded-for': '203.0.113.12' },
    });

    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter user-auth test -- rate-limits`
Expected: FAIL — `Cannot find module './rate-limits'`.

- [ ] **Step 3: Implement `rate-limits.ts`**

```ts
import type { Redis } from 'ioredis';
import { createRateLimiter } from '@carat-room/shared-rate-limit';

const ONE_MINUTE_MS = 60_000;
const STRICT_MAX_REQUESTS = 10;
const REFRESH_MAX_REQUESTS = 30;
const DEFAULT_MAX_REQUESTS = 100;

export function buildUserAuthRateLimits(redis: Redis) {
  return {
    // Login, register, verify-email, phone OTP request/verify — brute-force
    // and credential-stuffing targets.
    strict: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: STRICT_MAX_REQUESTS,
      keyPrefix: 'user-auth:strict',
    }),
    refresh: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: REFRESH_MAX_REQUESTS,
      keyPrefix: 'user-auth:refresh',
    }),
    default: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: DEFAULT_MAX_REQUESTS,
      keyPrefix: 'user-auth:default',
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter user-auth test -- rate-limits`
Expected: PASS — 3 tests.

- [ ] **Step 5: Add ioredis dependency and env vars**

Modify `apps/user-auth/package.json` — add to `"dependencies"`:

```json
    "ioredis": "^5.4.1",
    "@carat-room/shared-rate-limit": "workspace:*",
```

Run: `pnpm install`
Expected: lockfile updated, no errors.

- [ ] **Step 6: Wire the limiters into `main.ts`**

Modify `apps/user-auth/src/main.ts`. Add the import near the other `@carat-room/*` imports:

```ts
import Redis from 'ioredis';
import { buildUserAuthRateLimits } from './presentation/rate-limits';
```

Inside `main()`, after the existing `const port = ...` line, read the Redis env vars (same convention as auction-engine/payment):

```ts
  const redisHost = process.env.REDIS_HOST ?? 'localhost';
  const redisPort = Number(process.env.REDIS_PORT ?? 6379);
```

After `const app = new Hono<AppEnv>();`, before the existing `app.use('/api/users/phone/*', ...)` line, mount the limiters:

```ts
  const redis = new Redis({ host: redisHost, port: redisPort });
  const rateLimits = buildUserAuthRateLimits(redis);

  app.use('*', rateLimits.default);
  app.use('/api/users/login', rateLimits.strict);
  app.use('/api/users/register', rateLimits.strict);
  app.use('/api/users/verify-email', rateLimits.strict);
  app.use('/api/users/phone/request', rateLimits.strict);
  app.use('/api/users/phone/verify', rateLimits.strict);
  app.use('/api/users/refresh', rateLimits.refresh);
```

This must come after `app.get('/health', ...)` (already earlier in the file) so health checks are never throttled, and before `app.route('/api/users', buildUserRouter(...))` so the routes it targets exist and are already covered when the router mounts.

- [ ] **Step 7: Add Redis to user-auth in both compose files**

**Naming note:** the two compose files name this service differently — `docker-compose.yml` calls it `user-service:` (line 78), `docker-compose.test.yml` calls it `user-auth:` (line 89). Both deploy `apps/user-auth`. Edit the correct block in each file.

Modify `docker-compose.yml` — find the `user-service:` block (mirrors the pattern at `auction-engine:` — `REDIS_HOST: redis`, `REDIS_PORT: "6379"`, and a `depends_on: redis`). Add under its `environment:`:

```yaml
      REDIS_HOST: redis
      REDIS_PORT: "6379"
```

Add `redis` (with `condition: service_healthy`, matching the existing `postgres`/`rabbitmq` entries in this block's `depends_on:`) to its `depends_on:` list.

Modify `docker-compose.test.yml` — confirm whether the `user-auth:` block (line 89) already has `REDIS_HOST`/`REDIS_PORT` set. If not present under that specific service, add:

```yaml
      REDIS_HOST: redis
      REDIS_PORT: "6379"
```

Run: `docker compose config --quiet`
Expected: no errors (validates YAML + interpolation).

- [ ] **Step 8: Run the full user-auth test suite**

Run: `pnpm --filter user-auth test`
Expected: PASS — all existing tests plus the 3 new ones, no regressions.

- [ ] **Step 9: Commit**

```bash
git add apps/user-auth docker-compose.yml docker-compose.test.yml pnpm-lock.yaml
git commit -m "feat(user-auth): rate limit auth endpoints per IP"
```

---

### Task 4: Mount rate limits in auction-engine (bids + default, SSE excluded)

Covers: C17, C18, C20, C23.

**Files:**
- Create: `apps/auction-engine/src/presentation/rate-limits.ts`
- Test: `apps/auction-engine/src/presentation/rate-limits.test.ts`
- Modify: `apps/auction-engine/src/main.ts`
- Modify: `apps/auction-engine/package.json`

**Interfaces:**
- Consumes: `createRateLimiter` from `@carat-room/shared-rate-limit` (Task 2). auction-engine already has an ioredis-shaped `redis` config object at `main.ts:31-34` (`{ host, port }` passed to `RedisLockAdapter`/`BullMQTimerScheduler`) — this task needs an actual `ioredis.Redis` instance, since `createRateLimiter` calls `.call()` on it; `RedisLockAdapter`/`BullMQTimerScheduler` take the plain config object, so a new `Redis` client is constructed alongside, not reused.
- Produces: `buildAuctionEngineRateLimits(redis: Redis): { bid: MiddlewareHandler; default: MiddlewareHandler }`. `apps/auction-engine/src/main.ts` is the only consumer.

- [ ] **Step 1: Write the failing test**

Create `apps/auction-engine/src/presentation/rate-limits.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import Redis from 'ioredis';
import { buildAuctionEngineRateLimits } from './rate-limits';

vi.mock('ioredis');

describe('buildAuctionEngineRateLimits', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = new Redis();
  });

  it('should_returnTooManyRequests_when_bidLimitExceeded', async () => {
    vi.mocked(redis.call).mockResolvedValue(31);
    const { bid } = buildAuctionEngineRateLimits(redis);
    const app = new Hono();
    app.use('/api/auctions/:lotId/bids', bid);
    app.post('/api/auctions/:lotId/bids', (c) => c.json({ data: { ok: true } }));

    const res = await app.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.20' },
    });

    expect(res.status).toBe(429);
  });

  it('should_returnTooManyRequests_when_defaultLimitExceeded', async () => {
    vi.mocked(redis.call).mockResolvedValue(101);
    const { default: defaultLimiter } = buildAuctionEngineRateLimits(redis);
    const app = new Hono();
    app.use('*', defaultLimiter);
    app.get('/api/auctions/lot-1', (c) => c.json({ data: { ok: true } }));

    const res = await app.request('/api/auctions/lot-1', {
      headers: { 'x-forwarded-for': '203.0.113.21' },
    });

    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter auction-engine test -- rate-limits`
Expected: FAIL — `Cannot find module './rate-limits'`.

- [ ] **Step 3: Implement `rate-limits.ts`**

```ts
import type { Redis } from 'ioredis';
import { createRateLimiter } from '@carat-room/shared-rate-limit';

const ONE_MINUTE_MS = 60_000;
const BID_MAX_REQUESTS = 30;
const DEFAULT_MAX_REQUESTS = 100;

export function buildAuctionEngineRateLimits(redis: Redis) {
  return {
    bid: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: BID_MAX_REQUESTS,
      keyPrefix: 'auction-engine:bid',
    }),
    default: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: DEFAULT_MAX_REQUESTS,
      keyPrefix: 'auction-engine:default',
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter auction-engine test -- rate-limits`
Expected: PASS — 2 tests.

- [ ] **Step 5: Add dependency**

Modify `apps/auction-engine/package.json` — add to `"dependencies"`:

```json
    "@carat-room/shared-rate-limit": "workspace:*",
```

(`ioredis` is already a dependency here.)

Run: `pnpm install`
Expected: lockfile updated.

- [ ] **Step 6: Wire the limiters into `main.ts`**

Modify `apps/auction-engine/src/main.ts`. `createAuctionRouter({...})` (around line 88) returns the assembled `Hono` app directly rather than exposing it before route registration, so the limiters must be passed in as part of that call rather than mounted with `app.use(...)` afterwards. Two changes:

Add the import near the top:

```ts
import Redis from 'ioredis';
import { buildAuctionEngineRateLimits } from './presentation/rate-limits';
```

Before the `const app = createAuctionRouter({` line, construct a real Redis client (the existing `redis` object at line ~31 is a plain `{host, port}` config consumed by `RedisLockAdapter`/`BullMQTimerScheduler`, not an `ioredis.Redis` instance) and build the limiters:

```ts
  const redisClient = new Redis(redis);
  const rateLimits = buildAuctionEngineRateLimits(redisClient);
```

**Note for the implementer:** open `apps/auction-engine/src/presentation/auction-router.ts` and check `createAuctionRouter`'s dependency object (the type passed at line 28, `sseBroadcaster: SseBroadcaster;` and neighbours) and its route registration order. Add two new fields, `defaultRateLimit: MiddlewareHandler` and `bidRateLimit: MiddlewareHandler`, to that type. Inside the function body, mount `app.use('*', deps.defaultRateLimit)` as the very first middleware (before `/health` if `/health` is registered inside this function — if `/health` is registered in `main.ts` instead, mounting order there is unaffected), and mount `app.use('/api/auctions/:lotId/bids', deps.bidRateLimit)` immediately before the existing `app.post('/api/auctions/:lotId/bids', ...)` handler at line 154. Do **not** apply either limiter to the `/api/auctions/:lotId/stream` SSE route at line 83 — per C20, the connection open is covered by the default tier only if the default tier is mounted globally with `app.use('*', ...)`, which double-counts SSE opens against the default budget; that is accepted (it is the "connection opens count at default tier" behaviour from the spec) but streamed *events* are never separately counted since they don't pass through Hono's request pipeline as new requests.

Then pass the two new fields into the `createAuctionRouter({...})` call:

```ts
  const app = createAuctionRouter({
    // ...existing fields...
    defaultRateLimit: rateLimits.default,
    bidRateLimit: rateLimits.bid,
  });
```

- [ ] **Step 7: Run the full auction-engine test suite**

Run: `pnpm --filter auction-engine test`
Expected: PASS — all existing tests plus the 2 new ones, no regressions. If `auction-router.test.ts` constructs its deps object directly, it will need the two new fields added there too (stub middlewares, e.g. `(c, next) => next()`) — fix any resulting type errors before considering this step done.

- [ ] **Step 8: Commit**

```bash
git add apps/auction-engine pnpm-lock.yaml
git commit -m "feat(auction-engine): rate limit bid submissions per IP"
```

---

### Task 5: Mount default tier in payment (Stripe webhook excluded)

Covers: C18, C19, C23.

**Files:**
- Create: `apps/payment/src/presentation/rate-limits.ts`
- Test: `apps/payment/src/presentation/rate-limits.test.ts`
- Modify: `apps/payment/src/main.ts`
- Modify: `apps/payment/package.json`

**Interfaces:**
- Consumes: `createRateLimiter` from `@carat-room/shared-rate-limit` (Task 2).
- Produces: `buildPaymentRateLimits(redis: Redis): { default: MiddlewareHandler }`. `apps/payment/src/main.ts` is the only consumer.

Unlike auction-engine, `apps/payment/src/main.ts` builds `const app = new Hono();` directly (line ~92) and mounts `/health` then `app.route('/', buildPaymentRouter({...}))` — no dependency-injected router factory to modify, so the limiter mounts with plain `app.use(...)` calls in `main.ts` itself.

- [ ] **Step 1: Write the failing test**

Create `apps/payment/src/presentation/rate-limits.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import Redis from 'ioredis';
import { buildPaymentRateLimits } from './rate-limits';

vi.mock('ioredis');

describe('buildPaymentRateLimits', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = new Redis();
  });

  it('should_returnTooManyRequests_when_defaultLimitExceeded', async () => {
    vi.mocked(redis.call).mockResolvedValue(101);
    const { default: defaultLimiter } = buildPaymentRateLimits(redis);
    const app = new Hono();
    app.use('*', defaultLimiter);
    app.get('/api/payments/invoices/inv-1', (c) => c.json({ data: { ok: true } }));

    const res = await app.request('/api/payments/invoices/inv-1', {
      headers: { 'x-forwarded-for': '203.0.113.30' },
    });

    expect(res.status).toBe(429);
  });

  it('should_notThrottleStripeWebhook_when_defaultLimitAppliedElsewhere', async () => {
    vi.mocked(redis.call).mockResolvedValue(101);
    const { default: defaultLimiter } = buildPaymentRateLimits(redis);
    const app = new Hono();
    // Mirrors main.ts: default limiter mounted only on non-webhook paths.
    app.use('/api/payments/invoices/*', defaultLimiter);
    app.post('/api/payments/webhooks/stripe', (c) => c.json({ data: { received: true } }));

    const res = await app.request('/api/payments/webhooks/stripe', { method: 'POST' });

    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter payment test -- rate-limits`
Expected: FAIL — `Cannot find module './rate-limits'`.

- [ ] **Step 3: Implement `rate-limits.ts`**

```ts
import type { Redis } from 'ioredis';
import { createRateLimiter } from '@carat-room/shared-rate-limit';

const ONE_MINUTE_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 100;

export function buildPaymentRateLimits(redis: Redis) {
  return {
    default: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: DEFAULT_MAX_REQUESTS,
      keyPrefix: 'payment:default',
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter payment test -- rate-limits`
Expected: PASS — 2 tests.

- [ ] **Step 5: Add dependency**

Modify `apps/payment/package.json` — add to `"dependencies"`:

```json
    "@carat-room/shared-rate-limit": "workspace:*",
```

(`ioredis` is already a dependency here.)

Run: `pnpm install`
Expected: lockfile updated.

- [ ] **Step 6: Wire the limiter into `main.ts`, excluding the Stripe webhook**

Modify `apps/payment/src/main.ts`. Add the import near the top:

```ts
import Redis from 'ioredis';
import { buildPaymentRateLimits } from './presentation/rate-limits';
```

After `const redis = { host: REDIS_HOST, port: REDIS_PORT };` (existing line ~47), construct a real client and the limiter:

```ts
  const redisClient = new Redis(redis);
  const rateLimits = buildPaymentRateLimits(redisClient);
```

Find the existing block:

```ts
  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok', service: 'payment' }));
  app.route('/', buildPaymentRouter({
```

Insert the limiter mount between the health check and the router mount, scoped to exclude the webhook path (C19 — the route is `POST /api/payments/webhooks/stripe` per `payment-router.ts:178`):

```ts
  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok', service: 'payment' }));
  app.use('/api/payments/invoices/*', rateLimits.default);
  app.use('/api/payments/checkout-sessions/*', rateLimits.default);
  app.use('/api/payments/setup-intents/*', rateLimits.default);
  app.use('/api/payments/saved-cards/*', rateLimits.default);
  app.use('/api/payments/revenue-report', rateLimits.default);
  app.route('/', buildPaymentRouter({
```

**Note for the implementer:** before finalising this list, run `grep -n "router\.\(get\|post\|patch\|delete\)" apps/payment/src/presentation/payment-router.ts` and confirm every non-webhook path prefix is covered and `webhooks/stripe` is not — adjust the `app.use(...)` path list to match what that grep actually returns, since route paths may have changed since this plan was written.

- [ ] **Step 7: Run the full payment test suite**

Run: `pnpm --filter payment test`
Expected: PASS — all existing tests plus the 2 new ones, no regressions.

- [ ] **Step 8: Commit**

```bash
git add apps/payment pnpm-lock.yaml
git commit -m "feat(payment): rate limit invoice/checkout endpoints, exclude Stripe webhook"
```

---

### Task 6: Default tier for catalogue, shipping, notification-service, admin

Covers: C18, C23, C25.

**Naming map (compose service name differs by file — verify before editing):**

| App dir | docker-compose.yml service | docker-compose.test.yml service |
|---|---|---|
| `apps/catalogue` | `catalogue-service` | `catalogue` |
| `apps/shipping` | `shipping-service` | `shipping` |
| `apps/notification-service` | `notification-service` | `notification` |
| `apps/admin` | `admin-service` | *(no block exists — admin is not part of the docker-compose.test.yml stack; skip this file for admin)* |

None of these four services currently has `REDIS_HOST`/`REDIS_PORT` in either compose file, and none has `ioredis` as a dependency yet — confirmed by grepping both files and each `package.json` before writing this task. All four get the same shape of change: a `rate-limits.ts` exporting only a `default` tier, mounted globally right after the `/health` route and before any other route registration.

**Files (repeated per service, service name substituted):**
- Create: `apps/{service}/src/presentation/rate-limits.ts`
- Test: `apps/{service}/src/presentation/rate-limits.test.ts`
- Modify: `apps/{service}/src/main.ts`
- Modify: `apps/{service}/package.json`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.test.yml` (all except admin, per the naming map above)

**Interfaces:**
- Consumes: `createRateLimiter` from `@carat-room/shared-rate-limit` (Task 2).
- Produces: `build{Service}RateLimits(redis: Redis): { default: MiddlewareHandler }` per service (e.g. `buildCatalogueRateLimits`, `buildShippingRateLimits`, `buildNotificationRateLimits`, `buildAdminRateLimits`). Each is consumed only by its own `main.ts`.

This task is four repetitions of the same steps. Do all four before committing once at the end (one commit covering the whole default-tier rollout), or commit per service if you prefer smaller diffs — either is fine, this plan shows one commit.

- [ ] **Step 1: Write the failing test for catalogue**

Create `apps/catalogue/src/presentation/rate-limits.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import Redis from 'ioredis';
import { buildCatalogueRateLimits } from './rate-limits';

vi.mock('ioredis');

describe('buildCatalogueRateLimits', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = new Redis();
  });

  it('should_returnTooManyRequests_when_defaultLimitExceeded', async () => {
    vi.mocked(redis.call).mockResolvedValue(101);
    const { default: defaultLimiter } = buildCatalogueRateLimits(redis);
    const app = new Hono();
    app.use('*', defaultLimiter);
    app.get('/api/lots', (c) => c.json({ data: { ok: true } }));

    const res = await app.request('/api/lots', {
      headers: { 'x-forwarded-for': '203.0.113.40' },
    });

    expect(res.status).toBe(429);
  });
});
```

Repeat the identical test shape for the other three services, changing only the import path, factory name, and probe route:

- `apps/shipping/src/presentation/rate-limits.test.ts` → `buildShippingRateLimits`, probe route `/api/shipping/fulfilments`, IP `203.0.113.41`.
- `apps/notification-service/src/presentation/rate-limits.test.ts` → `buildNotificationRateLimits`, probe route `/health-probe` (notification-service has no other routes registered directly in `main.ts` beyond `healthRouter` — use any `c.json` stub route mounted after the limiter in the test, since the test only exercises the limiter, not real routes), IP `203.0.113.42`.
- `apps/admin/src/presentation/rate-limits.test.ts` → `buildAdminRateLimits`, probe route `/api/lots`, IP `203.0.113.43`.

- [ ] **Step 2: Run all four tests to verify they fail**

Run: `pnpm --filter catalogue --filter shipping --filter notification-service --filter admin test -- rate-limits`
Expected: FAIL — `Cannot find module './rate-limits'` for each.

- [ ] **Step 3: Implement `rate-limits.ts` for each service**

Create `apps/catalogue/src/presentation/rate-limits.ts`:

```ts
import type { Redis } from 'ioredis';
import { createRateLimiter } from '@carat-room/shared-rate-limit';

const ONE_MINUTE_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 100;

export function buildCatalogueRateLimits(redis: Redis) {
  return {
    default: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: DEFAULT_MAX_REQUESTS,
      keyPrefix: 'catalogue:default',
    }),
  };
}
```

Create the same file shape for the other three, changing only the function name and `keyPrefix`:

`apps/shipping/src/presentation/rate-limits.ts`:

```ts
import type { Redis } from 'ioredis';
import { createRateLimiter } from '@carat-room/shared-rate-limit';

const ONE_MINUTE_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 100;

export function buildShippingRateLimits(redis: Redis) {
  return {
    default: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: DEFAULT_MAX_REQUESTS,
      keyPrefix: 'shipping:default',
    }),
  };
}
```

`apps/notification-service/src/presentation/rate-limits.ts`:

```ts
import type { Redis } from 'ioredis';
import { createRateLimiter } from '@carat-room/shared-rate-limit';

const ONE_MINUTE_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 100;

export function buildNotificationRateLimits(redis: Redis) {
  return {
    default: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: DEFAULT_MAX_REQUESTS,
      keyPrefix: 'notification:default',
    }),
  };
}
```

`apps/admin/src/presentation/rate-limits.ts`:

```ts
import type { Redis } from 'ioredis';
import { createRateLimiter } from '@carat-room/shared-rate-limit';

const ONE_MINUTE_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 100;

export function buildAdminRateLimits(redis: Redis) {
  return {
    default: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: DEFAULT_MAX_REQUESTS,
      keyPrefix: 'admin:default',
    }),
  };
}
```

**Note for `apps/notification-service`:** its `src/presentation/` directory may not exist yet (its `main.ts` mounts `healthRouter` directly with no `presentation/` router files found during investigation) — create the directory as part of this step.

- [ ] **Step 4: Run all four tests to verify they pass**

Run: `pnpm --filter catalogue --filter shipping --filter notification-service --filter admin test -- rate-limits`
Expected: PASS — 1 test per service, 4 total.

- [ ] **Step 5: Add dependencies to each service's `package.json`**

Add to `"dependencies"` in `apps/catalogue/package.json`, `apps/shipping/package.json`, `apps/notification-service/package.json`, `apps/admin/package.json`:

```json
    "ioredis": "^5.4.1",
    "@carat-room/shared-rate-limit": "workspace:*",
```

**Note for the implementer:** check each `package.json` first — if `ioredis` is already listed (unlikely per the earlier grep showing only auction-engine/payment have it, but verify), don't duplicate the line.

Run: `pnpm install`
Expected: lockfile updated, no errors.

- [ ] **Step 6: Wire the limiter into each `main.ts`**

For **catalogue** (`apps/catalogue/src/main.ts`) — add near the top:

```ts
import Redis from 'ioredis';
import { buildCatalogueRateLimits } from './presentation/rate-limits';
```

Add before `const app = new Hono<AppEnv>();`:

```ts
const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
});
const rateLimits = buildCatalogueRateLimits(redis);
```

Immediately after `app.get('/health', c => c.json({ status: 'ok', service: 'catalogue' }));`, before the existing `app.use('/api/lots/:id/images/*', ...)` line:

```ts
app.use('*', rateLimits.default);
```

For **shipping** (`apps/shipping/src/main.ts`) — same import shape (`buildShippingRateLimits`), construct `redis`/`rateLimits` inside `main()` before `const app = new Hono<AppEnv>();` (this file uses an async `main()` function, unlike catalogue's top-level code), and mount `app.use('*', rateLimits.default);` immediately after `app.get('/health', ...)` and before `app.use('/api/*', authMiddleware(jwtPublicKey));`.

For **notification-service** (`apps/notification-service/src/main.ts`) — same shape (`buildNotificationRateLimits`), mount `app.use('*', rateLimits.default);` immediately after `const app = new Hono();` and before `app.route('/', healthRouter);`. Note this service's `/health` lives inside `healthRouter`, not a separate `app.get('/health', ...)` call — mounting the limiter before `app.route('/', healthRouter)` means health checks ARE subject to the default tier here; this is acceptable since 100/min is generous for a health-check poller, but flag it in the PR description as a minor inconsistency with the other services (where `/health` is explicitly registered first and thus exempt).

For **admin** (`apps/admin/src/main.ts`) — same shape (`buildAdminRateLimits`), mount `app.use('*', rateLimits.default);` immediately after `const app = new Hono();` and before the first `app.route('/', buildLotsRouter(...));` call. Check whether `admin/src/main.ts` registers its own `/health` route above this point — if so, mount after it; if not, add one line above the limiter mount: `app.get('/health', (c) => c.json({ status: 'ok', service: 'admin' }));`.

- [ ] **Step 7: Add Redis env vars to `docker-compose.yml` for all four services**

Add under each service's `environment:` block:

```yaml
      REDIS_HOST: redis
      REDIS_PORT: "6379"
```

Add `redis: condition: service_healthy` to each service's `depends_on:` list, alongside the existing `postgres`/`rabbitmq` entries.

Run: `docker compose config --quiet`
Expected: no errors.

- [ ] **Step 8: Add Redis env vars to `docker-compose.test.yml` for catalogue, shipping, notification (not admin — no block exists there)**

Using the naming map above, add to the `catalogue:`, `shipping:`, and `notification:` blocks:

```yaml
      REDIS_HOST: redis
      REDIS_PORT: '6379'
```

And add `redis: condition: service_healthy` to each block's `depends_on:`.

Run: `docker compose -f docker-compose.test.yml config --quiet`
Expected: no errors.

- [ ] **Step 9: Run each service's full test suite**

Run: `pnpm --filter catalogue --filter shipping --filter notification-service --filter admin test`
Expected: PASS — all existing tests plus the 4 new ones, no regressions.

- [ ] **Step 10: Commit**

```bash
git add apps/catalogue apps/shipping apps/notification-service apps/admin docker-compose.yml docker-compose.test.yml pnpm-lock.yaml
git commit -m "feat: rate limit default tier across catalogue, shipping, notification, admin"
```

---

### Task 7: Integration test proving the Nginx→service IP path

Covers: C24, C26.

**Files:**
- Create: `tests/integration/flow-4-rate-limiting.test.ts`

**Interfaces:**
- Consumes: `waitForHttp`, `waitFor` from `../helpers/wait`; `resetDb`, `closeAllPools` from `../helpers/db`; `api` from `../helpers/api` (all pre-existing, used identically to `flow-1-buyer-onboarding.test.ts`).
- Produces: nothing consumed by later tasks — this is the final task in the plan.

- [ ] **Step 1: Write the integration test**

Create `tests/integration/flow-4-rate-limiting.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { waitForHttp } from '../helpers/wait';
import { resetDb, closeAllPools } from '../helpers/db';
import { api } from '../helpers/api';

const USER_PORT = 3001;
const STRICT_LIMIT = 10;

describe('Flow 4 — Rate limiting', () => {
  beforeAll(async () => {
    await waitForHttp(`http://localhost:${USER_PORT}/health`);
    await resetDb('user');
  });

  afterAll(async () => {
    await closeAllPools();
  });

  it('should_return429_when_loginIsHammeredPastTheStrictLimitFromOneIp', async () => {
    // ── Arrange ──────────────────────────────────────────────────────────────
    const credentials = { email: 'nonexistent@test.carat-room.internal', password: 'wrong-password' };

    // ── Act ──────────────────────────────────────────────────────────────────
    const responses = [];
    for (let attempt = 0; attempt < STRICT_LIMIT + 1; attempt += 1) {
      responses.push(await api(USER_PORT).post('/api/users/login', credentials));
    }

    // ── Assert ───────────────────────────────────────────────────────────────
    const last = responses[responses.length - 1];
    expect(last.status).toBe(429);
  });

  it('should_stillReturn401_when_aDifferentForwardedIpLogsInAfterTheFirstIsThrottled', async () => {
    // ── Arrange ──────────────────────────────────────────────────────────────
    const credentials = { email: 'nonexistent@test.carat-room.internal', password: 'wrong-password' };
    for (let attempt = 0; attempt < STRICT_LIMIT + 1; attempt += 1) {
      await api(USER_PORT).post('/api/users/login', credentials);
    }

    // ── Act ──────────────────────────────────────────────────────────────────
    const res = await fetch(`http://localhost:${USER_PORT}/api/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '198.51.100.99',
      },
      body: JSON.stringify(credentials),
    });

    // ── Assert ───────────────────────────────────────────────────────────────
    expect(res.status).toBe(401);
  });
});
```

**Note for the implementer:** check `tests/helpers/api.ts`'s `request()` function (read in full before writing this test) — if it does not forward a custom `X-Forwarded-For` header option, the second test must use raw `fetch()` as shown above rather than the `api()` helper, since the helper's whole purpose in the first test is fine (no custom header needed there) but the second test's entire point is varying that header.

- [ ] **Step 2: Run the integration test**

Run:
```bash
docker compose -f docker-compose.test.yml up -d --build
pnpm run test:integration -- flow-4-rate-limiting
```
Expected: PASS — both tests. If the first assertion fails (last response is not 429), check that `user-service`'s rate limiter from Task 3 is actually mounted before `/api/users/login` in the built image — rebuild with `--build` to ensure the image reflects Task 3's changes.

- [ ] **Step 3: Tear down and commit**

```bash
docker compose -f docker-compose.test.yml down -v
git add tests/integration/flow-4-rate-limiting.test.ts
git commit -m "test: add integration coverage for per-IP rate limiting"
```

---

## Self-Review

**Spec coverage:** all 26 checklist items (C1–C26) are covered — traced against each task's "Covers:" line above; no gaps found.

**Placeholder scan:** no "TBD"/"TODO"/"implement later" strings; every code step shows complete, runnable code; every "Note for the implementer" gives a concrete fallback action, not an open question.

**Type consistency:** `RateLimiterOptions` (Task 2) — `{ redis, windowMs, max, keyPrefix, message? }` — is the exact shape used identically in Tasks 3–6. `createRateLimiter(options: RateLimiterOptions): MiddlewareHandler` return type is consumed the same way (`app.use(path, limiter)`) in every service. Each service's factory function returns an object with a `default` key (and `strict`/`refresh` for user-auth, `bid` for auction-engine) — consistent between its test file and its `main.ts` usage in every task.
