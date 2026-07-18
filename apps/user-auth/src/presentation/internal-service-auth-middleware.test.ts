import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requireInternalServiceSecret } from './internal-service-auth-middleware';

const makeApp = (expectedSecret: string) => {
  const app = new Hono();
  app.post('/guarded', requireInternalServiceSecret(expectedSecret), (c) => c.json({ data: { ok: true } }, 200));
  return app;
};

describe('requireInternalServiceSecret', () => {
  it('should_return401_when_headerMissing', async () => {
    const app = makeApp('correct-secret');

    const res = await app.request('/guarded', { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should_return401_when_secretIsWrong', async () => {
    const app = makeApp('correct-secret');

    const res = await app.request('/guarded', {
      method: 'POST',
      headers: { 'x-internal-service-secret': 'wrong-secret' },
    });

    expect(res.status).toBe(401);
  });

  it('should_callNextHandler_when_secretIsCorrect', async () => {
    const app = makeApp('correct-secret');

    const res = await app.request('/guarded', {
      method: 'POST',
      headers: { 'x-internal-service-secret': 'correct-secret' },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.ok).toBe(true);
  });

  it('should_alwaysReturn401_when_expectedSecretIsEmpty_evenWithEmptyProvidedHeader', async () => {
    const app = makeApp('');

    const res = await app.request('/guarded', {
      method: 'POST',
      headers: { 'x-internal-service-secret': '' },
    });

    expect(res.status).toBe(401);
  });

  it('should_return401_when_expectedSecretIsEmpty_andHeaderMissing', async () => {
    const app = makeApp('');

    const res = await app.request('/guarded', { method: 'POST' });

    expect(res.status).toBe(401);
  });
});
