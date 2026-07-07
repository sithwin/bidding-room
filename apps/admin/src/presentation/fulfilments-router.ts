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

interface FulfilmentDto {
  id: string;
  lotId: string;
  userId: string;
  [key: string]: unknown;
}

interface Clients {
  shipping: ServiceClient;
  catalogue: ServiceClient;
  user: ServiceClient;
}

export function buildFulfilmentsRouter(clients: Clients): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });
  const { shipping, catalogue, user } = clients;

  const enrich = async (fulfilment: FulfilmentDto, token: string) => {
    const [lotTitle, buyerEmail] = await Promise.all([
      fetchLotTitle(catalogue, fulfilment.lotId, token),
      fetchUserEmail(user, fulfilment.userId, token),
    ]);
    return { ...fulfilment, lotTitle, buyerEmail };
  };

  r.get('/admin/api/fulfilments', auth, async c =>
    proxy(async () => {
      const res = await shipping.get<{ data: FulfilmentDto[] }>('/api/shipping/fulfilments', tok(c));
      return { data: await Promise.all(res.data.map(f => enrich(f, tok(c)))) };
    }, c));

  r.get('/admin/api/fulfilments/:id', auth, async c =>
    proxy(async () => {
      const res = await shipping.get<{ data: FulfilmentDto }>(
        `/api/shipping/fulfilments/${c.req.param('id')}`, tok(c));
      return { data: await enrich(res.data, tok(c)) };
    }, c));

  r.patch('/admin/api/fulfilments/:id/dispatch', auth, async c =>
    proxy(async () => shipping.patch(`/api/shipping/fulfilments/${c.req.param('id')}/dispatch`, tok(c), await c.req.json()), c));

  r.patch('/admin/api/fulfilments/:id/collect', auth, async c =>
    proxy(() => shipping.patch(`/api/shipping/fulfilments/${c.req.param('id')}/collect`, tok(c), undefined), c));

  return r;
}
