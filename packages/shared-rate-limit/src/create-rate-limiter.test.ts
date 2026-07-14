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
