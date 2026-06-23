import { type Context, Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';

type Ctx = Context;

const jwtPublicKey = process.env['JWT_PUBLIC_KEY'] ?? '';
const tok = (c: Ctx) => c.req.header('Authorization')?.replace('Bearer ', '') ?? '';

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

export function buildReportsRouter(client: ServiceClient): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });

  r.get('/admin/api/reports/dashboard', auth, async c =>
    proxy(() => client.get('/api/reports/dashboard', tok(c)), c));

  r.get('/admin/api/reports/auction-results', auth, async c =>
    proxy(() => client.get(`/api/auctions/reports/results?${new URLSearchParams(c.req.query() as Record<string, string>)}`, tok(c)), c));

  r.get('/admin/api/reports/revenue', auth, async c =>
    proxy(() => client.get(`/api/payments/reports/revenue?${new URLSearchParams(c.req.query() as Record<string, string>)}`, tok(c)), c));

  r.get('/admin/api/reports/unsold', auth, async c =>
    proxy(() => client.get('/api/auctions/reports/unsold', tok(c)), c));

  return r;
}
