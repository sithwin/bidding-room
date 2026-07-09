import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authMiddleware, verifyJwt } from '@carat-room/shared-auth';
import { auctionResultsResponseSchema, unsoldLotsResponseSchema } from '@carat-room/shared-types';
import { GetActiveLotsHandler } from '../application/get-active-lots-handler';
import { GetLotStatusHandler } from '../application/get-lot-status-handler';
import { GetBidHistoryHandler } from '../application/get-bid-history-handler';
import { GetDashboardStatsHandler } from '../application/get-dashboard-stats-handler';
import { GetAuctionResultsHandler } from '../application/get-auction-results-handler';
import { GetUnsoldLotsHandler } from '../application/get-unsold-lots-handler';
import { PlaceBidCommandHandler } from '../application/place-bid-handler';
import { ScheduleAuctionCommandHandler } from '../application/schedule-auction-handler';
import { SseBroadcaster } from '../application/sse-broadcaster';
import { LotStatusRow } from '../application/lot-query-repository';
import { createAuctionRouter } from './auction-router';

const jwtPayloadRef = vi.hoisted(() => ({
  value: { userId: 'user-1', verificationStatus: 'APPROVED_BIDDER', role: 'BUYER', email: 'test@example.com' },
}));

vi.mock('@carat-room/shared-auth', () => ({
  authMiddleware: vi.fn().mockReturnValue(
    async (c: any, next: () => Promise<void>) => {
      c.set('jwtPayload', jwtPayloadRef.value);
      await next();
    },
  ),
  verifyJwt: vi.fn(),
}));

const mockGetActiveLots = { execute: vi.fn() } as unknown as GetActiveLotsHandler;
const mockGetLotStatus = { execute: vi.fn() } as unknown as GetLotStatusHandler;
const mockGetBidHistory = { execute: vi.fn() } as unknown as GetBidHistoryHandler;
const mockGetDashboardStats = { execute: vi.fn() } as unknown as GetDashboardStatsHandler;
const mockGetAuctionResults = { execute: vi.fn() } as unknown as GetAuctionResultsHandler;
const mockGetUnsoldLots = { execute: vi.fn() } as unknown as GetUnsoldLotsHandler;
const mockPlaceBid = { execute: vi.fn() } as unknown as PlaceBidCommandHandler;
const mockScheduleAuction = { execute: vi.fn() } as unknown as ScheduleAuctionCommandHandler;
const mockBroadcaster: SseBroadcaster = { subscribe: vi.fn(), broadcast: vi.fn() };

const router = createAuctionRouter({
  getActiveLots: mockGetActiveLots,
  getLotStatus: mockGetLotStatus,
  getBidHistory: mockGetBidHistory,
  getDashboardStats: mockGetDashboardStats,
  getAuctionResults: mockGetAuctionResults,
  getUnsoldLots: mockGetUnsoldLots,
  placeBidHandler: mockPlaceBid,
  scheduleAuctionHandler: mockScheduleAuction,
  sseBroadcaster: mockBroadcaster,
  jwtPublicKey: 'test-public-key',
});

