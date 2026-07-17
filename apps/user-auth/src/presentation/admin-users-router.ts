import { type Context, Hono } from 'hono';
import { authMiddleware, JwtPayload } from '@carat-room/shared-auth';
import { User, UserStatus } from '../domain/user';
import { ListUsersUseCase } from '../application/list-users.use-case';
import { GetMeUseCase } from '../application/get-me.use-case';
import { SuspendUserUseCase } from '../application/suspend-user.use-case';
import { ReinstateUserUseCase } from '../application/reinstate-user.use-case';
import { ApproveUserUseCase } from '../application/approve-user.use-case';
import { AdminCreateUserUseCase } from '../application/admin-create-user.use-case';
import { AdminUpdateUserUseCase } from '../application/admin-update-user.use-case';

interface UseCases {
  listUsers: ListUsersUseCase;
  getUser: GetMeUseCase;
  suspendUser: SuspendUserUseCase;
  reinstateUser: ReinstateUserUseCase;
  approveUser: ApproveUserUseCase;
  adminCreateUser: AdminCreateUserUseCase;
  adminUpdateUser: AdminUpdateUserUseCase;
}

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

const PHONE_VERIFIED_STATUSES = new Set<UserStatus>([
  UserStatus.PHONE_VERIFIED,
  UserStatus.PENDING_REVIEW,
  UserStatus.APPROVED_BIDDER,
]);

function toSummary(user: User) {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    country: user.country,
    registeredAt: user.createdAt.toISOString(),
  };
}

function toDetail(user: User) {
  return {
    ...toSummary(user),
    emailVerified: user.status !== UserStatus.REGISTERED,
    phoneVerified: PHONE_VERIFIED_STATUSES.has(user.status),
  };
}

export function buildAdminUsersRouter(useCases: UseCases, jwtPublicKey: string): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const adminOnly = authMiddleware(jwtPublicKey, { adminOnly: true });

  router.get('/', adminOnly, async (c) => {
    const users = await useCases.listUsers.execute({
      status: c.req.query('status'),
      search: c.req.query('search'),
    });
    return c.json({ data: users.map(toSummary) });
  });

  router.get('/:id', adminOnly, async (c) => {
    try {
      const user = await useCases.getUser.execute(c.req.param('id'));
      return c.json({ data: toDetail(user) });
    } catch {
      return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
    }
  });

  const mutate = async (c: Context, fn: () => Promise<void>): Promise<Response> => {
    try {
      await fn();
      return c.json({ data: { id: c.req.param('id') } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'User not found') {
        return c.json({ error: { code: 'NOT_FOUND', message } }, 404);
      }
      return c.json({ error: { code: 'CONFLICT', message } }, 409);
    }
  };

  router.patch('/:id/suspend', adminOnly, async (c) =>
    mutate(c, () => useCases.suspendUser.execute(c.req.param('id'))));

  router.patch('/:id/reinstate', adminOnly, async (c) =>
    mutate(c, () => useCases.reinstateUser.execute(c.req.param('id'))));

  router.patch('/:id/approve', adminOnly, async (c) =>
    mutate(c, () => useCases.approveUser.execute(c.req.param('id'))));

  router.post('/', adminOnly, async (c) => {
    const body = await c.req.json<{ email?: string; password?: string; role?: string; country?: string }>();
    if (!body.email || !body.password || (body.role !== 'BUYER' && body.role !== 'ADMIN')) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'email, password and role (BUYER or ADMIN) are required' } },
        400,
      );
    }
    try {
      const result = await useCases.adminCreateUser.execute({
        email: body.email,
        password: body.password,
        role: body.role,
        country: body.country,
      });
      return c.json({ data: { id: result.id } }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Email already registered') {
        return c.json({ error: { code: 'CONFLICT', message } }, 409);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
    }
  });

  // Registered after /:id/suspend, /:id/reinstate and /:id/approve so those more specific
  // PATCH routes match first (Hono matches route patterns in registration order).
  router.patch('/:id', adminOnly, async (c) => {
    const body = await c.req.json<{ email?: string; country?: string }>();
    try {
      await useCases.adminUpdateUser.execute(c.req.param('id'), { email: body.email, country: body.country });
      return c.json({ data: { id: c.req.param('id') } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'User not found') {
        return c.json({ error: { code: 'NOT_FOUND', message } }, 404);
      }
      if (message === 'Email already registered') {
        return c.json({ error: { code: 'CONFLICT', message } }, 409);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
    }
  });

  return router;
}
