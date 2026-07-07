import { type Context, Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';
import { fetchLotTitle, fetchUserEmail } from './enrichment';

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

interface InvoiceDto {
  id: string;
  lotId: string;
  winnerUserId: string;
  [key: string]: unknown;
}

interface Clients {
  payment: ServiceClient;
  catalogue: ServiceClient;
  user: ServiceClient;
}

export function buildInvoicesRouter(clients: Clients): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });
  const { payment, catalogue, user } = clients;

  const enrich = async (invoice: InvoiceDto, token: string) => {
    const [lotTitle, winnerEmail] = await Promise.all([
      fetchLotTitle(catalogue, invoice.lotId, token),
      fetchUserEmail(user, invoice.winnerUserId, token),
    ]);
    return { ...invoice, lotTitle, winnerEmail };
  };

  r.get('/admin/api/invoices', auth, async c =>
    proxy(async () => {
      const res = await payment.get<{ data: InvoiceDto[] }>(
        `/api/payments/invoices?${new URLSearchParams(c.req.query() as Record<string, string>)}`, tok(c));
      return { data: await Promise.all(res.data.map(inv => enrich(inv, tok(c)))) };
    }, c));

  r.get('/admin/api/invoices/:id', auth, async c =>
    proxy(async () => {
      const res = await payment.get<{ data: InvoiceDto }>(
        `/api/payments/invoices/${c.req.param('id')}`, tok(c));
      return { data: await enrich(res.data, tok(c)) };
    }, c));

  r.patch('/admin/api/invoices/:id/extend', auth, async c =>
    proxy(async () => payment.patch(`/api/payments/invoices/${c.req.param('id')}/extend`, tok(c), await c.req.json()), c));

  r.patch('/admin/api/invoices/:id/cancel', auth, async c =>
    proxy(async () => payment.patch(`/api/payments/invoices/${c.req.param('id')}/cancel`, tok(c), await c.req.json()), c));

  return r;
}
