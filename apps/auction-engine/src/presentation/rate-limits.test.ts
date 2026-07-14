import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import Redis from 'ioredis';
import { buildAuctionEngineRateLimits } from './rate-limits';

vi.mock('ioredis');

// `rate-limit-redis`'s RedisStore issues two distinct raw commands over
// `redis.call`: `SCRIPT LOAD` (expects a SHA1 string reply) to register its
// Lua script, then `EVALSHA` (expects a `[totalHits, ttlMs]` array reply) to
// increment and read the counter. A flat `mockResolvedValue(n)` answers both
// commands with a bare number, which fails `SCRIPT LOAD`'s string check and
// makes the rate limiter fail open (200) rather than exceed the limit (429).
// This mocks each command's reply shape so `totalHits` matches the count the
// test exercises.
function mockRedisCallSequence(redis: Redis, totalHits: number): void {
  vi.mocked(redis.call).mockImplementation((async (...args: unknown[]) => {
    if (args[0] === 'SCRIPT') {
      return 'fake-script-sha';
    }
    if (args[0] === 'EVALSHA') {
      return [totalHits, 60_000];
    }
    return null;
  }) as typeof redis.call);
}

describe('buildAuctionEngineRateLimits', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = new Redis();
  });

  it('should_returnTooManyRequests_when_bidLimitExceeded', async () => {
    mockRedisCallSequence(redis, 31);
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
    mockRedisCallSequence(redis, 101);
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
