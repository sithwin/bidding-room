import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '@carat-room/shared-auth';
import type { JwtPayload } from '@carat-room/shared-auth';
import { GetActiveLotsHandler } from '../application/get-active-lots-handler';
import { GetLotStatusHandler } from '../application/get-lot-status-handler';
import { GetBidHistoryHandler } from '../application/get-bid-history-handler';
import { PlaceBidCommandHandler } from '../application/place-bid-handler';
import { ScheduleAuctionCommandHandler } from '../application/schedule-auction-handler';
import { SseBroadcaster } from '../application/sse-broadcaster';
import { LotStatusRow } from '../application/lot-query-repository';

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

export interface AuctionRouterDeps {
  getActiveLots: GetActiveLotsHandler;
  getLotStatus: GetLotStatusHandler;
  getBidHistory: GetBidHistoryHandler;
  placeBidHandler: PlaceBidCommandHandler;
  scheduleAuctionHandler: ScheduleAuctionCommandHandler;
  sseBroadcaster: SseBroadcaster;
  jwtPublicKey: string;
}

export function createAuctionRouter(deps: AuctionRouterDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/health', (c) => c.json({ status: 'ok', service: 'auction-engine' }));

  app.get('/api/auctions', async (c) => {
    const page = Math.max(1, Number(c.req.query('page') ?? '1'));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? '20')));
    const result = await deps.getActiveLots.execute({ page, pageSize });
    return c.json({
      data: result.lots.map(serializeLotStatus),
      meta: { page, total: result.total },
    });
  });

  app.get('/api/auctions/:lotId', async (c) => {
    const lotId = c.req.param('lotId');
    const status = await deps.getLotStatus.execute(lotId);
    if (!status) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Lot not found' } }, 404);
    }
    return c.json({ data: serializeLotStatus(status) });
  });

  app.get('/api/auctions/:lotId/bids', async (c) => {
    const lotId = c.req.param('lotId');
    const page = Math.max(1, Number(c.req.query('page') ?? '1'));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? '20')));
    const result = await deps.getBidHistory.execute({ lotId, page, pageSize });
    return c.json({
      data: result.bids.map(b => ({
        id: b.id,
        amount: b.amount,
        placedAt: b.placedAt.toISOString(),
      })),
      meta: { page, total: result.total },
    });
  });

  app.get('/api/auctions/:lotId/stream', (c) => {
    const lotId = c.req.param('lotId');
    return streamSSE(c, async (stream) => {
      const unsub = deps.sseBroadcaster.subscribe(lotId, (event, data) => {
        void stream.writeSSE({ event, data: JSON.stringify(data) });
      });
      stream.onAbort(unsub);
      try {
        while (true) {
          await stream.writeSSE({ event: 'ping', data: '' });
          await stream.sleep(30_000);
        }
      } finally {
        unsub();
      }
    });
  });

  app.post('/api/auctions', authMiddleware(deps.jwtPublicKey, { adminOnly: true }), async (c) => {
    const body = await c.req.json<{
      lotId?: string;
      startAt?: string;
      endAt?: string;
      reservePrice?: number;
      minBidIncrement?: number;
      autoExtendWindowMinutes?: number;
      autoExtendDurationMinutes?: number;
    }>();

    if (!body.lotId || !body.startAt || !body.endAt) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'lotId, startAt and endAt are required' } },
        400,
      );
    }

    await deps.scheduleAuctionHandler.execute({
      lotId: body.lotId,
      startAt: new Date(body.startAt),
      endAt: new Date(body.endAt),
      reservePrice: body.reservePrice ?? 0,
      minBidIncrement: body.minBidIncrement ?? 1,
      autoExtendWindowMinutes: body.autoExtendWindowMinutes ?? 5,
      autoExtendDurationMinutes: body.autoExtendDurationMinutes ?? 5,
    });

    return c.json({ data: { lotId: body.lotId } }, 201);
  });

  app.post('/api/auctions/:lotId/bids', authMiddleware(deps.jwtPublicKey), async (c) => {
    const jwtPayload = c.get('jwtPayload');
    if (jwtPayload.verificationStatus !== 'APPROVED_BIDDER') {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Phone verification required to bid' } },
        403,
      );
    }

    const lotId = c.req.param('lotId');
    const body = await c.req.json<{ amount: unknown }>();
    const amount = Number(body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return c.json(
        { error: { code: 'INVALID_AMOUNT', message: 'Amount must be a positive number' } },
        400,
      );
    }

    const bidId = uuidv4();
    const result = await deps.placeBidHandler.execute({
      lotId,
      bidId,
      userId: jwtPayload.userId,
      amount,
      placedAt: new Date(),
    });

    if (!result.success) {
      const statusCode = result.reason === 'AUCTION_NOT_ACTIVE' ? 409 : 422;
      return c.json({ error: { code: result.reason, message: result.reason } }, statusCode);
    }

    const latestStatus = await deps.getLotStatus.execute(lotId);
    if (latestStatus) {
      const sseData = {
        highestBid: latestStatus.currentHighestBid,
        bidCount: latestStatus.bidCount,
        endAt: latestStatus.endAt.toISOString(),
        status: latestStatus.status,
      };
      deps.sseBroadcaster.broadcast(lotId, 'bid_placed', sseData);
      if (result.timerExtended) {
        deps.sseBroadcaster.broadcast(lotId, 'timer_extended', sseData);
      }
    }

    return c.json({ data: { bidId, amount, lotId } }, 201);
  });

  return app;
}

function serializeLotStatus(row: LotStatusRow) {
  return {
    lotId: row.lotId,
    status: row.status,
    currentHighestBid: row.currentHighestBid,
    bidCount: row.bidCount,
    endAt: row.endAt.toISOString(),
  };
}
