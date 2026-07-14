import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import Redis from 'ioredis';
import { buildPaymentRateLimits } from './rate-limits';

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

describe('buildPaymentRateLimits', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = new Redis();
  });

  it('should_returnTooManyRequests_when_defaultLimitExceeded', async () => {
    mockRedisCallSequence(redis, 101);
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
    mockRedisCallSequence(redis, 101);
    const { default: defaultLimiter } = buildPaymentRateLimits(redis);
    const app = new Hono();
    // Mirrors main.ts: default limiter mounted only on non-webhook paths.
    app.use('/api/payments/invoices/*', defaultLimiter);
    app.post('/api/payments/webhooks/stripe', (c) => c.json({ data: { received: true } }));

    const res = await app.request('/api/payments/webhooks/stripe', { method: 'POST' });

    expect(res.status).toBe(200);
  });
});
