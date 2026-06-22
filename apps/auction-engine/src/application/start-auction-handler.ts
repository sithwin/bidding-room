import { AuctionAggregate } from '../domain/auction-aggregate';
import { EventStore } from '../domain/event-store';
import { ProjectionHandler } from './projection-handler';

export class StartAuctionCommandHandler {
  constructor(
    private readonly eventStore: EventStore,
    private readonly projectionHandler: ProjectionHandler,
  ) {}

  async execute(command: { lotId: string }): Promise<void> {
    const stored = await this.eventStore.load(command.lotId);
    const agg = AuctionAggregate.create(command.lotId);
    stored.forEach(e => agg.applyStored(e));

    agg.startAuction();

    await this.eventStore.append(command.lotId, agg.uncommittedEvents, agg.sequence);
    await this.projectionHandler.handle(command.lotId, agg.uncommittedEvents);
  }
}
