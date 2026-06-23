import { type Context, Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';

type Ctx = Context;

const jwtPublicKey = process.env['JWT_PUBLIC_KEY'] ?? '';

function tok(c: Ctx): string {
  return c.req.header('Authorization')?.replace('Bearer ', '') ?? '';
}

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 404 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

export function buildCategoriesRouter(client: ServiceClient): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });

  r.get('/admin/api/categories', auth, async c =>
    proxy(() => client.get('/api/categories', tok(c)), c));

  r.post('/admin/api/categories', auth, async c =>
    proxy(async () => client.post('/api/categories', tok(c), await c.req.json()), c));

  r.patch('/admin/api/categories/:id', auth, async c =>
    proxy(async () => client.patch(`/api/categories/${c.req.param('id')}`, tok(c), await c.req.json()), c));

  r.delete('/admin/api/categories/:id', auth, async c =>
    proxy(() => client.delete(`/api/categories/${c.req.param('id')}`, tok(c)), c));

  return r;
}
