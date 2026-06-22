import { describe, it, expect, vi } from 'vitest';
import { InMemorySseBroadcaster } from './in-memory-sse-broadcaster';
import { SseEventData } from '../application/sse-broadcaster';

const fakeData: SseEventData = {
  highestBid: 200,
  bidCount: 1,
  endAt: '2026-06-20T12:00:00Z',
  status: 'LIVE',
};

describe('InMemorySseBroadcaster', () => {
  it('should_callSubscriber_when_eventBroadcast', () => {
    const broadcaster = new InMemorySseBroadcaster();
    const send = vi.fn();
    broadcaster.subscribe('lot-1', send);

    broadcaster.broadcast('lot-1', 'bid_placed', fakeData);

    expect(send).toHaveBeenCalledWith('bid_placed', expect.objectContaining({ highestBid: 200 }));
  });

  it('should_stopNotifying_when_unsubscribed', () => {
    const broadcaster = new InMemorySseBroadcaster();
    const send = vi.fn();
    const unsub = broadcaster.subscribe('lot-1', send);
    unsub();

    broadcaster.broadcast('lot-1', 'bid_placed', fakeData);

    expect(send).not.toHaveBeenCalled();
  });

  it('should_notThrow_when_noSubscribersForLot', () => {
    const broadcaster = new InMemorySseBroadcaster();

    expect(() => broadcaster.broadcast('lot-unknown', 'bid_placed', fakeData)).not.toThrow();
  });
});
