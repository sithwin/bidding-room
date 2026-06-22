import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventStore, StoredEvent } from '../domain/event-store';
import { AuctionAggregate } from '../domain/auction-aggregate';
import { ProjectionHandler } from './projection-handler';
import { TimerScheduler } from './timer-scheduler';
import { AuctionEventPublisher } from './auction-event-publisher';
import { RedisLock, PlaceBidCommandHandler } from './place-bid-handler';
import { ScheduleAuctionCommandHandler } from './schedule-auction-handler';
import { StartAuctionCommandHandler } from './start-auction-handler';
import { CancelAuctionCommandHandler } from './cancel-auction-handler';
import { CloseAuctionCommandHandler } from './close-auction-handler';

function makeScheduledStoredEvents(): StoredEvent[] {
  const agg = AuctionAggregate.create('lot-1');
  agg.scheduleAuction({
    startAt: new Date('2026-06-20T10:00:00Z'),
    endAt: new Date('2026-06-20T12:00:00Z'),
    reservePrice: 500,
    minBidIncrement: 10,
    autoExtendWindowMinutes: 3,
    autoExtendDurationMinutes: 3,
  });
  return agg.uncommittedEvents.map((e, i) => ({
    id: `se-${i}`,
    lotId: 'lot-1',
    sequence: i + 1,
    type: e.type,
    payload: e.payload,
    occurredAt: new Date(),
  }));
}

function makeLiveStoredEvents(): StoredEvent[] {
  const scheduled = makeScheduledStoredEvents();
  const agg = AuctionAggregate.create('lot-1');
  scheduled.forEach(e => agg.applyStored(e));
  agg.startAuction();
  const startedEvent = agg.uncommittedEvents[0];
  return [
    ...scheduled,
    { id: 'se-start', lotId: 'lot-1', sequence: scheduled.length + 1, type: startedEvent.type, payload: startedEvent.payload, occurredAt: new Date() },
  ];
}

const mockStore: EventStore = { append: vi.fn(), load: vi.fn() };
const mockProjection: ProjectionHandler = { handle: vi.fn() };
const mockTimer: TimerScheduler = {
  scheduleStart: vi.fn(),
  scheduleClose: vi.fn(),
  rescheduleClose: vi.fn(),
  scheduleClosingSoon: vi.fn(),
};
const mockPublisher: AuctionEventPublisher = {
  publishBidPlaced: vi.fn(),
  publishAuctionClosingSoon: vi.fn(),
  publishAuctionClosed: vi.fn(),
};
const mockLock: RedisLock = { acquire: vi.fn(), release: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockStore.append).mockResolvedValue(undefined);
  vi.mocked(mockProjection.handle).mockResolvedValue(undefined);
  vi.mocked(mockLock.acquire).mockResolvedValue(true);
  vi.mocked(mockLock.release).mockResolvedValue(undefined);
  vi.mocked(mockPublisher.publishBidPlaced).mockResolvedValue(undefined);
  vi.mocked(mockPublisher.publishAuctionClosed).mockResolvedValue(undefined);
  vi.mocked(mockTimer.scheduleStart).mockResolvedValue(undefined);
  vi.mocked(mockTimer.scheduleClose).mockResolvedValue(undefined);
  vi.mocked(mockTimer.scheduleClosingSoon).mockResolvedValue(undefined);
  vi.mocked(mockTimer.rescheduleClose).mockResolvedValue(undefined);
});

describe('ScheduleAuctionCommandHandler', () => {
  it('should_appendScheduledEventAndScheduleTimers_when_commandExecuted', async () => {
    vi.mocked(mockStore.load).mockResolvedValue([]);
    const handler = new ScheduleAuctionCommandHandler(mockStore, mockProjection, mockTimer);

    await handler.execute({
      lotId: 'lot-1',
      startAt: new Date('2026-06-20T10:00:00Z'),
      endAt: new Date('2026-06-20T12:00:00Z'),
      reservePrice: 500,
      minBidIncrement: 10,
      autoExtendWindowMinutes: 3,
      autoExtendDurationMinutes: 3,
    });

    expect(mockStore.append).toHaveBeenCalledWith(
      'lot-1',
      expect.arrayContaining([expect.objectContaining({ type: 'AuctionScheduled' })]),
      0,
    );
    expect(mockTimer.scheduleStart).toHaveBeenCalled();
    expect(mockTimer.scheduleClose).toHaveBeenCalled();
    expect(mockTimer.scheduleClosingSoon).toHaveBeenCalled();
  });
});

