import { AuctionAggregate, PlaceBidResult } from '../domain/auction-aggregate';
import { EventStore } from '../domain/event-store';
import { ProjectionHandler } from './projection-handler';
import { AuctionEventPublisher } from './auction-event-publisher';
import { TimerScheduler } from './timer-scheduler';

export interface RedisLock {
  acquire(key: string, ttlMs: number): Promise<boolean>;
  release(key: string): Promise<void>;
}

export interface PlaceBidCommand {
  lotId: string;
  bidId: string;
  userId: string;
  amount: number;
  placedAt: Date;
}

export class PlaceBidCommandHandler {
  constructor(
    private readonly eventStore: EventStore,
    private readonly projectionHandler: ProjectionHandler,
    private readonly publisher: AuctionEventPublisher,
    private readonly lock: RedisLock,
    private readonly timerScheduler?: TimerScheduler,
  ) {}

  async execute(command: PlaceBidCommand): Promise<PlaceBidResult> {
    const lockKey = `bid-lock:${command.lotId}`;
    const acquired = await this.lock.acquire(lockKey, 5000);
    if (!acquired) {
      return { success: false, reason: 'AUCTION_NOT_ACTIVE' };
    }

    try {
      const stored = await this.eventStore.load(command.lotId);
      const agg = AuctionAggregate.create(command.lotId);
      stored.forEach(e => agg.applyStored(e));

      const result = agg.placeBid({
        bidId: command.bidId,
        userId: command.userId,
        amount: command.amount,
        placedAt: command.placedAt,
      });

      if (!result.success) {
        return result;
      }

      await this.eventStore.append(command.lotId, agg.uncommittedEvents, agg.sequence);
      await this.projectionHandler.handle(command.lotId, agg.uncommittedEvents);
      await this.publisher.publishBidPlaced({
        lotId: command.lotId,
        bidId: command.bidId,
        userId: command.userId,
        amount: command.amount,
        bidCount: agg.bidCount,
        endAt: agg.endAt.toISOString(),
      });

      if (result.timerExtended && this.timerScheduler) {
        await this.timerScheduler.rescheduleClose(command.lotId, result.newEndAt);
      }

      return result;
    } finally {
      await this.lock.release(lockKey);
    }
  }
}
