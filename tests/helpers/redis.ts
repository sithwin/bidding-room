import Redis from 'ioredis';

const TEST_REDIS_PORT = 6380;

let client: Redis | null = null;

function getClient(): Redis {
  client ??= new Redis({ host: 'localhost', port: TEST_REDIS_PORT, lazyConnect: false });
  return client;
}

/**
 * Flushes all rate-limiter keys (`rl:*`, see packages/shared-rate-limit's
 * `RedisStore` prefix) from the shared test Redis instance.
 *
 * Unlike Postgres (reset per-service, per-file, via `resetDb`), Redis is one
 * shared instance for the whole stack with no per-file isolation — every
 * flow file's login/register/etc. calls accumulate against the *same*
 * per-IP rate-limit counters all suite-long. A flow that itself stays well
 * under a limit can still get 429'd once earlier flows' calls in the same
 * rolling window have already used up most of the budget. Call this in a
 * file's `beforeAll` (after `resetDb`) for any flow whose own request count
 * is close to a limit.
 */
export async function resetRateLimitCounters(): Promise<void> {
  const redis = getClient();
  const keys = await redis.keys('rl:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/** Close the shared Redis client — call once after all tests finish. */
export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