describe('StartAuctionCommandHandler', () => {
  it('should_appendAuctionStartedEvent_when_commandExecuted', async () => {
    vi.mocked(mockStore.load).mockResolvedValue(makeScheduledStoredEvents());
    const handler = new StartAuctionCommandHandler(mockStore, mockProjection);

    await handler.execute({ lotId: 'lot-1' });

    expect(mockStore.append).toHaveBeenCalledWith(
      'lot-1',
      expect.arrayContaining([expect.objectContaining({ type: 'AuctionStarted' })]),
      expect.any(Number),
    );
  });
});

describe('PlaceBidCommandHandler', () => {
  it('should_appendBidPlacedAndPublish_when_bidIsValid', async () => {
    vi.mocked(mockStore.load).mockResolvedValue(makeLiveStoredEvents());
    const handler = new PlaceBidCommandHandler(mockStore, mockProjection, mockPublisher, mockLock);

    const result = await handler.execute({
      lotId: 'lot-1',
      bidId: 'bid-1',
      userId: 'user-1',
      amount: 200,
      placedAt: new Date('2026-06-20T11:00:00Z'),
    });

    expect(result.success).toBe(true);
    expect(mockStore.append).toHaveBeenCalled();
    expect(mockPublisher.publishBidPlaced).toHaveBeenCalled();
    expect(mockLock.release).toHaveBeenCalled();
  });

  it('should_returnFailureAndNotAppend_when_bidTooLow', async () => {
    vi.mocked(mockStore.load).mockResolvedValue(makeLiveStoredEvents());
    const handler = new PlaceBidCommandHandler(mockStore, mockProjection, mockPublisher, mockLock);

    const result = await handler.execute({
      lotId: 'lot-1',
      bidId: 'bid-1',
      userId: 'user-1',
      amount: 1,
      placedAt: new Date('2026-06-20T11:00:00Z'),
    });

    expect(result.success).toBe(false);
    expect(mockStore.append).not.toHaveBeenCalled();
    expect(mockLock.release).toHaveBeenCalled();
  });
});

describe('CancelAuctionCommandHandler', () => {
  it('should_appendCancelledEvent_when_commandExecuted', async () => {
    vi.mocked(mockStore.load).mockResolvedValue(makeLiveStoredEvents());
    const handler = new CancelAuctionCommandHandler(mockStore, mockProjection);

    await handler.execute({ lotId: 'lot-1', reason: 'Admin cancelled' });

    expect(mockStore.append).toHaveBeenCalledWith(
      'lot-1',
      expect.arrayContaining([expect.objectContaining({ type: 'AuctionCancelled' })]),
      expect.any(Number),
    );
  });
});

describe('CloseAuctionCommandHandler', () => {
  it('should_appendClosedEventAndPublish_when_auctionCloses', async () => {
    vi.mocked(mockStore.load).mockResolvedValue(makeLiveStoredEvents());
    const handler = new CloseAuctionCommandHandler(mockStore, mockProjection, mockPublisher);

    await handler.execute({ lotId: 'lot-1' });

    expect(mockStore.append).toHaveBeenCalledWith(
      'lot-1',
      expect.arrayContaining([expect.objectContaining({ type: 'AuctionClosed' })]),
      expect.any(Number),
    );
    expect(mockPublisher.publishAuctionClosed).toHaveBeenCalled();
  });

  it('should_beIdempotent_when_auctionAlreadyClosed', async () => {
    const liveEvents = makeLiveStoredEvents();
    const agg = AuctionAggregate.create('lot-1');
    liveEvents.forEach(e => agg.applyStored(e));
    agg.close();
    const closedEvent = agg.uncommittedEvents[0];
    vi.mocked(mockStore.load).mockResolvedValue([
      ...liveEvents,
      { id: 'se-closed', lotId: 'lot-1', sequence: liveEvents.length + 1, type: closedEvent.type, payload: closedEvent.payload, occurredAt: new Date() },
    ]);
    const handler = new CloseAuctionCommandHandler(mockStore, mockProjection, mockPublisher);

    await handler.execute({ lotId: 'lot-1' });

    expect(mockStore.append).not.toHaveBeenCalled();
    expect(mockPublisher.publishAuctionClosed).not.toHaveBeenCalled();
  });
});
