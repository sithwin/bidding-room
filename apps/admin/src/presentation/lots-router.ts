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
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 401 | 403 | 404 | 409 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

export function buildLotsRouter(client: ServiceClient): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });

  r.post('/admin/api/lots', auth, async c =>
    proxy(async () => client.post('/api/lots', tok(c), await c.req.json()), c));

  r.patch('/admin/api/lots/:id', auth, async c =>
    proxy(async () => client.patch(`/api/lots/${c.req.param('id')}`, tok(c), await c.req.json()), c));

  r.delete('/admin/api/lots/:id', auth, async c =>
    proxy(() => client.delete(`/api/lots/${c.req.param('id')}`, tok(c)), c));

  r.post('/admin/api/lots/:id/images/upload-url', auth, async c =>
    proxy(async () => client.post(`/api/lots/${c.req.param('id')}/images/upload-url`, tok(c), await c.req.json()), c));

  r.delete('/admin/api/lots/:id/images/:imageId', auth, async c =>
    proxy(() => client.delete(`/api/lots/${c.req.param('id')}/images/${c.req.param('imageId')}`, tok(c)), c));

  r.patch('/admin/api/lots/:id/images/reorder', auth, async c =>
    proxy(async () => client.patch(`/api/lots/${c.req.param('id')}/images/reorder`, tok(c), await c.req.json()), c));

  return r;
}
