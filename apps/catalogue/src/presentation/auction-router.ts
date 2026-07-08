import { Hono } from 'hono';
import { AuctionStatus } from '../domain/auction';
import { AuctionRepository } from '../domain/auction-repository';

interface Deps {
  auctionRepository: Pick<AuctionRepository, 'findById' | 'findAll'>;
}

const VALID_STATUSES = new Set<string>(['upcoming', 'open', 'closed']);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function buildAuctionRouter(deps: Deps): Hono {
  const router = new Hono();

  router.get('/api/auctions', async c => {
    const statusParam = c.req.query('status');
    const status = statusParam && VALID_STATUSES.has(statusParam)
      ? (statusParam as AuctionStatus)
      : undefined;
    const limit = Math.min(Number(c.req.query('limit') ?? DEFAULT_LIMIT), MAX_LIMIT);

    const results = await deps.auctionRepository.findAll(status, limit);
    return c.json({
      data: results.map(({ auction, lotCount }) => ({
        id: auction.id,
        title: auction.title,
        saleDate: auction.saleDate,
        location: auction.location,
        viewingDates: auction.viewingDates,
        status: auction.status,
        lotCount,
      })),
    });
  });

  router.get('/api/auctions/:id', async c => {
    const auction = await deps.auctionRepository.findById(c.req.param('id'));
    if (!auction) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Auction not found' } }, 404);
    }
    return c.json({
      data: {
        id: auction.id,
        title: auction.title,
        saleDate: auction.saleDate,
        location: auction.location,
        viewingDates: auction.viewingDates,
        status: auction.status,
        createdAt: auction.createdAt,
        updatedAt: auction.updatedAt,
      },
    });
  });

  return router;
}
