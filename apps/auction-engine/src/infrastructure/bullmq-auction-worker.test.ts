import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Worker } from 'bullmq';
import { BullMQAuctionWorker } from './bullmq-auction-worker';
import { StartAuctionCommandHandler } from '../application/start-auction-handler';
import { CloseAuctionCommandHandler } from '../application/close-auction-handler';
import { AuctionEventPublisher } from '../application/auction-event-publisher';
import { SseBroadcaster } from '../application/sse-broadcaster';
import { GetLotStatusHandler } from '../application/get-lot-status-handler';

vi.mock('bullmq');

type JobProcessor = (job: { name: string; data: { lotId: string } }) => Promise<void>;

const mockStartHandler = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as StartAuctionCommandHandler;
const mockCloseHandler = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as CloseAuctionCommandHandler;
const mockGetLotStatus = { execute: vi.fn() } as unknown as GetLotStatusHandler;
const mockPublisher: AuctionEventPublisher = {
  publishBidPlaced: vi.fn(),
  publishAuctionClosingSoon: vi.fn().mockResolvedValue(undefined),
  publishAuctionClosed: vi.fn(),
};
const mockBroadcaster: SseBroadcaster = {
  subscribe: vi.fn(),
  broadcast: vi.fn(),
};

const REDIS = { host: 'localhost', port: 6379 };

describe('BullMQAuctionWorker', () => {
  let capturedProcessor: JobProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Worker).mockImplementation((_queueName, processor) => {
      capturedProcessor = processor as JobProcessor;
      return { close: vi.fn() } as unknown as Worker;
    });
  });

  it('should_callStartHandler_when_startAuctionJobProcessed', async () => {
    new BullMQAuctionWorker(REDIS, mockStartHandler, mockCloseHandler, mockGetLotStatus, mockPublisher, mockBroadcaster);

    await capturedProcessor({ name: 'start-auction', data: { lotId: 'lot-1' } });

    expect(mockStartHandler.execute).toHaveBeenCalledWith({ lotId: 'lot-1' });
  });

  it('should_callCloseHandlerAndBroadcastSse_when_closeAuctionJobProcessed', async () => {
    vi.mocked(mockGetLotStatus.execute).mockResolvedValue({
      lotId: 'lot-1',
      status: 'SOLD',
      currentHighestBid: 600,
      bidCount: 3,
      endAt: new Date('2026-06-20T12:00:00Z'),
      winnerUserId: 'user-1',
      updatedAt: new Date(),
    });
    new BullMQAuctionWorker(REDIS, mockStartHandler, mockCloseHandler, mockGetLotStatus, mockPublisher, mockBroadcaster);

    await capturedProcessor({ name: 'close-auction', data: { lotId: 'lot-1' } });

    expect(mockCloseHandler.execute).toHaveBeenCalledWith({ lotId: 'lot-1' });
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      'lot-1',
      'auction_closed',
      expect.objectContaining({ status: 'SOLD', highestBid: 600 }),
    );
  });

  it('should_publishClosingSoonEvent_when_closingSoonJobProcessed', async () => {
    vi.mocked(mockGetLotStatus.execute).mockResolvedValue({
      lotId: 'lot-1',
      status: 'LIVE',
      currentHighestBid: null,
      bidCount: 0,
      endAt: new Date('2026-06-20T12:00:00Z'),
      winnerUserId: null,
      updatedAt: new Date(),
    });
    new BullMQAuctionWorker(REDIS, mockStartHandler, mockCloseHandler, mockGetLotStatus, mockPublisher, mockBroadcaster);

    await capturedProcessor({ name: 'closing-soon', data: { lotId: 'lot-1' } });

    expect(mockPublisher.publishAuctionClosingSoon).toHaveBeenCalledWith({
      lotId: 'lot-1',
      endAt: '2026-06-20T12:00:00.000Z',
    });
  });
});
