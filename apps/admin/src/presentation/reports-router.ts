import { type Context, Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';
import { fetchCategoryNameMap, fetchLotSummary, fetchUserEmail } from './enrichment';

type Ctx = Context;

const jwtPublicKey = (process.env['JWT_PUBLIC_KEY'] ?? '').replace(/\\n/g, '\n');
const tok = (c: Ctx) => c.req.header('Authorization')?.replace('Bearer ', '') ?? '';

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) {
      console.error('[proxy] ServiceError', err.status, JSON.stringify(err.body));
      return c.json(err.body, err.status as 400 | 500);
    }
    console.error('[proxy] Unexpected error:', err);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

interface AuctionResultRow {
  lotId: string;
  finalBid: number | null;
  reserveMet: boolean;
  winnerUserId: string | null;
  closedAt: string;
}

interface UnsoldRow {
  lotId: string;
  highestBid: number | null;
}

interface Clients {
  auction: ServiceClient;
  payment: ServiceClient;
  catalogue: ServiceClient;
  user: ServiceClient;
  shipping: ServiceClient;
}

const countOrNull = async (
  fetchCount: () => Promise<{ data: { count: number } }>,
): Promise<number | null> => {
  try {
    return (await fetchCount()).data.count;
  } catch {
    return null;
  }
};

export function buildReportsRouter(clients: Clients): Hono {
  const r = new Hono();
  const auth = authMiddleware(jwtPublicKey, { adminOnly: true });
  const { auction, payment, catalogue, user, shipping } = clients;

  r.get('/admin/api/reports/dashboard', auth, async c =>
    proxy(async () => {
      const token = tok(c);
      const [engineStats, pendingInvoices, pendingFulfilments] = await Promise.all([
        auction.get<{ data: { activeAuctions: number; endingSoon: number } }>('/api/reports/dashboard', token)
          .then(res => res.data).catch(() => null),
        countOrNull(() => payment.get('/api/payments/reports/pending-count', token) as Promise<{ data: { count: number } }>),
        countOrNull(() => shipping.get('/api/shipping/fulfilments/pending-count', token) as Promise<{ data: { count: number } }>),
      ]);
      return {
        data: {
          activeAuctions: engineStats?.activeAuctions ?? null,
          endingSoon: engineStats?.endingSoon ?? null,
          pendingInvoices,
          pendingFulfilments,
        },
      };
    }, c));

  r.get('/admin/api/reports/auction-results', auth, async c =>
    proxy(async () => {
      const token = tok(c);
      const query = new URLSearchParams(c.req.query() as Record<string, string>);
      const res = await auction.get<{ data: AuctionResultRow[] }>(`/api/reports/results?${query}`, token);
      const categoryNames = await fetchCategoryNameMap(catalogue, token);

      const rows = await Promise.all(res.data.map(async row => {
        const [lot, winnerEmail] = await Promise.all([
          fetchLotSummary(catalogue, row.lotId, token),
          row.winnerUserId ? fetchUserEmail(user, row.winnerUserId, token) : Promise.resolve(null),
        ]);
        return {
          lotTitle: lot.title,
          categoryName: lot.categoryId ? categoryNames.get(lot.categoryId) ?? null : null,
          finalBid: row.finalBid,
          reserveMet: row.reserveMet,
          winnerEmail,
        };
      }));

      const totalLots = rows.length;
      const soldCount = rows.filter(row => row.reserveMet).length;
      const summary = {
        totalLots,
        soldPercent: totalLots === 0 ? 0 : Math.round((soldCount / totalLots) * 100),
        totalValue: rows.reduce((sum, row) => sum + (row.reserveMet ? row.finalBid ?? 0 : 0), 0),
      };
      return { data: { rows, summary } };
    }, c));

  r.get('/admin/api/reports/revenue', auth, async c =>
    proxy(() => payment.get('/api/payments/reports/revenue', tok(c)), c));

  r.get('/admin/api/reports/unsold', auth, async c =>
    proxy(async () => {
      const token = tok(c);
      const res = await auction.get<{ data: UnsoldRow[] }>('/api/reports/unsold', token);
      const categoryNames = await fetchCategoryNameMap(catalogue, token);

      const rows = await Promise.all(res.data.map(async row => {
        const lot = await fetchLotSummary(catalogue, row.lotId, token);
        return {
          id: row.lotId,
          title: lot.title,
          categoryName: lot.categoryId ? categoryNames.get(lot.categoryId) ?? null : null,
          highestBid: row.highestBid,
        };
      }));
      return { data: rows };
    }, c));

  return r;
}
