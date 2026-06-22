import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authMiddleware } from '@carat-room/shared-auth';
import { GetActiveLotsHandler } from '../application/get-active-lots-handler';
import { GetLotStatusHandler } from '../application/get-lot-status-handler';
import { GetBidHistoryHandler } from '../application/get-bid-history-handler';
import { PlaceBidCommandHandler } from '../application/place-bid-handler';
import { SseBroadcaster } from '../application/sse-broadcaster';
import { LotStatusRow } from '../application/lot-query-repository';
import { createAuctionRouter } from './auction-router';

vi.mock('@carat-room/shared-auth', () => ({
  authMiddleware: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { sub: 'user-1', status: 'APPROVED_BIDDER', role: 'BUYER' });
    await next();
  }),
}));

const mockGetActiveLots = { execute: vi.fn() } as unknown as GetActiveLotsHandler;
const mockGetLotStatus = { execute: vi.fn() } as unknown as GetLotStatusHandler;
const mockGetBidHistory = { execute: vi.fn() } as unknown as GetBidHistoryHandler;
const mockPlaceBid = { execute: vi.fn() } as unknown as PlaceBidCommandHandler;
const mockBroadcaster: SseBroadcaster = { subscribe: vi.fn(), broadcast: vi.fn() };

const router = createAuctionRouter({
  getActiveLots: mockGetActiveLots,
  getLotStatus: mockGetLotStatus,
  getBidHistory: mockGetBidHistory,
  placeBidHandler: mockPlaceBid,
  sseBroadcaster: mockBroadcaster,
});

function fakeLotStatusRow(overrides: Partial<LotStatusRow> = {}): LotStatusRow {
  return {
    lotId: 'lot-1',
    status: 'LIVE',
    currentHighestBid: 200,
    bidCount: 3,
    endAt: new Date('2026-06-20T12:00:00Z'),
    winnerUserId: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/auctions', () => {
  it('should_return200WithActiveLots_when_lotsExist', async () => {
    vi.mocked(mockGetActiveLots.execute).mockResolvedValue({ lots: [fakeLotStatusRow()], total: 1 });

    const res = await router.request('/api/auctions');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; meta: { total: number } };
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
  });
});

describe('GET /api/auctions/:lotId', () => {
  it('should_return200WithLotStatus_when_lotExists', async () => {
    vi.mocked(mockGetLotStatus.execute).mockResolvedValue(fakeLotStatusRow());

    const res = await router.request('/api/auctions/lot-1');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { lotId: string; status: string } };
    expect(body.data.lotId).toBe('lot-1');
    expect(body.data.status).toBe('LIVE');
  });

  it('should_return404_when_lotNotFound', async () => {
    vi.mocked(mockGetLotStatus.execute).mockResolvedValue(null);

    const res = await router.request('/api/auctions/unknown-lot');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/auctions/:lotId/bids', () => {
  it('should_return200WithBidHistory_when_bidsExist', async () => {
    vi.mocked(mockGetBidHistory.execute).mockResolvedValue({
      bids: [{ id: 'bid-1', amount: 200, placedAt: new Date('2026-06-20T11:00:00Z') }],
      total: 1,
    });

    const res = await router.request('/api/auctions/lot-1/bids');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { amount: number }[]; meta: { total: number } };
    expect(body.data[0].amount).toBe(200);
    expect(body.data[0]).not.toHaveProperty('userId');
    expect(body.meta.total).toBe(1);
  });
});

describe('POST /api/auctions/:lotId/bids', () => {
  it('should_return201WithBidId_when_bidAccepted', async () => {
    vi.mocked(mockPlaceBid.execute).mockResolvedValue({ success: true, timerExtended: false });
    vi.mocked(mockGetLotStatus.execute).mockResolvedValue(fakeLotStatusRow());

    const res = await router.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ amount: 300 }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: { bidId: string; amount: number; lotId: string } };
    expect(body.data.amount).toBe(300);
    expect(body.data.lotId).toBe('lot-1');
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith('lot-1', 'bid_placed', expect.any(Object));
  });

  it('should_return422_when_bidTooLow', async () => {
    vi.mocked(mockPlaceBid.execute).mockResolvedValue({ success: false, reason: 'BID_TOO_LOW' });

    const res = await router.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ amount: 1 }),
    });

    expect(res.status).toBe(422);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('BID_TOO_LOW');
  });

  it('should_return409_when_auctionNotActive', async () => {
    vi.mocked(mockPlaceBid.execute).mockResolvedValue({ success: false, reason: 'AUCTION_NOT_ACTIVE' });

    const res = await router.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ amount: 300 }),
    });

    expect(res.status).toBe(409);
  });

  it('should_broadcastTimerExtended_when_bidTriggersExtension', async () => {
    vi.mocked(mockPlaceBid.execute).mockResolvedValue({
      success: true,
      timerExtended: true,
      newEndAt: new Date('2026-06-20T12:05:00Z'),
    });
    vi.mocked(mockGetLotStatus.execute).mockResolvedValue(
      fakeLotStatusRow({ status: 'CLOSING', endAt: new Date('2026-06-20T12:05:00Z') }),
    );

    await router.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ amount: 300 }),
    });

    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith('lot-1', 'bid_placed', expect.any(Object));
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith('lot-1', 'timer_extended', expect.any(Object));
  });

  it('should_return400_when_amountIsNotPositive', async () => {
    const res = await router.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ amount: -5 }),
    });

    expect(res.status).toBe(400);
    expect(mockPlaceBid.execute).not.toHaveBeenCalled();
  });

  it('should_return403_when_userNotApprovedBidder', async () => {
    vi.mocked(authMiddleware).mockImplementationOnce(
      async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
        c.set('user', { sub: 'user-1', status: 'EMAIL_VERIFIED', role: 'BUYER' });
        await next();
      },
    );

    const res = await router.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ amount: 300 }),
    });

    expect(res.status).toBe(403);
  });
});
