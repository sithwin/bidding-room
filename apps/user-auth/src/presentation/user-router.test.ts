import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import {
  accessTokenResponseSchema,
  apiErrorSchema,
  emailLookupResponseSchema,
  identityDocumentResponseSchema,
  meResponseSchema,
  messageResponseSchema,
  stringErrorSchema,
} from '@carat-room/shared-types';
import { buildUserRouter } from './user-router';
import { RegisterUseCase } from '../application/register.use-case';
import { LoginUseCase } from '../application/login.use-case';
import { GetMeUseCase } from '../application/get-me.use-case';
import { User, UserRole, UserStatus } from '../domain/user';
import { JwtPayload } from '@carat-room/shared-auth';
import { HumanVerifier } from '../application/human-verifier';

const alwaysHumanVerifier = (): HumanVerifier => ({ verify: vi.fn().mockResolvedValue(true) });

const makeUseCases = () => ({
  register:               { execute: vi.fn() } as unknown as RegisterUseCase,
  verifyEmail:            { execute: vi.fn() } as unknown as any,
  login:                  { execute: vi.fn() } as unknown as LoginUseCase,
  refresh:                { execute: vi.fn() } as unknown as any,
  logout:                 { execute: vi.fn() } as unknown as any,
  requestPhoneOtp:        { execute: vi.fn() } as unknown as any,
  verifyPhoneOtp:         { execute: vi.fn() } as unknown as any,
  getMe:                  { execute: vi.fn() } as unknown as GetMeUseCase,
  updateMe:               { execute: vi.fn() } as unknown as any,
  uploadIdentityDocument: { execute: vi.fn() } as unknown as any,
  googleAuth:             { execute: vi.fn() } as unknown as any,
  setPassword:            { execute: vi.fn() } as unknown as any,
});

const jwtMiddleware = (userId = 'user-1') =>
  vi.fn(async (c: any, next: any) => {
    c.set('jwtPayload', {
      userId,
      role: 'BUYER',
      verificationStatus: UserStatus.APPROVED_BIDDER,
    } as JwtPayload);
    await next();
  });

describe('POST /api/users/register', () => {
  it('should_return201_when_registrationSucceeds', async () => {
    const useCases = makeUseCases();
    (useCases.register.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com', password: 'secret123', turnstileToken: 'test-token' }),
    });

    expect(res.status).toBe(201);
    messageResponseSchema.parse(await res.json());
  });

  it('should_return400_when_emailMissing', async () => {
    const useCases = makeUseCases();
    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'secret123', turnstileToken: 'test-token' }),
    });

    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/users/verify-email', () => {
  it('should_return200_when_tokenValid', async () => {
    const useCases = makeUseCases();
    (useCases.verifyEmail.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', code: 'abc123' }),
    });

    expect(res.status).toBe(200);
    messageResponseSchema.parse(await res.json());
  });

  it('should_return400_when_tokenInvalid', async () => {
    const useCases = makeUseCases();
    (useCases.verifyEmail.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Invalid or expired token'),
    );

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', code: 'nope' }),
    });

    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('BAD_REQUEST');
  });
});

describe('POST /api/users/login', () => {
  it('should_return200WithAccessToken_when_credentialsValid', async () => {
    const useCases = makeUseCases();
    (useCases.login.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
    });

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com', password: 'secret', turnstileToken: 'test-token' }),
    });

    expect(res.status).toBe(200);
    const body = accessTokenResponseSchema.parse(await res.json());
    expect(body.data.accessToken).toBe('at');
  });

  it('should_return401_when_credentialsInvalid', async () => {
    const useCases = makeUseCases();
    (useCases.login.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Invalid credentials'),
    );

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com', password: 'wrong', turnstileToken: 'test-token' }),
    });

    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /api/users/admin-login', () => {
  const INTERNAL_SECRET = 'test-internal-secret';

  it('should_return200WithAccessToken_when_secretAndCredentialsValid', async () => {
    const useCases = makeUseCases();
    (useCases.login.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
    });

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier(), INTERNAL_SECRET));

    const res = await app.request('/api/users/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-service-secret': INTERNAL_SECRET },
      body: JSON.stringify({ email: 'admin@example.com', password: 'secret' }),
    });

    expect(res.status).toBe(200);
    const body = accessTokenResponseSchema.parse(await res.json());
    expect(body.data.accessToken).toBe('at');
  });

  it('should_return401_when_secretHeaderMissing', async () => {
    const useCases = makeUseCases();

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier(), INTERNAL_SECRET));

    const res = await app.request('/api/users/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'secret' }),
    });

    expect(res.status).toBe(401);
    expect(useCases.login.execute).not.toHaveBeenCalled();
  });

  it('should_return401_when_secretHeaderWrong', async () => {
    const useCases = makeUseCases();

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier(), INTERNAL_SECRET));

    const res = await app.request('/api/users/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-service-secret': 'wrong-secret' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'secret' }),
    });

    expect(res.status).toBe(401);
    expect(useCases.login.execute).not.toHaveBeenCalled();
  });

  it('should_return401Unauthorized_when_secretValidButPasswordWrong', async () => {
    const useCases = makeUseCases();
    (useCases.login.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Invalid credentials'),
    );

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier(), INTERNAL_SECRET));

    const res = await app.request('/api/users/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-service-secret': INTERNAL_SECRET },
      body: JSON.stringify({ email: 'admin@example.com', password: 'wrong' }),
    });

    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('UNAUTHORIZED');
    expect(useCases.login.execute).toHaveBeenCalled();
  });
});

