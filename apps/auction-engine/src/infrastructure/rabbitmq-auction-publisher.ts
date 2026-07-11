import { EventPublisher } from '@carat-room/shared-events';
import type {
  AuctionClosedPayload,
  AuctionClosingSoonPayload,
  BidPlacedPayload,
} from '@carat-room/shared-types';
import { AuctionEventPublisher } from '../application/auction-event-publisher';

export class RabbitMQAuctionPublisher implements AuctionEventPublisher {
  constructor(private readonly publisher: EventPublisher) {}

  async publishBidPlaced(payload: BidPlacedPayload): Promise<void> {
    await this.publisher.publish('auction.bid.placed', payload);
  }

  async publishAuctionClosingSoon(payload: AuctionClosingSoonPayload): Promise<void> {
    await this.publisher.publish('auction.closing.soon', payload);
  }

  async publishAuctionClosed(payload: AuctionClosedPayload): Promise<void> {
    await this.publisher.publish('auction.closed', payload);
  }
}
