import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { requireHumanVerification } from './human-verification-middleware';
import { HumanVerifier } from '../application/human-verifier';

const makeApp = (verifier: HumanVerifier) => {
  const app = new Hono();
  app.post('/guarded', requireHumanVerification(verifier), (c) => c.json({ data: { ok: true } }, 200));
  return app;
};

const post = (app: Hono, body: unknown) =>
  app.request('/guarded', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('requireHumanVerification', () => {
  it('should_return400CaptchaRequired_when_tokenMissing', async () => {
    const verifier: HumanVerifier = { verify: vi.fn() };

    const res = await post(makeApp(verifier), { email: 'a@b.c' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('CAPTCHA_REQUIRED');
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('should_return400CaptchaFailed_when_verifierRejectsToken', async () => {
    const verifier: HumanVerifier = { verify: vi.fn().mockResolvedValue(false) };

    const res = await post(makeApp(verifier), { turnstileToken: 'bad-token' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('CAPTCHA_FAILED');
  });

  it('should_callNextHandler_when_verifierAcceptsToken', async () => {
    const verifier: HumanVerifier = { verify: vi.fn().mockResolvedValue(true) };

    const res = await post(makeApp(verifier), { turnstileToken: 'good-token' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.ok).toBe(true);
    expect(verifier.verify).toHaveBeenCalledWith('good-token', undefined);
  });

  it('should_forwardClientIp_when_forwardedHeaderPresent', async () => {
    const verifier: HumanVerifier = { verify: vi.fn().mockResolvedValue(true) };
    const app = makeApp(verifier);

    await app.request('/guarded', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
      body: JSON.stringify({ turnstileToken: 't' }),
    });

    expect(verifier.verify).toHaveBeenCalledWith('t', '203.0.113.7');
  });

  it('should_return400CaptchaRequired_when_bodyIsNotJson', async () => {
    const verifier: HumanVerifier = { verify: vi.fn() };
    const app = makeApp(verifier);

    const res = await app.request('/guarded', { method: 'POST', body: 'not json' });

    expect(res.status).toBe(400);
  });
});
