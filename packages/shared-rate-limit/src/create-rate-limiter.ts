import type { MiddlewareHandler } from 'hono';
import type { Redis } from 'ioredis';
import { rateLimiter } from 'hono-rate-limiter';
import type { ClientRateLimitInfo, Store } from 'hono-rate-limiter';
import { RedisStore } from 'rate-limit-redis';
import type { RedisReply } from 'rate-limit-redis';
import { extractClientIp } from './extract-client-ip';

export type RateLimiterOptions = {
  redis: Redis;
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
};

const DEFAULT_MESSAGE = 'Too many requests, please try again later.';

/**
 * Truncates a client IP so logs never carry the full address (no PII),
 * while still leaving enough of a prefix to be useful for diagnostics.
 */
function truncateIp(ip: string): string {
  const visibleLength = ip.includes(':') ? 8 : 7;
  return `${ip.slice(0, visibleLength)}***`;
}

/**
 * Adapts `rate-limit-redis`'s `RedisStore` (which implements
 * `express-rate-limit`'s `Store` interface) to `hono-rate-limiter`'s
 * `Store` interface. The two interfaces are structurally identical for the
 * methods used here (`increment`/`decrement`/`resetKey`/`init`); only the
 * `init` config type differs, and `RedisStore.init` reads solely
 * `windowMs` off it, which both config types provide.
 */
function adaptRedisStore(store: RedisStore): Store {
  return {
    init: (config) => store.init(config as unknown as Parameters<RedisStore['init']>[0]),
    increment: (key) => store.increment(key),
    decrement: (key) => store.decrement(key),
    resetKey: (key) => store.resetKey(key),
  };
}

/**
 * Wraps a `Store` so a Redis outage never takes the whole platform down.
 *
 * `hono-rate-limiter` 0.4.x has no built-in fail-open option (no
 * `passOnStoreError` in its resolved `ConfigType`), so any rejection from
 * the underlying store (e.g. Redis is unreachable, or `RedisStore`'s Lua
 * script fails to load) is caught here and treated as "allow the request
 * through".
 */
function failOpen(store: Store, keyPrefix: string): Store {
  return {
    init: (config) => store.init?.(config),
    async increment(key): Promise<ClientRateLimitInfo> {
      try {
        return await store.increment(key);
      } catch (error) {
        console.error(`Rate limiter store unavailable, failing open: prefix=${keyPrefix}`, error);
        return { totalHits: 0, resetTime: undefined };
      }
    },
    async decrement(key): Promise<void> {
      try {
        await store.decrement(key);
      } catch (error) {
        console.error(`Rate limiter store decrement failed, ignoring: prefix=${keyPrefix}`, error);
      }
    },
    async resetKey(key): Promise<void> {
      try {
        await store.resetKey(key);
      } catch (error) {
        console.error(`Rate limiter store resetKey failed, ignoring: prefix=${keyPrefix}`, error);
      }
    },
  };
}

export function createRateLimiter(options: RateLimiterOptions): MiddlewareHandler {
  const { redis, windowMs, max, keyPrefix, message } = options;

  // ioredis's `call` has several overloads, so a plain spread of a
  // `string[]` into it is ambiguous to the type-checker; binding it through
  // a single-signature function type resolves that without an `any`.
  const call = redis.call.bind(redis) as (...args: string[]) => Promise<RedisReply>;

  const redisStore = new RedisStore({
    // rate-limit-redis expects an ioredis-shaped sendCommand; ioredis's
    // `call` accepts the same (command, ...args) signature.
    sendCommand: (...args: string[]) => call(...args),
    prefix: `rl:${keyPrefix}:`,
  });
  // `RedisStore`'s constructor eagerly (and without awaiting) loads its two
  // Lua scripts. If Redis is unreachable at construction time, those
  // promises reject before anything has had a chance to attach a handler,
  // which Node reports as an unhandled rejection even though the store's
  // own retry logic (and our fail-open wrapper below) awaits them properly
  // on the first real request. Attaching a no-op `.catch` here silences
  // that false alarm without swallowing the rejection for later awaiters.
  redisStore.incrementScriptSha.catch(() => undefined);
  redisStore.getScriptSha.catch(() => undefined);

  return rateLimiter({
    windowMs,
    limit: max,
    standardHeaders: 'draft-6',
    keyGenerator: (c) => extractClientIp(c),
    store: failOpen(adaptRedisStore(redisStore), keyPrefix),
    handler: (c) => {
      const ip = extractClientIp(c);
      console.error(`Rate limit exceeded: prefix=${keyPrefix} ip=${truncateIp(ip)}`);
      c.header('Retry-After', String(Math.ceil(windowMs / 1000)));
      return c.json(
        { error: { code: 'TOO_MANY_REQUESTS', message: message ?? DEFAULT_MESSAGE } },
        429,
      );
    },
  });
}
