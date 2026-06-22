import { AuctionAggregate } from '../domain/auction-aggregate';
import { EventStore } from '../domain/event-store';
import { ProjectionHandler } from './projection-handler';
import { AuctionEventPublisher } from './auction-event-publisher';

export class CloseAuctionCommandHandler {
  constructor(
    private readonly eventStore: EventStore,
    private readonly projectionHandler: ProjectionHandler,
    private readonly publisher: AuctionEventPublisher,
  ) {}

  async execute(command: { lotId: string }): Promise<void> {
    const stored = await this.eventStore.load(command.lotId);
    const agg = AuctionAggregate.create(command.lotId);
    stored.forEach(e => agg.applyStored(e));

    const result = agg.close();
    if (result.alreadyClosed) {
      return;
    }

    await this.eventStore.append(command.lotId, agg.uncommittedEvents, agg.sequence);
    await this.projectionHandler.handle(command.lotId, agg.uncommittedEvents);
    await this.publisher.publishAuctionClosed({
      lotId: command.lotId,
      reserveMet: result.reserveMet,
      winnerUserId: result.winnerUserId,
      finalAmount: result.finalAmount,
    });
  }
}
