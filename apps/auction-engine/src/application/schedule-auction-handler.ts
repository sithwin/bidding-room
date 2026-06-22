import { AuctionAggregate } from '../domain/auction-aggregate';
import { EventStore } from '../domain/event-store';
import { ProjectionHandler } from './projection-handler';
import { TimerScheduler } from './timer-scheduler';

const CLOSING_SOON_MINUTES = 15;

export interface ScheduleAuctionCommand {
  lotId: string;
  startAt: Date;
  endAt: Date;
  reservePrice: number;
  minBidIncrement: number;
  autoExtendWindowMinutes: number;
  autoExtendDurationMinutes: number;
}

export class ScheduleAuctionCommandHandler {
  constructor(
    private readonly eventStore: EventStore,
    private readonly projectionHandler: ProjectionHandler,
    private readonly timerScheduler: TimerScheduler,
  ) {}

  async execute(command: ScheduleAuctionCommand): Promise<void> {
    const stored = await this.eventStore.load(command.lotId);
    const agg = AuctionAggregate.create(command.lotId);
    stored.forEach(e => agg.applyStored(e));

    agg.scheduleAuction({
      startAt: command.startAt,
      endAt: command.endAt,
      reservePrice: command.reservePrice,
      minBidIncrement: command.minBidIncrement,
      autoExtendWindowMinutes: command.autoExtendWindowMinutes,
      autoExtendDurationMinutes: command.autoExtendDurationMinutes,
    });

    await this.eventStore.append(command.lotId, agg.uncommittedEvents, agg.sequence);
    await this.projectionHandler.handle(command.lotId, agg.uncommittedEvents);

    await this.timerScheduler.scheduleStart(command.lotId, command.startAt);
    await this.timerScheduler.scheduleClose(command.lotId, command.endAt);
    await this.timerScheduler.scheduleClosingSoon(
      command.lotId,
      new Date(command.endAt.getTime() - CLOSING_SOON_MINUTES * 60 * 1000),
    );
  }
}
