import { describe, it, expect, afterEach } from 'vitest';
import { createDb } from './db';
import { PostgresProjectionHandler } from './postgres-projection-handler';
import { AuctionDomainEvent } from '../domain/auction-events';

const db = createDb(process.env['TEST_DATABASE_URL'] ?? 'postgres://localhost/carat_auction_test');
const handler = new PostgresProjectionHandler(db);

const BASE_SCHEDULED: AuctionDomainEvent = {
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
  await db`DELETE FROM bids WHERE lot_id = 'lot-proj-1'`;
  await db`DELETE FROM lot_status WHERE lot_id = 'lot-proj-1'`;
});

describe('PostgresProjectionHandler', () => {
  it('should_createLotStatusRow_when_auctionScheduled', async () => {
    await handler.handle('lot-proj-1', [BASE_SCHEDULED]);

    const rows = await db`SELECT status, bid_count FROM lot_status WHERE lot_id = 'lot-proj-1'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('SCHEDULED');
    expect(rows[0].bid_count).toBe(0);
  });

  it('should_updateStatusToLive_when_auctionStarted', async () => {
    await handler.handle('lot-proj-1', [BASE_SCHEDULED]);
    await handler.handle('lot-proj-1', [{ type: 'AuctionStarted', payload: {} }]);

    const rows = await db`SELECT status FROM lot_status WHERE lot_id = 'lot-proj-1'`;
    expect(rows[0].status).toBe('LIVE');
  });

  it('should_updateHighestBidAndInsertBidRow_when_bidPlaced', async () => {
    await handler.handle('lot-proj-1', [BASE_SCHEDULED]);
    await handler.handle('lot-proj-1', [
      { type: 'BidPlaced', payload: { bid_id: 'bid-1', user_id: 'user-1', amount: 200, placed_at: '2026-06-20T11:00:00Z' } },
    ]);

    const status = await db`SELECT current_highest_bid, bid_count FROM lot_status WHERE lot_id = 'lot-proj-1'`;
    expect(Number(status[0].current_highest_bid)).toBe(200);
    expect(status[0].bid_count).toBe(1);

    const bids = await db`SELECT id FROM bids WHERE lot_id = 'lot-proj-1'`;
    expect(bids).toHaveLength(1);
    expect(bids[0].id).toBe('bid-1');
  });

  it('should_updateEndAtAndSetClosing_when_timerExtended', async () => {
    await handler.handle('lot-proj-1', [BASE_SCHEDULED]);
    await handler.handle('lot-proj-1', [
      { type: 'TimerExtended', payload: { new_end_at: '2026-06-20T12:05:00Z', extended_by_minutes: 3 } },
    ]);

    const rows = await db`SELECT end_at, status FROM lot_status WHERE lot_id = 'lot-proj-1'`;
    expect(rows[0].status).toBe('CLOSING');
    expect(new Date(rows[0].end_at).toISOString()).toBe('2026-06-20T12:05:00.000Z');
  });

  it('should_updateStatusToSoldWithWinner_when_auctionClosedWithReserveMet', async () => {
    await handler.handle('lot-proj-1', [BASE_SCHEDULED]);
    await handler.handle('lot-proj-1', [
      { type: 'AuctionClosed', payload: { highest_bid_id: 'bid-1', highest_amount: 600, reserve_met: true, winner_user_id: 'user-1' } },
    ]);

    const rows = await db`SELECT status, winner_user_id FROM lot_status WHERE lot_id = 'lot-proj-1'`;
    expect(rows[0].status).toBe('SOLD');
    expect(rows[0].winner_user_id).toBe('user-1');
  });
});
