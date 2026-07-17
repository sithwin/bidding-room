import { describe, it, expect, vi } from 'vitest';
import { buildUserRouter } from './user-router';
import { HumanVerifier } from '../application/human-verifier';

function makeUseCases(overrides: Record<string, unknown> = {}) {
  return {
    register: { execute: vi.fn() },
    verifyEmail: { execute: vi.fn() },
    login: { execute: vi.fn() },
    refresh: { execute: vi.fn() },
    logout: { execute: vi.fn() },
    requestPhoneOtp: { execute: vi.fn() },
    verifyPhoneOtp: { execute: vi.fn() },
    getMe: { execute: vi.fn() },
    updateMe: { execute: vi.fn() },
    uploadIdentityDocument: { execute: vi.fn() },
    googleAuth: { execute: vi.fn() },
    setPassword: { execute: vi.fn() },
    ...overrides,
  };
}

const alwaysHumanVerifier: HumanVerifier = { verify: vi.fn().mockResolvedValue(true) };

describe('POST /auth/google', () => {
  it('should_return400_when_codeMissing', async () => {
    const router = buildUserRouter(makeUseCases() as never, alwaysHumanVerifier);
    const res = await router.request('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('should_setRefreshCookieAndReturnAccessToken_when_exchangeSucceeds', async () => {
    const googleAuth = { execute: vi.fn().mockResolvedValue({ accessToken: 'access-tok', refreshToken: 'refresh-tok' }) };
    const router = buildUserRouter(makeUseCases({ googleAuth }) as never, alwaysHumanVerifier);
    const res = await router.request('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'auth-code', codeVerifier: 'verifier' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.accessToken).toBe('access-tok');
    expect(res.headers.get('set-cookie')).toContain('carat_refresh=refresh-tok');
  });

  it('should_return400WithEmailNotVerifiedCode_when_googleEmailUnverified', async () => {
    const googleAuth = { execute: vi.fn().mockRejectedValue(new Error('Google email not verified')) };
    const router = buildUserRouter(makeUseCases({ googleAuth }) as never, alwaysHumanVerifier);
    const res = await router.request('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'auth-code', codeVerifier: 'verifier' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('should_notRequireTurnstileToken_unlikeLoginAndRegister', async () => {
    // No turnstileToken in the body at all, and /auth/google still reaches the use case rather than
    // short-circuiting with CAPTCHA_REQUIRED — confirms humanCheck middleware is not mounted on this route.
    const googleAuth = { execute: vi.fn().mockResolvedValue({ accessToken: 'access-tok', refreshToken: 'refresh-tok' }) };
    const router = buildUserRouter(makeUseCases({ googleAuth }) as never, alwaysHumanVerifier);
    const res = await router.request('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'auth-code', codeVerifier: 'verifier' }),
    });
    expect(res.status).toBe(200);
    expect(googleAuth.execute).toHaveBeenCalledOnce();
  });
});

describe('POST /login with a Google-only account', () => {
  it('should_return400WithPasswordNotSetCode_when_accountHasNoPassword', async () => {
    const login = { execute: vi.fn().mockRejectedValue(new Error('Password not set')) };
    const router = buildUserRouter(makeUseCases({ login }) as never, alwaysHumanVerifier);
    const res = await router.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com', password: 'anything', turnstileToken: 'test-token' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('PASSWORD_NOT_SET');
  });
});
