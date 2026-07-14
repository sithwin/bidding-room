import type { MiddlewareHandler } from 'hono';
import type { Redis } from 'ioredis';
import { rateLimiter } from 'hono-rate-limiter';
import type { ClientRateLimitInfo, Store } from 'hono-rate-limiter';
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
 * A fixed-window Redis counter store for hono-rate-limiter: one `INCR` per
 * request, with the key's expiry set to the window length on the first hit.
 *
 * `hono-rate-limiter` 0.4.x has no built-in fail-open option (no
 * `passOnStoreError` in its resolved types), so any rejection from Redis
 * (e.g. an outage) is caught here and treated as "allow the request
 * through" — a Redis outage must never take the whole platform down.
 */
function createRedisStore(redis: Redis, keyPrefix: string, windowMs: number): Store {
  const prefix = `rl:${keyPrefix}:`;

  return {
    async increment(key): Promise<ClientRateLimitInfo> {
      const redisKey = `${prefix}${key}`;
      try {
        const totalHits = Number(await redis.call('INCR', redisKey));
        if (totalHits === 1) {
          await redis.call('PEXPIRE', redisKey, String(windowMs));
        }
        return { totalHits, resetTime: new Date(Date.now() + windowMs) };
      } catch (error) {
        console.error(`Rate limiter store unavailable, failing open: prefix=${keyPrefix}`, error);
        return { totalHits: 0, resetTime: undefined };
      }
    },
    async decrement(key): Promise<void> {
      try {
        await redis.call('DECR', `${prefix}${key}`);
      } catch (error) {
        console.error(`Rate limiter store decrement failed, ignoring: prefix=${keyPrefix}`, error);
      }
    },
    async resetKey(key): Promise<void> {
      try {
        await redis.call('DEL', `${prefix}${key}`);
      } catch (error) {
        console.error(`Rate limiter store resetKey failed, ignoring: prefix=${keyPrefix}`, error);
      }
    },
  };
}

export function createRateLimiter(options: RateLimiterOptions): MiddlewareHandler {
  const { redis, windowMs, max, keyPrefix, message } = options;

  return rateLimiter({
    windowMs,
    limit: max,
    standardHeaders: 'draft-6',
    keyGenerator: (c) => extractClientIp(c),
    store: createRedisStore(redis, keyPrefix, windowMs),
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
