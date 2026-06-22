import { describe, it, expect } from 'vitest';
import { AuctionAggregate, LotStatus } from './auction-aggregate';
import { StoredEvent } from './event-store';

function makeScheduledAggregate(): AuctionAggregate {
  const agg = AuctionAggregate.create('lot-1');
  agg.scheduleAuction({
    startAt: new Date('2026-06-20T10:00:00Z'),
    endAt: new Date('2026-06-20T12:00:00Z'),
    reservePrice: 500,
    minBidIncrement: 10,
    autoExtendWindowMinutes: 3,
    autoExtendDurationMinutes: 3,
  });
  return agg;
}

function makeLiveAggregate(): AuctionAggregate {
  const agg = makeScheduledAggregate();
  const stored: StoredEvent[] = agg.uncommittedEvents.map((e, i) => ({
    id: `evt-${i}`,
    lotId: 'lot-1',
    sequence: i + 1,
    type: e.type,
    payload: e.payload,
    occurredAt: new Date(),
  }));
  const live = AuctionAggregate.create('lot-1');
  stored.forEach(e => live.applyStored(e));
  live.startAuction();
  return live;
}

describe('AuctionAggregate', () => {
  it('should_setStatusScheduled_when_auctionScheduled', () => {
    const agg = makeScheduledAggregate();

    expect(agg.status).toBe(LotStatus.Scheduled);
    expect(agg.uncommittedEvents).toHaveLength(1);
    expect(agg.uncommittedEvents[0].type).toBe('AuctionScheduled');
  });

  it('should_setStatusLive_when_auctionStarted', () => {
    const agg = makeLiveAggregate();

    expect(agg.status).toBe(LotStatus.Live);
  });

  it('should_acceptBidAndUpdateHighest_when_bidIsValid', () => {
    const agg = makeLiveAggregate();

    const result = agg.placeBid({
      bidId: 'bid-1',
      userId: 'user-1',
      amount: 100,
      placedAt: new Date('2026-06-20T11:00:00Z'),
    });

    expect(result.success).toBe(true);
    expect(agg.highestBidAmount).toBe(100);
    expect(agg.bidCount).toBe(1);
  });

  it('should_rejectBid_when_amountBelowMinIncrement', () => {
    const agg = makeLiveAggregate();
    agg.placeBid({ bidId: 'bid-1', userId: 'user-1', amount: 100, placedAt: new Date('2026-06-20T11:00:00Z') });

    const result = agg.placeBid({
      bidId: 'bid-2',
      userId: 'user-2',
      amount: 105, // needs >= 100 + 10 = 110
      placedAt: new Date('2026-06-20T11:01:00Z'),
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('BID_TOO_LOW');
  });

  it('should_rejectBid_when_userTriesToOutbidThemself', () => {
    const agg = makeLiveAggregate();
    agg.placeBid({ bidId: 'bid-1', userId: 'user-1', amount: 100, placedAt: new Date('2026-06-20T11:00:00Z') });

    const result = agg.placeBid({
      bidId: 'bid-2',
      userId: 'user-1',
      amount: 200,
      placedAt: new Date('2026-06-20T11:01:00Z'),
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('CANNOT_OUTBID_SELF');
  });

  it('should_extendTimerAndSetClosingStatus_when_bidLandsWithinAutoExtendWindow', () => {
    const agg = makeLiveAggregate();
    // endAt is 12:00, auto-extend window is 3 min — bid at 11:58 is within window
    const result = agg.placeBid({
      bidId: 'bid-1',
      userId: 'user-1',
      amount: 100,
      placedAt: new Date('2026-06-20T11:58:00Z'),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.timerExtended).toBe(true);
      expect(agg.status).toBe(LotStatus.Closing);
    }
  });

  it('should_closeAsSold_when_highestBidMeetsReserve', () => {
    const agg = makeLiveAggregate();
    agg.placeBid({ bidId: 'bid-1', userId: 'user-1', amount: 600, placedAt: new Date('2026-06-20T11:00:00Z') });

    const result = agg.close();

    expect(result.reserveMet).toBe(true);
    expect(result.winnerUserId).toBe('user-1');
    expect(agg.status).toBe(LotStatus.Sold);
  });

  it('should_closeAsUnsold_when_highestBidBelowReserve', () => {
    const agg = makeLiveAggregate();
    agg.placeBid({ bidId: 'bid-1', userId: 'user-1', amount: 400, placedAt: new Date('2026-06-20T11:00:00Z') });

    const result = agg.close();

    expect(result.reserveMet).toBe(false);
    expect(result.winnerUserId).toBeNull();
    expect(agg.status).toBe(LotStatus.Unsold);
  });
});
