import { type Context, Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';

type Ctx = Context;

const jwtPublicKey = (process.env['JWT_PUBLIC_KEY'] ?? '').replace(/\\n/g, '\n');
const tok = (c: Ctx) => c.req.header('Authorization')?.replace('Bearer ', '') ?? '';

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 404 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

export function buildUsersRouter(client: ServiceClient): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });

  r.get('/admin/api/users', auth, async c =>
    proxy(() => client.get(`/api/users?${new URLSearchParams(c.req.query() as Record<string, string>)}`, tok(c)), c));

  r.get('/admin/api/users/:id', auth, async c =>
    proxy(() => client.get(`/api/users/${c.req.param('id')}`, tok(c)), c));

  r.patch('/admin/api/users/:id/suspend', auth, async c =>
    proxy(() => client.patch(`/api/users/${c.req.param('id')}/suspend`, tok(c), undefined), c));

  r.patch('/admin/api/users/:id/reinstate', auth, async c =>
    proxy(() => client.patch(`/api/users/${c.req.param('id')}/reinstate`, tok(c), undefined), c));

  r.patch('/admin/api/users/:id/approve', auth, async c =>
    proxy(() => client.patch(`/api/users/${c.req.param('id')}/approve`, tok(c), undefined), c));

  return r;
}
