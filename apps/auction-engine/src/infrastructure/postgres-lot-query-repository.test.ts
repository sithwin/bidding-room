import { describe, it, expect, afterEach } from 'vitest';
import { createDb } from './db';
import { PostgresProjectionHandler } from './postgres-projection-handler';
import { PostgresLotQueryRepository } from './postgres-lot-query-repository';
import { AuctionDomainEvent } from '../domain/auction-events';

const db = createDb(process.env['TEST_DATABASE_URL'] ?? 'postgres://localhost/carat_auction_test');
const projectionHandler = new PostgresProjectionHandler(db);
const queryRepo = new PostgresLotQueryRepository(db);

const LOT_ID = 'lot-query-test-1';
const LOT_ID_2 = 'lot-query-test-2';

const SCHEDULED_EVENT: AuctionDomainEvent = {
  type: 'AuctionScheduled',
  payload: {
    start_at: '2026-06-20T10:00:00Z',
    end_at: '2026-06-20T12:00:00Z',
    reserve_price: 500,
    min_bid_increment: 10,
    auto_extend_window_minutes: 3,
    auto_extend_duration_minutes: 3,
  },
};

afterEach(async () => {
  await db`DELETE FROM bids WHERE lot_id IN (${LOT_ID}, ${LOT_ID_2})`;
  await db`DELETE FROM lot_status WHERE lot_id IN (${LOT_ID}, ${LOT_ID_2})`;
});

describe('PostgresLotQueryRepository', () => {
  it('should_returnLotStatusRow_when_lotExists', async () => {
    await projectionHandler.handle(LOT_ID, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID, [{ type: 'AuctionStarted', payload: {} }]);

    const result = await queryRepo.findLotStatus(LOT_ID);

    expect(result).not.toBeNull();
    expect(result?.lotId).toBe(LOT_ID);
    expect(result?.status).toBe('LIVE');
    expect(result?.bidCount).toBe(0);
    expect(result?.currentHighestBid).toBeNull();
  });

  it('should_returnNull_when_lotDoesNotExist', async () => {
    const result = await queryRepo.findLotStatus('nonexistent-lot-xyz');

    expect(result).toBeNull();
  });

  it('should_returnBidsDescByPlacedAt_when_bidsExist', async () => {
    await projectionHandler.handle(LOT_ID, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID, [
      { type: 'BidPlaced', payload: { bid_id: 'bid-q-1', user_id: 'user-1', amount: 100, placed_at: '2026-06-20T11:00:00Z' } },
      { type: 'BidPlaced', payload: { bid_id: 'bid-q-2', user_id: 'user-2', amount: 200, placed_at: '2026-06-20T11:01:00Z' } },
    ]);

    const result = await queryRepo.findBidHistory(LOT_ID, 10, 0);

    expect(result.total).toBe(2);
    expect(result.bids).toHaveLength(2);
    expect(result.bids[0].amount).toBe(200);
    expect(result.bids[1].amount).toBe(100);
    expect(result.bids[0]).not.toHaveProperty('user_id');
  });

  it('should_includeScheduledAndLiveLots_when_findingActiveLots', async () => {
    await projectionHandler.handle(LOT_ID, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID, [{ type: 'AuctionStarted', payload: {} }]);
    await projectionHandler.handle(LOT_ID_2, [SCHEDULED_EVENT]);

    const result = await queryRepo.findActiveLots(100, 0);

    const lotIds = result.lots.map(l => l.lotId);
    expect(lotIds).toContain(LOT_ID);
    expect(lotIds).toContain(LOT_ID_2);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });
});
