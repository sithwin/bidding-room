import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createTestDb } from '@carat-room/test-db';
import { Db } from './db';
import { PostgresProjectionHandler } from './postgres-projection-handler';
import { PostgresLotQueryRepository } from './postgres-lot-query-repository';
import { AuctionDomainEvent } from '../domain/auction-events';

const TEST_DB_URL = process.env['TEST_DATABASE_URL'] ?? 'postgres://localhost/carat_auction_test';
const db = createTestDb(TEST_DB_URL) as Db;
const projectionHandler = new PostgresProjectionHandler(db);
const queryRepo = new PostgresLotQueryRepository(db);

afterAll(async () => {
  await db.end();
});

const LOT_ID = 'lot-query-test-1';
const LOT_ID_2 = 'lot-query-test-2';
const LOT_ID_3 = 'lot-query-test-3';
const LOT_ID_4 = 'lot-query-test-4';

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

const ALL_LOT_IDS = [LOT_ID, LOT_ID_2, LOT_ID_3, LOT_ID_4];

afterEach(async () => {
  await db`DELETE FROM bids WHERE lot_id = ANY(${ALL_LOT_IDS})`;
  await db`DELETE FROM lot_status WHERE lot_id = ANY(${ALL_LOT_IDS})`;
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
    expect(result.bids[0].userId).toBe('user-2');
    expect(result.bids[1].userId).toBe('user-1');
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

  it('should_returnOnlySoldAndUnsoldWithinRange_when_findingClosedResults', async () => {
    // LOT_ID: closed SOLD, reserve met, has a winner
    await projectionHandler.handle(LOT_ID, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID, [
      { type: 'BidPlaced', payload: { bid_id: 'bid-r-1', user_id: 'user-1', amount: 600, placed_at: '2026-06-20T11:00:00Z' } },
      {
        type: 'AuctionClosed',
        payload: { highest_bid_id: 'bid-r-1', highest_amount: 600, reserve_met: true, winner_user_id: 'user-1' },
      },
    ]);

    // LOT_ID_2: closed UNSOLD, reserve not met, no winner
    await projectionHandler.handle(LOT_ID_2, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID_2, [
      { type: 'AuctionClosed', payload: { highest_bid_id: null, highest_amount: 0, reserve_met: false, winner_user_id: null } },
    ]);

    // LOT_ID_3: still LIVE — must be excluded from closed results
    await projectionHandler.handle(LOT_ID_3, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID_3, [{ type: 'AuctionStarted', payload: {} }]);

    // LOT_ID_4: closed SOLD, but outside the queried date range — must be excluded
    await projectionHandler.handle(LOT_ID_4, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID_4, [
      { type: 'AuctionClosed', payload: { highest_bid_id: null, highest_amount: 700, reserve_met: true, winner_user_id: 'user-2' } },
    ]);
    await db`UPDATE lot_status SET updated_at = '2020-01-01T00:00:00Z' WHERE lot_id = ${LOT_ID_4}`;

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = await queryRepo.findClosedResults(from, to);

    const lotIds = result.map(r => r.lotId);
    expect(lotIds).toContain(LOT_ID);
    expect(lotIds).toContain(LOT_ID_2);
    expect(lotIds).not.toContain(LOT_ID_3);
    expect(lotIds).not.toContain(LOT_ID_4);

    const soldRow = result.find(r => r.lotId === LOT_ID);
    expect(soldRow?.reserveMet).toBe(true);
    expect(soldRow?.finalBid).toBe(600);
    expect(soldRow?.winnerUserId).toBe('user-1');

    const unsoldRow = result.find(r => r.lotId === LOT_ID_2);
    expect(unsoldRow?.reserveMet).toBe(false);
    expect(unsoldRow?.winnerUserId).toBeNull();
  });

  it('should_includeBoundaryTimestamps_when_findingClosedResults', async () => {
    // LOT_ID: closed SOLD with updated_at exactly equal to `from` — must be included (>=)
    await projectionHandler.handle(LOT_ID, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID, [
      { type: 'BidPlaced', payload: { bid_id: 'bid-b-1', user_id: 'user-1', amount: 600, placed_at: '2026-06-20T11:00:00Z' } },
      {
        type: 'AuctionClosed',
        payload: { highest_bid_id: 'bid-b-1', highest_amount: 600, reserve_met: true, winner_user_id: 'user-1' },
      },
    ]);

    // LOT_ID_2: closed SOLD with updated_at exactly equal to `to` — must be included (<=)
    await projectionHandler.handle(LOT_ID_2, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID_2, [
      { type: 'BidPlaced', payload: { bid_id: 'bid-b-2', user_id: 'user-2', amount: 700, placed_at: '2026-06-20T11:00:00Z' } },
      {
        type: 'AuctionClosed',
        payload: { highest_bid_id: 'bid-b-2', highest_amount: 700, reserve_met: true, winner_user_id: 'user-2' },
      },
    ]);

    const from = new Date('2026-06-20T09:00:00Z');
    const to = new Date('2026-06-20T15:00:00Z');
    await db`UPDATE lot_status SET updated_at = ${from.toISOString()} WHERE lot_id = ${LOT_ID}`;
    await db`UPDATE lot_status SET updated_at = ${to.toISOString()} WHERE lot_id = ${LOT_ID_2}`;

    const result = await queryRepo.findClosedResults(from, to);

    const lotIds = result.map(r => r.lotId);
    expect(lotIds).toContain(LOT_ID);
    expect(lotIds).toContain(LOT_ID_2);
  });

  it('should_returnOnlyUnsoldLots_when_findingUnsoldLots', async () => {
    await projectionHandler.handle(LOT_ID, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID, [
      { type: 'AuctionClosed', payload: { highest_bid_id: null, highest_amount: 600, reserve_met: true, winner_user_id: 'user-1' } },
    ]);

    await projectionHandler.handle(LOT_ID_2, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID_2, [
      { type: 'BidPlaced', payload: { bid_id: 'bid-u-1', user_id: 'user-2', amount: 250, placed_at: '2026-06-20T11:00:00Z' } },
      { type: 'AuctionClosed', payload: { highest_bid_id: 'bid-u-1', highest_amount: 250, reserve_met: false, winner_user_id: null } },
    ]);

    await projectionHandler.handle(LOT_ID_3, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID_3, [{ type: 'AuctionStarted', payload: {} }]);

    const result = await queryRepo.findUnsoldLots();

    const lotIds = result.map(r => r.lotId);
    expect(lotIds).toContain(LOT_ID_2);
    expect(lotIds).not.toContain(LOT_ID);
    expect(lotIds).not.toContain(LOT_ID_3);

    const unsoldRow = result.find(r => r.lotId === LOT_ID_2);
    expect(unsoldRow?.highestBid).toBe(250);
  });

  it('should_returnDistinctBidderIds_when_lotHasMultipleBidsFromSameUser', async () => {
    await projectionHandler.handle(LOT_ID, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID, [
      { type: 'BidPlaced', payload: { bid_id: 'bid-d-1', user_id: 'user-1', amount: 100, placed_at: '2026-06-20T11:00:00Z' } },
      { type: 'BidPlaced', payload: { bid_id: 'bid-d-2', user_id: 'user-2', amount: 150, placed_at: '2026-06-20T11:01:00Z' } },
      { type: 'BidPlaced', payload: { bid_id: 'bid-d-3', user_id: 'user-1', amount: 200, placed_at: '2026-06-20T11:02:00Z' } },
    ]);

    const result = await queryRepo.findBidderIds(LOT_ID);

    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining(['user-1', 'user-2']));
  });

  it('should_returnEmptyArray_when_lotHasNoBids', async () => {
    await projectionHandler.handle(LOT_ID, [SCHEDULED_EVENT]);

    const result = await queryRepo.findBidderIds(LOT_ID);

    expect(result).toEqual([]);
  });
});
