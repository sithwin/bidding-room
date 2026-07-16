import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LotQueryRepository, LotStatusRow, BidRow, UserBidRow, UserStats } from './lot-query-repository';
import { GetLotStatusHandler } from './get-lot-status-handler';
import { GetBidHistoryHandler } from './get-bid-history-handler';
import { GetActiveLotsHandler } from './get-active-lots-handler';
import { GetAccountBidsHandler } from './get-account-bids-handler';
import { GetAccountStatsHandler } from './get-account-stats-handler';

const mockRepo: LotQueryRepository = {
  findLotStatus: vi.fn(),
  findBidHistory: vi.fn(),
  findActiveLots: vi.fn(),
  getDashboardStats: vi.fn(),
  findClosedResults: vi.fn(),
  findUnsoldLots: vi.fn(),
  findBidderIds: vi.fn(),
  findBidsByUser: vi.fn(),
  getUserStats: vi.fn(),
};

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

describe('GetLotStatusHandler', () => {
  it('should_returnLotStatus_when_lotExists', async () => {
    const expected = fakeLotStatusRow();
    vi.mocked(mockRepo.findLotStatus).mockResolvedValue(expected);
    const handler = new GetLotStatusHandler(mockRepo);

    const result = await handler.execute('lot-1');

    expect(result).toEqual(expected);
    expect(mockRepo.findLotStatus).toHaveBeenCalledWith('lot-1');
  });

  it('should_returnNull_when_lotNotFound', async () => {
    vi.mocked(mockRepo.findLotStatus).mockResolvedValue(null);
    const handler = new GetLotStatusHandler(mockRepo);

    const result = await handler.execute('nonexistent');

    expect(result).toBeNull();
  });
});

describe('GetBidHistoryHandler', () => {
  it('should_calculateOffsetFromPage_when_executing', async () => {
    const fakeBids: BidRow[] = [{ id: 'bid-1', userId: 'user-1', amount: 200, placedAt: new Date() }];
    vi.mocked(mockRepo.findBidHistory).mockResolvedValue({ bids: fakeBids, total: 1 });
    const handler = new GetBidHistoryHandler(mockRepo);

    const result = await handler.execute({ lotId: 'lot-1', page: 2, pageSize: 10 });

    expect(result.bids).toHaveLength(1);
    expect(mockRepo.findBidHistory).toHaveBeenCalledWith('lot-1', 10, 10);
  });
});

describe('GetActiveLotsHandler', () => {
  it('should_calculateOffsetFromPage_when_executing', async () => {
    vi.mocked(mockRepo.findActiveLots).mockResolvedValue({ lots: [], total: 0 });
    const handler = new GetActiveLotsHandler(mockRepo);

    await handler.execute({ page: 3, pageSize: 20 });

    expect(mockRepo.findActiveLots).toHaveBeenCalledWith(20, 40);
  });
});

describe('GetAccountBidsHandler', () => {
  it('should_calculateOffsetFromPage_when_executing', async () => {
    const fakeBid: UserBidRow = {
      lotId: 'lot-1', amount: 200, placedAt: new Date(), isWinning: true,
      currentHighestBid: 200, status: 'LIVE', endAt: new Date('2026-06-20T12:00:00Z'),
    };
    vi.mocked(mockRepo.findBidsByUser).mockResolvedValue({ bids: [fakeBid], total: 1 });
    const handler = new GetAccountBidsHandler(mockRepo);

    const result = await handler.execute({ userId: 'user-1', page: 2, pageSize: 10 });

    expect(result.bids).toHaveLength(1);
    expect(mockRepo.findBidsByUser).toHaveBeenCalledWith('user-1', 10, 10);
  });
});

describe('GetAccountStatsHandler', () => {
  it('should_delegateToRepository_when_executing', async () => {
    const fakeStats: UserStats = { totalBids: 5, activeBids: 2, leadingBids: 1, lotsWon: 3 };
    vi.mocked(mockRepo.getUserStats).mockResolvedValue(fakeStats);
    const handler = new GetAccountStatsHandler(mockRepo);

    const result = await handler.execute('user-1');

    expect(result).toEqual(fakeStats);
    expect(mockRepo.getUserStats).toHaveBeenCalledWith('user-1');
  });
});
