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
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 404 | 409 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

export function buildAuctionsRouter(client: ServiceClient): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });

  r.get('/admin/api/auctions', auth, async c =>
    proxy(() => client.get('/api/auctions', tok(c)), c));

  r.get('/admin/api/auctions/:lotId', auth, async c =>
    proxy(() => client.get(`/api/auctions/${c.req.param('lotId')}`, tok(c)), c));

  r.post('/admin/api/auctions', auth, async c =>
    proxy(async () => client.post('/api/auctions', tok(c), await c.req.json()), c));

  r.patch('/admin/api/auctions/:lotId/reschedule', auth, async c =>
    proxy(async () => client.patch(`/api/auctions/${c.req.param('lotId')}/reschedule`, tok(c), await c.req.json()), c));

  r.delete('/admin/api/auctions/:lotId', auth, async c =>
    proxy(() => client.delete(`/api/auctions/${c.req.param('lotId')}`, tok(c)), c));

  return r;
}
