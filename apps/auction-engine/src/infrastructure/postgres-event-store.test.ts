import { describe, it, expect, afterEach } from 'vitest';
import { createDb } from './db';
import { PostgresEventStore } from './postgres-event-store';
import { AuctionDomainEvent } from '../domain/auction-events';

const db = createDb(process.env['TEST_DATABASE_URL'] ?? 'postgres://localhost/carat_auction_test');
const store = new PostgresEventStore(db);

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
  await db`DELETE FROM auction_events WHERE lot_id = 'lot-test-1'`;
});

describe('PostgresEventStore', () => {
  it('should_appendAndLoadEvents_when_eventsAreStored', async () => {
    await store.append('lot-test-1', [SCHEDULED_EVENT], 0);

    const loaded = await store.load('lot-test-1');

    expect(loaded).toHaveLength(1);
    expect(loaded[0].type).toBe('AuctionScheduled');
    expect(loaded[0].sequence).toBe(1);
    expect(loaded[0].lotId).toBe('lot-test-1');
  });

  it('should_assignIncrementalSequences_when_multipleEventsAppended', async () => {
    await store.append('lot-test-1', [SCHEDULED_EVENT], 0);
    await store.append('lot-test-1', [{ type: 'AuctionStarted', payload: {} }], 1);

    const loaded = await store.load('lot-test-1');

    expect(loaded).toHaveLength(2);
    expect(loaded[0].sequence).toBe(1);
    expect(loaded[1].sequence).toBe(2);
    expect(loaded[1].type).toBe('AuctionStarted');
  });

  it('should_returnEmptyArray_when_noEventsExist', async () => {
    const loaded = await store.load('lot-nonexistent');

    expect(loaded).toHaveLength(0);
  });

  it('should_throwOnConcurrentWrite_when_sequenceConflicts', async () => {
    await store.append('lot-test-1', [SCHEDULED_EVENT], 0);

    await expect(store.append('lot-test-1', [SCHEDULED_EVENT], 0)).rejects.toThrow();
  });
});
