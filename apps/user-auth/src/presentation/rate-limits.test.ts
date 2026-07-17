import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import Redis from 'ioredis';
import { buildUserAuthRateLimits, maxRequestsFromEnv } from './rate-limits';

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

describe('buildUserAuthRateLimits', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = new Redis();
  });

  it('should_returnTooManyRequests_when_strictLimitExceededOnLogin', async () => {
    mockRedisCallSequence(redis, 11);
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
    mockRedisCallSequence(redis, 31);
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
    mockRedisCallSequence(redis, 101);
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

describe('maxRequestsFromEnv', () => {
  const ENV_VAR = 'RATE_LIMITS_TEST_UNUSED_VAR';

  afterEach(() => {
    delete process.env[ENV_VAR];
  });

  it('should_returnDefault_when_envVarUnset', () => {
    expect(maxRequestsFromEnv(ENV_VAR, 10)).toBe(10);
  });

  it('should_returnParsedValue_when_envVarIsPositiveInteger', () => {
    process.env[ENV_VAR] = '1000';
    expect(maxRequestsFromEnv(ENV_VAR, 10)).toBe(1000);
  });

  it('should_returnDefault_when_envVarIsNotANumber', () => {
    process.env[ENV_VAR] = 'not-a-number';
    expect(maxRequestsFromEnv(ENV_VAR, 10)).toBe(10);
  });

  it('should_returnDefault_when_envVarIsZeroOrNegative', () => {
    process.env[ENV_VAR] = '0';
    expect(maxRequestsFromEnv(ENV_VAR, 10)).toBe(10);

    process.env[ENV_VAR] = '-5';
    expect(maxRequestsFromEnv(ENV_VAR, 10)).toBe(10);
  });
});
