import { Hono } from 'hono';
import { AuctionRepository } from '../domain/auction-repository';

interface Deps {
  auctionRepository: Pick<AuctionRepository, 'findById'>;
}

export function buildAuctionRouter(deps: Deps): Hono {
  const router = new Hono();

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
