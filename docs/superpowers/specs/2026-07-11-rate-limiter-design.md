# Rate Limiter Design — `@carat-room/shared-rate-limit`

**Date:** 2026-07-11
**Status:** Approved (pending spec review)

## Summary

Add HTTP rate limiting to all public API services via a new workspace package,
`packages/shared-rate-limit`, wrapping the `hono-rate-limiter` library with a
Redis-backed store (`rate-limit-redis` over the existing ioredis client).
Counters are keyed per client IP, fully configurable per route, and shared
across restarts/instances via the platform's existing Redis 7 instance.

## Decisions (agreed during brainstorming)

| Decision | Choice |
|---|---|
| Scope | All public API services |
| Counter store | Redis (existing instance) |
| Keying | Client IP only |
| Limit configuration | Fully configurable per route (`{windowMs, max}` per mount) |
| Implementation | `hono-rate-limiter` + `rate-limit-redis`, wrapped in a shared package |
| Redis outage behaviour | Fail-open (log and allow the request) |

## Current state

- No HTTP rate limiter exists anywhere in the repo.
- The only related mechanism is a domain-level "too many OTP attempts" rule in
  user-auth's `requestPhoneOtp` use case (returns 429 from the router). That
  remains — it limits OTP sends per user; this design adds request-level
  limiting per IP in front of it.
- user-auth exposes unprotected brute-force targets: `POST /register`,
  `/login`, `/refresh`, `/verify-email`, `/phone/request`, `/phone/verify`.
- ioredis 5.4 is already used by auction-engine and payment.

## Architecture

A thin wrapper package rather than direct per-service use of
`hono-rate-limiter`, for three reasons:

1. **One error envelope.** The wrapper sets a custom handler so every 429 is
   `{ error: { code: 'TOO_MANY_REQUESTS', message: '...' } }` with a
   `Retry-After` header, matching the repo-wide response contract.
2. **One IP-extraction rule.** X-Forwarded-For parsing (behind Nginx) with a
   connection-address fallback (dev/docker-compose) lives in one place.
3. **One dependency boundary.** Replacing the library later touches only the
   package internals — the same pattern `shared-events` uses for amqplib.

### Public interface

```ts
import { createRateLimiter } from '@carat-room/shared-rate-limit';

// in a service's main.ts (composition root)
const loginLimiter = createRateLimiter({
  redis,               // injected ioredis instance — never created in the package
  windowMs: 60_000,
  max: 10,
  keyPrefix: 'user-auth:login',
  message: undefined,  // optional override of the 429 message
});

app.use('/api/users/login', loginLimiter);
```

Config surface is deliberately minimal: `{ redis, windowMs, max, keyPrefix,
message? }`. Skip lists, weights, and user-keying are out of scope (YAGNI) and
can be added later without breaking the interface.

### Package layout

```
packages/shared-rate-limit/
  src/
    create-rate-limiter.ts        — factory wrapping hono-rate-limiter
    create-rate-limiter.test.ts
    extract-client-ip.ts          — X-Forwarded-For parsing + fallback
    extract-client-ip.test.ts
    index.ts                      — named exports only
  package.json                    — deps: hono-rate-limiter, rate-limit-redis;
                                    peers: hono, ioredis
  tsconfig.json                   — extends @carat-room/tsconfig service preset
```

### Redis store wiring

```ts
new RedisStore({
  sendCommand: (...args: string[]) => redis.call(...args),
  prefix: `rl:${keyPrefix}:`,
});
```

Keys take the form `rl:{service}:{route}:{ip}`, so limits survive service
restarts and are shared across instances of a service.

## Behaviour

- **429 response:** `{ error: { code: 'TOO_MANY_REQUESTS', message: 'Too many
  requests, please try again later.' } }` plus `Retry-After`. Standard
  draft-6 `RateLimit-*` headers are enabled so clients can see their budget.
- **IP extraction:** leftmost entry of `X-Forwarded-For` when present
  (trimmed, shape-validated); otherwise Hono connection info. Unparseable
  input falls back to the connection address — never throws.
- **Fail-open on Redis outage:** if the store call throws, log the error and
  allow the request. Rationale: a Redis blip must not take down every API in
  the platform; availability of bidding beats strictness of throttling.
  Explicit trade-off: there is no rate-limit protection while Redis is down.
- **No PII in logs:** on limit breach, log the key prefix and a truncated IP —
  never request bodies.

## Per-service mounting plan

All limits are per IP per window; every mount can tune its own numbers.

| Service | Route(s) | Limit | Why |
|---|---|---|---|
| user-auth | `POST /login`, `/register`, `/verify-email`, `/phone/request`, `/phone/verify` | 10/min | Brute force, credential stuffing, OTP abuse |
| user-auth | `POST /refresh` | 30/min | Legit clients refresh rarely; bots loop |
| auction-engine | `POST` bid submission | 30/min | Bid spam, while allowing genuine bidding-war bursts |
| all services | everything else (default tier) | 100/min | Catch-all backstop, generous for browsing/polling |

The default tier mounts with `app.use('*', defaultLimiter)` **before**
routers; strict per-route limiters mount on their specific paths. Both run —
the stricter one effectively wins on sensitive routes.

### Exclusions

- **Stripe webhook route (payment):** never rate limited — throttling
  Stripe's IPs can drop legitimate payment events; signature verification is
  the guard there.
- **SSE stream endpoint (auction-engine):** a long-lived connection, not
  repeated requests. Connection *opens* count at the default tier; streamed
  events must not count.

### Known limitation (accepted)

IP-only keying means users behind a shared NAT (office, university) share a
bucket. The 100/min default keeps this mostly invisible; two people in one
office bidding on the same lot share the 30/min bid budget. Accepted for v1;
user-keyed limiting is a possible later extension.

## Testing

**Unit (Vitest, co-located):**

- `extract-client-ip`: single and multi-entry `X-Forwarded-For`, whitespace,
  missing/garbage header fallback, never throws.
- `create-rate-limiter` with an ioredis mock (same pattern as
  `apps/auction-engine/src/infrastructure/redis-lock.test.ts`):
  under-limit passes; over-limit returns 429 with the exact envelope and
  `Retry-After`; separate IPs get separate buckets; separate `keyPrefix`
  mounts get separate buckets; store throwing → request passes (fail-open
  proven by a test).
- Per service: one test per mounted limiter asserting 429 after `max`
  requests, via Hono's `app.request()` test client.

**Integration (existing `test:integration` suite):** hammer `POST /login` on
the dockerised stack past the limit, assert 429; assert a different
`X-Forwarded-For` still gets 401 (not 429). Proves the Nginx→service header
path.

## Infra / env changes

- Add ioredis and a `REDIS_URL` env var to the services that lack them
  (user-auth, catalogue, shipping, notification-service, admin), wired in
  both `docker-compose.yml` and `docker-compose.test.yml`, diffed against
  each service's actual `process.env` reads.

## Rollout order (each step independently shippable)

1. `packages/shared-rate-limit` package with full unit tests.
2. user-auth strict limits (highest value).
3. auction-engine bid limit.
4. Default 100/min tier across all remaining services + integration test.
