import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { buildUserRouter } from './user-router';
import { RegisterUseCase } from '../application/register.use-case';
import { LoginUseCase } from '../application/login.use-case';
import { GetMeUseCase } from '../application/get-me.use-case';
import { User, UserRole, UserStatus } from '../domain/user';
import { JwtPayload } from '@carat-room/shared-auth';

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
    app.route('/api/users', buildUserRouter(useCases));

    const res = await app.request('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com', password: 'secret123' }),
    });

    expect(res.status).toBe(201);
  });

  it('should_return400_when_emailMissing', async () => {
    const useCases = makeUseCases();
    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases));

    const res = await app.request('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'secret123' }),
    });

    expect(res.status).toBe(400);
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
    app.route('/api/users', buildUserRouter(useCases));

    const res = await app.request('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com', password: 'secret' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.accessToken).toBe('at');
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
    app.route('/api/users', buildUserRouter(useCases));

    const res = await app.request('/api/users/me');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.email).toBe('jane@example.com');
  });
});
