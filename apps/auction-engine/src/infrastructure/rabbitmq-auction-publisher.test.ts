import { describe, it, expect, vi } from 'vitest';
import { EventPublisher } from '@carat-room/shared-events';
import { RabbitMQAuctionPublisher } from './rabbitmq-auction-publisher';

const mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as EventPublisher;

describe('RabbitMQAuctionPublisher', () => {
  it('should_publishBidPlacedWithCorrectRoutingKey', async () => {
    const pub = new RabbitMQAuctionPublisher(mockPublisher);

    await pub.publishBidPlaced({
      lotId: 'lot-1',
      bidId: 'bid-1',
      userId: 'user-1',
      amount: 300,
      bidCount: 2,
      endAt: '2026-06-20T12:00:00Z',
    });

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      'auction.bid.placed',
      expect.objectContaining({ lotId: 'lot-1', amount: 300, bidCount: 2 }),
    );
  });

  it('should_publishAuctionClosedWithCorrectRoutingKey', async () => {
    const pub = new RabbitMQAuctionPublisher(mockPublisher);

    await pub.publishAuctionClosed({
      lotId: 'lot-1',
      reserveMet: true,
      winnerUserId: 'user-1',
      finalAmount: 600,
    });

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      'auction.closed',
      expect.objectContaining({ lotId: 'lot-1', reserveMet: true, winnerUserId: 'user-1' }),
    );
  });
});
