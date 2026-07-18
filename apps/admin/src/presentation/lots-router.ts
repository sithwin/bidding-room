import { type Context, Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';
import { fetchCategoryNameMap, fetchLotAuctionStatus } from './enrichment';

type Ctx = Context;

const jwtPublicKey = (process.env['JWT_PUBLIC_KEY'] ?? '').replace(/\\n/g, '\n');

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

interface CatalogueLot {
  id: string;
  categoryId: string | null;
  auctionId: string | null;
  [key: string]: unknown;
}

export interface LotsRouterClients {
  catalogue: ServiceClient;
  auction: ServiceClient;
}

async function enrichLot(
  lot: CatalogueLot,
  clients: LotsRouterClients,
  token: string,
  categoryNames: Map<string, string>,
): Promise<CatalogueLot & { categoryName: string | null; auctionStatus: string | null }> {
  // catalogue's lots.auction_id is set only on initial INSERT and never updated by the real
  // "Schedule Auction" flow, so it must never gate this lookup — always ask auction-engine,
  // which is the sole owner of live auction status.
  const auctionStatus = await fetchLotAuctionStatus(clients.auction, lot.id, token);
  return {
    ...lot,
    categoryName: lot.categoryId ? categoryNames.get(lot.categoryId) ?? null : null,
    auctionStatus,
  };
}

export function buildLotsRouter(clients: LotsRouterClients): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });
  const { catalogue } = clients;

  r.get('/admin/api/lots', auth, async c =>
    proxy(async () => {
      const token = tok(c);
      const query = new URLSearchParams(c.req.query() as Record<string, string>);
      const [lotsRes, categoryNames] = await Promise.all([
        catalogue.get<{ data: CatalogueLot[]; meta: unknown }>(`/api/lots?${query}`, token),
        fetchCategoryNameMap(catalogue, token),
      ]);
      const data = await Promise.all(
        lotsRes.data.map(lot => enrichLot(lot, clients, token, categoryNames)),
      );
      return { data, meta: lotsRes.meta };
    }, c));

  r.get('/admin/api/lots/:id', auth, async c =>
    proxy(async () => {
      const token = tok(c);
      const [lotRes, categoryNames] = await Promise.all([
        catalogue.get<{ data: CatalogueLot }>(`/api/lots/${c.req.param('id')}`, token),
        fetchCategoryNameMap(catalogue, token),
      ]);
      const data = await enrichLot(lotRes.data, clients, token, categoryNames);
      return { data };
    }, c));

  r.post('/admin/api/lots', auth, async c =>
    proxy(async () => catalogue.post('/api/lots', tok(c), await c.req.json()), c));

  r.patch('/admin/api/lots/:id', auth, async c =>
    proxy(async () => catalogue.patch(`/api/lots/${c.req.param('id')}`, tok(c), await c.req.json()), c));

  r.delete('/admin/api/lots/:id', auth, async c =>
    proxy(() => catalogue.delete(`/api/lots/${c.req.param('id')}`, tok(c)), c));

  r.post('/admin/api/lots/:id/images/upload-url', auth, async c =>
    proxy(async () => catalogue.post(`/api/lots/${c.req.param('id')}/images/upload-url`, tok(c), await c.req.json()), c));

  r.post('/admin/api/lots/:id/images/confirm', auth, async c =>
    proxy(async () => catalogue.post(`/api/lots/${c.req.param('id')}/images/confirm`, tok(c), await c.req.json()), c));

  r.delete('/admin/api/lots/:id/images/:imageId', auth, async c =>
    proxy(() => catalogue.delete(`/api/lots/${c.req.param('id')}/images/${c.req.param('imageId')}`, tok(c)), c));

  r.patch('/admin/api/lots/:id/images/reorder', auth, async c =>
    proxy(async () => catalogue.patch(`/api/lots/${c.req.param('id')}/images/reorder`, tok(c), await c.req.json()), c));

  return r;
}