describe('POST /api/users/refresh', () => {
  it('should_return200WithAccessToken_when_refreshTokenValid', async () => {
    const useCases = makeUseCases();
    (useCases.refresh.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'at2',
      refreshToken: 'rt2',
    });

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/refresh', {
      method: 'POST',
      headers: { cookie: 'carat_refresh=rt' },
    });

    expect(res.status).toBe(200);
    const body = accessTokenResponseSchema.parse(await res.json());
    expect(body.data.accessToken).toBe('at2');
  });

  it('should_return401_when_noRefreshCookiePresent', async () => {
    const useCases = makeUseCases();
    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/refresh', { method: 'POST' });

    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /api/users/logout', () => {
  it('should_return200WithMessage_when_loggedOut', async () => {
    const useCases = makeUseCases();
    (useCases.logout.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/logout', {
      method: 'POST',
      headers: { cookie: 'carat_refresh=rt' },
    });

    expect(res.status).toBe(200);
    messageResponseSchema.parse(await res.json());
  });
});

describe('POST /api/users/phone/request', () => {
  it('should_return200_when_otpSent', async () => {
    const useCases = makeUseCases();
    (useCases.requestPhoneOtp.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/phone/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+447700900000' }),
    });

    expect(res.status).toBe(200);
    messageResponseSchema.parse(await res.json());
  });

  it('should_return429_when_tooManyOtpAttempts', async () => {
    const useCases = makeUseCases();
    (useCases.requestPhoneOtp.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Too many OTP attempts'),
    );

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/phone/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+447700900000' }),
    });

    expect(res.status).toBe(429);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('POST /api/users/phone/verify', () => {
  it('should_return200_when_otpValid', async () => {
    const useCases = makeUseCases();
    (useCases.verifyPhoneOtp.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/phone/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });

    expect(res.status).toBe(200);
    messageResponseSchema.parse(await res.json());
  });

  it('should_return400_when_otpInvalid', async () => {
    const useCases = makeUseCases();
    (useCases.verifyPhoneOtp.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Invalid or expired OTP'),
    );

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/phone/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '000000' }),
    });

    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('BAD_REQUEST');
  });
});

describe('GET /api/users/me', () => {
  it('should_return200WithProfile_when_authenticated', async () => {
    const useCases = makeUseCases();
    const user = User.create({
      id: 'u-1',
      email: 'jane@example.com',
      passwordHash: 'h',
      role: UserRole.BUYER,
    });
    (useCases.getMe.execute as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/me');

    expect(res.status).toBe(200);
    const me = meResponseSchema.parse(await res.json());
    expect(me.data.email).toBe('jane@example.com');
  });
});

describe('PATCH /api/users/me', () => {
  it('should_return200WithMessage_when_profileUpdated', async () => {
    const useCases = makeUseCases();
    (useCases.updateMe.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'GB' }),
    });

    expect(res.status).toBe(200);
    messageResponseSchema.parse(await res.json());
    expect(useCases.updateMe.execute).toHaveBeenCalledWith({ userId: 'user-1', country: 'GB' });
  });
});

describe('POST /api/users/identity-document', () => {
  it('should_return200WithPendingReview_when_uploadSucceeds', async () => {
    const useCases = makeUseCases();
    (useCases.uploadIdentityDocument.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'pending_review',
    });

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const form = new FormData();
    form.set('file', new File(['%PDF-1.4'], 'passport.pdf', { type: 'application/pdf' }));

    const res = await app.request('/api/users/identity-document', {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(200);
    const body = identityDocumentResponseSchema.parse(await res.json());
    expect(body.status).toBe('pending_review');
  });

  it('should_return400_when_fileFieldMissing', async () => {
    const useCases = makeUseCases();

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const form = new FormData();

    const res = await app.request('/api/users/identity-document', {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(400);
    expect(stringErrorSchema.parse(await res.json()).error).toBe('Missing file field');
  });

  it('should_return422_when_uploadRejected', async () => {
    const useCases = makeUseCases();
    (useCases.uploadIdentityDocument.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('File exceeds 10 MB limit'),
    );

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const form = new FormData();
    form.set('file', new File(['%PDF-1.4'], 'passport.pdf', { type: 'application/pdf' }));

    const res = await app.request('/api/users/identity-document', {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(422);
    expect(stringErrorSchema.parse(await res.json()).error).toBe('File exceeds 10 MB limit');
  });
});

describe('GET /api/users/:id/email', () => {
  it('should_return200WithEmail_when_userExists', async () => {
    const useCases = makeUseCases();
    const user = User.create({
      id: 'u-1',
      email: 'jane@example.com',
      passwordHash: 'h',
      role: UserRole.BUYER,
    });
    (useCases.getMe.execute as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/u-1/email');

    expect(res.status).toBe(200);
    const body = emailLookupResponseSchema.parse(await res.json());
    expect(body.email).toBe('jane@example.com');
  });

  it('should_return404_when_userDoesNotExist', async () => {
    const useCases = makeUseCases();
    (useCases.getMe.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('User not found'));

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/missing/email');

    expect(res.status).toBe(404);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('NOT_FOUND');
  });
});

describe('human verification on register and login', () => {
  it('should_return400CaptchaRequired_when_registerHasNoToken', async () => {
    const useCases = makeUseCases();
    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com', password: 'secret123' }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('CAPTCHA_REQUIRED');
    expect(useCases.register.execute).not.toHaveBeenCalled();
  });

  it('should_return400CaptchaFailed_when_loginTokenRejected', async () => {
    const useCases = makeUseCases();
    const rejectingVerifier: HumanVerifier = { verify: vi.fn().mockResolvedValue(false) };
    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, rejectingVerifier));

    const res = await app.request('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com', password: 'secret', turnstileToken: 'bad' }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('CAPTCHA_FAILED');
    expect(useCases.login.execute).not.toHaveBeenCalled();
  });
});
