import { type Context, Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';
import { fetchLotTitle } from './enrichment';

type Ctx = Context;

const jwtPublicKey = (process.env['JWT_PUBLIC_KEY'] ?? '').replace(/\\n/g, '\n');

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

interface EngineLotRow {
  lotId: string;
  status: string;
  currentHighestBid: number | null;
  bidCount: number;
  endAt: string;
}

interface Clients {
  auction: ServiceClient;
  catalogue: ServiceClient;
}

export function buildAuctionsRouter(clients: Clients): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });
  const { auction, catalogue } = clients;

  const toSummary = async (row: EngineLotRow, token: string) => ({
    lotId: row.lotId,
    lotTitle: await fetchLotTitle(catalogue, row.lotId, token),
    status: row.status,
    currentBid: row.currentHighestBid,
    bidCount: row.bidCount,
    endAt: row.endAt,
  });

  r.get('/admin/api/auctions', auth, async c =>
    proxy(async () => {
      const token = tok(c);
      const res = await auction.get<{ data: EngineLotRow[] }>('/api/auctions', token);
      return { data: await Promise.all(res.data.map(row => toSummary(row, token))) };
    }, c));

  r.get('/admin/api/auctions/:lotId', auth, async c =>
    proxy(async () => {
      const lotId = c.req.param('lotId');
      const token = tok(c);
      const [detail, bids] = await Promise.all([
        auction.get<{ data: EngineLotRow }>(`/api/auctions/${lotId}`, token),
        auction.get<{ data: unknown[] }>(`/api/auctions/${lotId}/bids?pageSize=100`, token),
      ]);
      return { data: { ...(await toSummary(detail.data, token)), bids: bids.data } };
    }, c));

  r.post('/admin/api/auctions', auth, async c =>
    proxy(async () => auction.post('/api/auctions', tok(c), await c.req.json()), c));

  r.patch('/admin/api/auctions/:lotId/reschedule', auth, async c =>
    proxy(async () => auction.patch(`/api/auctions/${c.req.param('lotId')}/reschedule`, tok(c), await c.req.json()), c));

  r.delete('/admin/api/auctions/:lotId', auth, async c =>
    proxy(() => auction.delete(`/api/auctions/${c.req.param('lotId')}`, tok(c)), c));

  return r;
}
