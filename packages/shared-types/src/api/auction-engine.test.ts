import { describe, expect, it } from 'vitest';
import {
  accountBidsQuery,
  accountBidsResponseSchema,
  accountStatsResponseSchema,
  auctionsListQuery,
  auctionLotStatusSchema,
  bidHistoryQuery,
  bidListResponseSchema,
  lotStatusListResponseSchema,
  placeBidResponseSchema,
} from './auction-engine';

describe('auction-engine contract schemas', () => {
  it('parses a lot status with a null highest bid (no bids yet)', () => {
    const status = auctionLotStatusSchema.parse({
      lotId: 'lot-1', status: 'LIVE', currentHighestBid: null, bidCount: 0,
      endAt: '2026-07-12T10:00:00.000Z',
    });
    expect(status.currentHighestBid).toBeNull();
  });

  it('parses the list envelope with page/total meta', () => {
    const body = lotStatusListResponseSchema.parse({
      data: [{ lotId: 'lot-1', status: 'CLOSING', currentHighestBid: 120, bidCount: 3, endAt: '2026-07-12T10:00:00.000Z' }],
      meta: { page: 1, total: 1 },
    });
    expect(body.meta.total).toBe(1);
  });

  it('parses bid history where userId is present only for admin callers', () => {
    const body = bidListResponseSchema.parse({
      data: [
        { id: 'b1', amount: 120, placedAt: '2026-07-11T09:00:00.000Z' },
        { id: 'b2', userId: 'u1', amount: 110, placedAt: '2026-07-11T08:00:00.000Z' },
      ],
      meta: { page: 1, total: 2 },
    });
    expect(body.data[0].userId).toBeUndefined();
  });

  it('parses a 201 place-bid response', () => {
    expect(placeBidResponseSchema.parse({ data: { bidId: 'b1', amount: 130, lotId: 'lot-1' } }).data.amount).toBe(130);
  });

  it('parses an account bids response with a null current highest bid', () => {
    const body = accountBidsResponseSchema.parse({
      data: [{
        lotId: 'lot-1', amount: 100, placedAt: '2026-07-11T09:00:00.000Z',
        isWinning: false, currentHighestBid: null, status: 'LIVE', endAt: '2026-07-12T10:00:00.000Z',
      }],
      meta: { page: 1, total: 1 },
    });
    expect(body.data[0].currentHighestBid).toBeNull();
  });

  it('parses an account stats response', () => {
    const body = accountStatsResponseSchema.parse({
      data: { totalBids: 5, activeBids: 2, leadingBids: 1, lotsWon: 3 },
    });
    expect(body.data.lotsWon).toBe(3);
  });
});

describe('query builders', () => {
  it('auctionsListQuery emits exactly page and pageSize', () => {
    expect(auctionsListQuery({ page: 2, pageSize: 50 }).toString()).toBe('page=2&pageSize=50');
  });

  it('bidHistoryQuery omits absent params', () => {
    expect(bidHistoryQuery({}).toString()).toBe('');
  });

  it('accountBidsQuery emits exactly page and pageSize', () => {
    expect(accountBidsQuery({ page: 1, pageSize: 5 }).toString()).toBe('page=1&pageSize=5');
  });
});
