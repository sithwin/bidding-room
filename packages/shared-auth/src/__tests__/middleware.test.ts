import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { SignJWT, generateKeyPair, exportSPKI } from 'jose';
import { authMiddleware } from '../middleware.js';
import type { JwtPayload } from '../verify.js';

async function buildKeys() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicKeyPem = await exportSPKI(publicKey);
  return { privateKey, publicKeyPem };
}

async function makeToken(privateKey: CryptoKey, overrides: Partial<JwtPayload> = {}) {
  return new SignJWT({
    userId: 'user-123',
    email: 'test@example.com',
    verificationStatus: 'APPROVED_BIDDER',
    role: 'BUYER',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(privateKey);
}

describe('authMiddleware', () => {
  it('should_attachJwtPayloadToContext_when_tokenIsValid', async () => {
    const { privateKey, publicKeyPem } = await buildKeys();
    const token = await makeToken(privateKey);

    const app = new Hono();
    app.use('*', authMiddleware(publicKeyPem));
    app.get('/test', (c) => {
      const payload = c.get('jwtPayload') as JwtPayload;
      return c.json({ userId: payload.userId });
    });

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string };
    expect(body.userId).toBe('user-123');
  });

  it('should_return401_when_authorizationHeaderIsMissing', async () => {
    const { publicKeyPem } = await buildKeys();

    const app = new Hono();
    app.use('*', authMiddleware(publicKeyPem));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(401);
  });

  it('should_return401_when_tokenIsInvalid', async () => {
    const { publicKeyPem } = await buildKeys();

    const app = new Hono();
    app.use('*', authMiddleware(publicKeyPem));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer not-a-valid-token' },
    });
    expect(res.status).toBe(401);
  });

  it('should_return403_when_roleIsNotAdmin_and_adminOnlyIsTrue', async () => {
    const { privateKey, publicKeyPem } = await buildKeys();
    const token = await makeToken(privateKey, { role: 'BUYER' });

    const app = new Hono();
    app.use('*', authMiddleware(publicKeyPem, { adminOnly: true }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});
