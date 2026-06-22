import { EventPublisher } from '@carat-room/shared-events';
import { AuctionEventPublisher } from '../application/auction-event-publisher';

export class RabbitMQAuctionPublisher implements AuctionEventPublisher {
  constructor(private readonly publisher: EventPublisher) {}

  async publishBidPlaced(params: {
    lotId: string;
    bidId: string;
    userId: string;
    amount: number;
    bidCount: number;
    endAt: string;
  }): Promise<void> {
    await this.publisher.publish('auction.bid.placed', {
      lotId: params.lotId,
      bidId: params.bidId,
      userId: params.userId,
      amount: params.amount,
      bidCount: params.bidCount,
      endAt: params.endAt,
    });
  }

  async publishAuctionClosingSoon(params: { lotId: string; endAt: string }): Promise<void> {
    await this.publisher.publish('auction.closing.soon', {
      lotId: params.lotId,
      endAt: params.endAt,
    });
  }

  async publishAuctionClosed(params: {
    lotId: string;
    reserveMet: boolean;
    winnerUserId: string | null;
    finalAmount: number;
  }): Promise<void> {
    await this.publisher.publish('auction.closed', {
      lotId: params.lotId,
      reserveMet: params.reserveMet,
      winnerUserId: params.winnerUserId,
      finalAmount: params.finalAmount,
    });
  }
}
