import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { buildAdminUsersRouter } from './admin-users-router';
import { ListUsersUseCase } from '../application/list-users.use-case';
import { GetMeUseCase } from '../application/get-me.use-case';
import { SuspendUserUseCase } from '../application/suspend-user.use-case';
import { ReinstateUserUseCase } from '../application/reinstate-user.use-case';
import { ApproveUserUseCase } from '../application/approve-user.use-case';
import { AdminCreateUserUseCase } from '../application/admin-create-user.use-case';
import { AdminUpdateUserUseCase } from '../application/admin-update-user.use-case';

const makeUseCases = () => ({
  listUsers:       { execute: vi.fn() } as unknown as ListUsersUseCase,
  getUser:         { execute: vi.fn() } as unknown as GetMeUseCase,
  suspendUser:     { execute: vi.fn() } as unknown as SuspendUserUseCase,
  reinstateUser:   { execute: vi.fn() } as unknown as ReinstateUserUseCase,
  approveUser:     { execute: vi.fn() } as unknown as ApproveUserUseCase,
  adminCreateUser: { execute: vi.fn() } as unknown as AdminCreateUserUseCase,
  adminUpdateUser: { execute: vi.fn() } as unknown as AdminUpdateUserUseCase,
});

function buildKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKeyPem: privateKey as unknown as string, publicKeyPem: publicKey as unknown as string };
}

function makeAdminToken(privateKeyPem: string): string {
  return jwt.sign(
    {
      userId: 'admin-1',
      email: 'admin@example.com',
      verificationStatus: 'APPROVED_BIDDER',
      role: 'ADMIN',
    },
    privateKeyPem,
    { algorithm: 'RS256', expiresIn: '15m' },
  );
}

describe('buildAdminUsersRouter', () => {
  describe('POST /', () => {
    it('creates a user and returns 201 with the id', async () => {
      const useCases = makeUseCases();
      const { privateKeyPem, publicKeyPem } = buildKeys();
      const adminToken = makeAdminToken(privateKeyPem);
      (useCases.adminCreateUser.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'new-id' });

      const app = new Hono();
      app.route('/', buildAdminUsersRouter(useCases, publicKeyPem));

      const res = await app.request('/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.com', password: 'CorrectHorse9!', role: 'BUYER' }),
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ data: { id: 'new-id' } });
    });

    it('returns 400 when required fields are missing', async () => {
      const useCases = makeUseCases();
      const { privateKeyPem, publicKeyPem } = buildKeys();
      const adminToken = makeAdminToken(privateKeyPem);

      const app = new Hono();
      app.route('/', buildAdminUsersRouter(useCases, publicKeyPem));

      const res = await app.request('/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.com' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 409 on duplicate email', async () => {
      const useCases = makeUseCases();
      const { privateKeyPem, publicKeyPem } = buildKeys();
      const adminToken = makeAdminToken(privateKeyPem);
      (useCases.adminCreateUser.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Email already registered'),
      );

      const app = new Hono();
      app.route('/', buildAdminUsersRouter(useCases, publicKeyPem));

      const res = await app.request('/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.com', password: 'CorrectHorse9!', role: 'BUYER' }),
      });

      expect(res.status).toBe(409);
    });
  });

  describe('PATCH /:id', () => {
    it('updates and returns the id', async () => {
      const useCases = makeUseCases();
      const { privateKeyPem, publicKeyPem } = buildKeys();
      const adminToken = makeAdminToken(privateKeyPem);
      (useCases.adminUpdateUser.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const app = new Hono();
      app.route('/', buildAdminUsersRouter(useCases, publicKeyPem));

      const res = await app.request('/u1', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: 'GB' }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { id: 'u1' } });
    });

    it('returns 404 for an unknown user', async () => {
      const useCases = makeUseCases();
      const { privateKeyPem, publicKeyPem } = buildKeys();
      const adminToken = makeAdminToken(privateKeyPem);
      (useCases.adminUpdateUser.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('User not found'),
      );

      const app = new Hono();
      app.route('/', buildAdminUsersRouter(useCases, publicKeyPem));

      const res = await app.request('/missing', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: 'GB' }),
      });

      expect(res.status).toBe(404);
    });

    it('does not shadow /:id/suspend, /:id/reinstate or /:id/approve', async () => {
      const useCases = makeUseCases();
      const { privateKeyPem, publicKeyPem } = buildKeys();
      const adminToken = makeAdminToken(privateKeyPem);
      (useCases.suspendUser.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const app = new Hono();
      app.route('/', buildAdminUsersRouter(useCases, publicKeyPem));

      const res = await app.request('/u1/suspend', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(200);
      expect(useCases.suspendUser.execute).toHaveBeenCalledWith('u1');
      expect(useCases.adminUpdateUser.execute).not.toHaveBeenCalled();
    });
  });
});