// authMiddleware(...) is invoked once per route at router-construction time (above), not
// per-request — capture its call args now, before beforeEach's clearAllMocks() wipes them.
const authMiddlewareCallArgs = vi.mocked(authMiddleware).mock.calls.map(call => call);

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
  jwtPayloadRef.value = { userId: 'user-1', verificationStatus: 'APPROVED_BIDDER', role: 'BUYER', email: 'test@example.com' };
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
      bids: [{ id: 'bid-1', userId: 'user-1', amount: 200, placedAt: new Date('2026-06-20T11:00:00Z') }],
      total: 1,
    });

    const res = await router.request('/api/auctions/lot-1/bids');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { amount: number }[]; meta: { total: number } };
    expect(body.data[0].amount).toBe(200);
    expect(body.data[0]).not.toHaveProperty('userId');
    expect(body.meta.total).toBe(1);
  });

  it('should_includeUserId_when_callerHasValidAdminToken', async () => {
    vi.mocked(mockGetBidHistory.execute).mockResolvedValue({
      bids: [{ id: 'bid-1', userId: 'user-1', amount: 200, placedAt: new Date('2026-06-20T11:00:00Z') }],
      total: 1,
    });
    vi.mocked(verifyJwt).mockResolvedValue({
      userId: 'admin-1',
      email: 'admin@example.com',
      verificationStatus: 'APPROVED_BIDDER',
      role: 'ADMIN',
    });

    const res = await router.request('/api/auctions/lot-1/bids', {
      headers: { Authorization: 'Bearer admin-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { userId?: string }[] };
    expect(body.data[0].userId).toBe('user-1');
  });

  it('should_excludeUserId_when_callerTokenIsNotAdmin', async () => {
    vi.mocked(mockGetBidHistory.execute).mockResolvedValue({
      bids: [{ id: 'bid-1', userId: 'user-1', amount: 200, placedAt: new Date('2026-06-20T11:00:00Z') }],
      total: 1,
    });
    vi.mocked(verifyJwt).mockResolvedValue({
      userId: 'buyer-1',
      email: 'buyer@example.com',
      verificationStatus: 'APPROVED_BIDDER',
      role: 'BUYER',
    });

    const res = await router.request('/api/auctions/lot-1/bids', {
      headers: { Authorization: 'Bearer buyer-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { userId?: string }[] };
    expect(body.data[0]).not.toHaveProperty('userId');
  });

  it('should_excludeUserId_when_tokenIsInvalid', async () => {
    vi.mocked(mockGetBidHistory.execute).mockResolvedValue({
      bids: [{ id: 'bid-1', userId: 'user-1', amount: 200, placedAt: new Date('2026-06-20T11:00:00Z') }],
      total: 1,
    });
    vi.mocked(verifyJwt).mockRejectedValue(new Error('invalid token'));

    const res = await router.request('/api/auctions/lot-1/bids', {
      headers: { Authorization: 'Bearer bad-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { userId?: string }[] };
    expect(body.data[0]).not.toHaveProperty('userId');
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
    jwtPayloadRef.value = { userId: 'user-1', verificationStatus: 'EMAIL_VERIFIED', role: 'BUYER', email: 'test@example.com' };

    const res = await router.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ amount: 300 }),
    });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/reports/results', () => {
  it('should_return200WithParsedDates_when_fromAndToAreValid', async () => {
    vi.mocked(mockGetAuctionResults.execute).mockResolvedValue([
      { lotId: 'lot-1', finalBid: 600, reserveMet: true, winnerUserId: 'user-1', closedAt: new Date('2026-06-15T10:00:00Z') },
    ]);

    const res = await router.request('/api/reports/results?from=2026-06-01&to=2026-07-01');

    expect(res.status).toBe(200);
    const body = auctionResultsResponseSchema.parse(await res.json());
    expect(body.data).toHaveLength(1);
    expect(body.data[0].lotId).toBe('lot-1');
    expect(body.data[0].closedAt).toBe('2026-06-15T10:00:00.000Z');

    const [from, to] = vi.mocked(mockGetAuctionResults.execute).mock.calls[0];
    expect(from).toBeInstanceOf(Date);
    expect(to).toBeInstanceOf(Date);
    expect(from.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    // 'to' is date-only from the UI; the route extends it to the end of that day
    expect(to.toISOString()).toBe('2026-07-01T23:59:59.999Z');
  });

  it('should_return400_when_fromIsMissing', async () => {
    const res = await router.request('/api/reports/results?to=2026-07-01');

    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockGetAuctionResults.execute).not.toHaveBeenCalled();
  });

  it('should_return400_when_toIsInvalid', async () => {
    const res = await router.request('/api/reports/results?from=2026-06-01&to=not-a-date');

    expect(res.status).toBe(400);
    expect(mockGetAuctionResults.execute).not.toHaveBeenCalled();
  });

  it('should_beRegisteredWithAdminOnlyAuth', () => {
    expect(authMiddlewareCallArgs).toContainEqual(['test-public-key', { adminOnly: true }]);
  });
});

describe('GET /api/reports/unsold', () => {
  it('should_return200WithUnsoldLots', async () => {
    vi.mocked(mockGetUnsoldLots.execute).mockResolvedValue([{ lotId: 'lot-2', highestBid: 150 }]);

    const res = await router.request('/api/reports/unsold');

    expect(res.status).toBe(200);
    const body = unsoldLotsResponseSchema.parse(await res.json());
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toEqual({ lotId: 'lot-2', highestBid: 150 });
  });

  it('should_beRegisteredWithAdminOnlyAuth', () => {
    // Every reports route (dashboard, results, unsold) shares this adminOnly wiring;
    // this asserts the wiring exists at least once rather than distinguishing per-route,
    // since the mocked authMiddleware records only its construction-time call args.
    expect(authMiddlewareCallArgs).toContainEqual(['test-public-key', { adminOnly: true }]);
  });
});
