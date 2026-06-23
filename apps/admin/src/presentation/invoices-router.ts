import { Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';

type Ctx = Parameters<Parameters<Hono['get']>[1]>[0];

const jwtPublicKey = process.env['JWT_PUBLIC_KEY'] ?? '';
const tok = (c: Ctx) => c.req.header('Authorization')?.replace('Bearer ', '') ?? '';

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 404 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

export function buildInvoicesRouter(client: ServiceClient): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });

  r.get('/admin/api/invoices', auth, async c =>
    proxy(() => client.get(`/api/payments/invoices?${new URLSearchParams(c.req.query() as Record<string, string>)}`, tok(c)), c));

  r.get('/admin/api/invoices/:id', auth, async c =>
    proxy(() => client.get(`/api/payments/invoices/${c.req.param('id')}`, tok(c)), c));

  r.patch('/admin/api/invoices/:id/extend', auth, async c =>
    proxy(async () => client.patch(`/api/payments/invoices/${c.req.param('id')}/extend`, tok(c), await c.req.json()), c));

  r.patch('/admin/api/invoices/:id/cancel', auth, async c =>
    proxy(async () => client.patch(`/api/payments/invoices/${c.req.param('id')}/cancel`, tok(c), await c.req.json()), c));

  return r;
}
