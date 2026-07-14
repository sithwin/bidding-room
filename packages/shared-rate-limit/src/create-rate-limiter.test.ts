import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import Redis from 'ioredis';
import { createRateLimiter } from './create-rate-limiter';

vi.mock('ioredis');

// `rate-limit-redis`'s `RedisStore` speaks the Redis Lua-scripting protocol:
// on construction (and on retry) it issues `SCRIPT LOAD <lua>`, which must
// reply with a SHA1 hex digest (a string). Every actual increment/get then
// runs `EVALSHA <sha> ...`, whose reply is the two-element script result
// `[totalHits, timeToExpireMs]`. A flat mock that resolves every call to a
// bare number breaks `RedisStore`'s own check that `SCRIPT LOAD` returns a
// string, so the mock below inspects the command name and branches.
const FAKE_SCRIPT_SHA = 'a'.repeat(40);

function mockRedisCall(totalHits: number, timeToExpireMs = 60_000) {
  return vi.fn(async (...args: unknown[]) => {
    const [command] = args as [string, ...unknown[]];
    if (command === 'SCRIPT') {
      return FAKE_SCRIPT_SHA;
    }
    if (command === 'EVALSHA') {
      return [totalHits, timeToExpireMs];
    }
    return totalHits;
  });
}

// Branches the same Lua-script-aware mock on the Redis key being
// incremented (the fourth `EVALSHA` argument), so a single mock can give
// independent responses to independent counters (different IPs, different
// keyPrefixes) within one test.
function mockRedisCallByKey(resolve: (key: string) => { totalHits: number; timeToExpireMs?: number }) {
  return vi.fn(async (...args: unknown[]) => {
    const [command] = args as [string, ...unknown[]];
    if (command === 'SCRIPT') {
      return FAKE_SCRIPT_SHA;
    }
    if (command === 'EVALSHA') {
      const key = args[3] as string;
      const { totalHits, timeToExpireMs = 60_000 } = resolve(key);
      return [totalHits, timeToExpireMs];
    }
    return 0;
  });
}

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
    vi.mocked(redis.call).mockImplementation(mockRedisCall(1));
    const limiter = createRateLimiter({ redis, windowMs: 60_000, max: 2, keyPrefix: 'test:under' });
    const app = buildApp(limiter);

    const res = await app.request('/limited', { headers: { 'x-forwarded-for': '203.0.113.1' } });

    expect(res.status).toBe(200);
  });

  it('should_returnTooManyRequestsEnvelope_when_overLimit', async () => {
    // A short `timeToExpireMs` (5s) inside a much longer window (60s) proves
    // the `Retry-After` header reflects the store's actual remaining time,
    // not a static `windowMs`-derived value (which would be 60).
    vi.mocked(redis.call).mockImplementation(mockRedisCall(3, 5_000));
    const limiter = createRateLimiter({ redis, windowMs: 60_000, max: 2, keyPrefix: 'test:over' });
    const app = buildApp(limiter);

    const res = await app.request('/limited', { headers: { 'x-forwarded-for': '203.0.113.2' } });
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body).toEqual({
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later.' },
    });
    const retryAfter = Number(res.headers.get('retry-after'));
    expect(retryAfter).not.toBeNaN();
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(5);
  });

  it('should_useCustomMessage_when_messageOptionProvided', async () => {
    vi.mocked(redis.call).mockImplementation(mockRedisCall(3));
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
    vi.mocked(redis.call).mockImplementation(mockRedisCall(1));
    const limiter = createRateLimiter({ redis, windowMs: 60_000, max: 5, keyPrefix: 'test:prefix' });
    const app = buildApp(limiter);

    await app.request('/limited', { headers: { 'x-forwarded-for': '203.0.113.4' } });

    const evalshaCall = vi
      .mocked(redis.call)
      .mock.calls.find(([command]) => command === 'EVALSHA') as unknown as [
      string,
      string,
      string,
      string,
    ];
    const [, , , keyArg] = evalshaCall;
    expect(keyArg).toContain('rl:test:prefix:');
  });

  it('should_isolateCounters_when_requestsComeFromDifferentIps', async () => {
    const overLimitIp = '203.0.113.20';
    const underLimitIp = '203.0.113.21';
    vi.mocked(redis.call).mockImplementation(
      mockRedisCallByKey((key) => ({ totalHits: key.includes(overLimitIp) ? 3 : 1 })),
    );
    const limiter = createRateLimiter({ redis, windowMs: 60_000, max: 2, keyPrefix: 'test:per-ip' });
    const app = buildApp(limiter);

    const overLimitRes = await app.request('/limited', { headers: { 'x-forwarded-for': overLimitIp } });
    const underLimitRes = await app.request('/limited', { headers: { 'x-forwarded-for': underLimitIp } });

    expect(overLimitRes.status).toBe(429);
    expect(underLimitRes.status).toBe(200);
  });

  it('should_isolateCounters_when_limitersHaveDifferentKeyPrefixes', async () => {
    const sameIp = '203.0.113.22';
    vi.mocked(redis.call).mockImplementation(
      mockRedisCallByKey((key) => ({ totalHits: key.includes('rl:test:prefix-over:') ? 3 : 1 })),
    );
    const overLimitLimiter = createRateLimiter({
      redis,
      windowMs: 60_000,
      max: 2,
      keyPrefix: 'test:prefix-over',
    });
    const underLimitLimiter = createRateLimiter({
      redis,
      windowMs: 60_000,
      max: 2,
      keyPrefix: 'test:prefix-under',
    });
    const overLimitApp = buildApp(overLimitLimiter);
    const underLimitApp = buildApp(underLimitLimiter);

    const overLimitRes = await overLimitApp.request('/limited', { headers: { 'x-forwarded-for': sameIp } });
    const underLimitRes = await underLimitApp.request('/limited', { headers: { 'x-forwarded-for': sameIp } });

    expect(overLimitRes.status).toBe(429);
    expect(underLimitRes.status).toBe(200);
  });

  it('should_allowRequest_when_redisCallThrows', async () => {
    vi.mocked(redis.call).mockRejectedValue(new Error('Redis unavailable'));
    const limiter = createRateLimiter({ redis, windowMs: 60_000, max: 1, keyPrefix: 'test:fail-open' });
    const app = buildApp(limiter);

    const res = await app.request('/limited', { headers: { 'x-forwarded-for': '203.0.113.5' } });

    expect(res.status).toBe(200);
  });
});
