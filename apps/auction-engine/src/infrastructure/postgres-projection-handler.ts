import {
  AuctionDomainEvent,
  AuctionScheduledPayload,
  BidPlacedPayload,
  TimerExtendedPayload,
  AuctionClosedPayload,
} from '../domain/auction-events';
import { ProjectionHandler } from '../application/projection-handler';
import { Db } from './db';

export class PostgresProjectionHandler implements ProjectionHandler {
  constructor(private readonly db: Db) {}

  async handle(lotId: string, events: AuctionDomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.applyEvent(lotId, event);
    }
  }

  private async applyEvent(lotId: string, event: AuctionDomainEvent): Promise<void> {
    switch (event.type) {
      case 'AuctionScheduled': {
        const p = event.payload as AuctionScheduledPayload;
        await this.db`
          INSERT INTO lot_status (lot_id, status, bid_count, end_at, updated_at)
          VALUES (${lotId}, 'SCHEDULED', 0, ${new Date(p.end_at)}, NOW())
          ON CONFLICT (lot_id) DO UPDATE SET
            status = 'SCHEDULED', end_at = EXCLUDED.end_at, updated_at = NOW()
        `;
        break;
      }
      case 'AuctionStarted':
        await this.db`
          UPDATE lot_status SET status = 'LIVE', updated_at = NOW() WHERE lot_id = ${lotId}
        `;
        break;
      case 'BidPlaced': {
        const p = event.payload as BidPlacedPayload;
        await this.db`
          UPDATE lot_status
          SET current_highest_bid = ${p.amount}, bid_count = bid_count + 1, updated_at = NOW()
          WHERE lot_id = ${lotId}
        `;
        await this.db`
          INSERT INTO bids (id, lot_id, user_id, amount, placed_at)
          VALUES (${p.bid_id}, ${lotId}, ${p.user_id}, ${p.amount}, ${new Date(p.placed_at)})
        `;
        break;
      }
      case 'TimerExtended': {
        const p = event.payload as TimerExtendedPayload;
        await this.db`
          UPDATE lot_status
          SET end_at = ${new Date(p.new_end_at)}, status = 'CLOSING', updated_at = NOW()
          WHERE lot_id = ${lotId}
        `;
        break;
      }
      case 'AuctionClosed': {
        const p = event.payload as AuctionClosedPayload;
        await this.db`
          UPDATE lot_status
          SET status = ${p.reserve_met ? 'SOLD' : 'UNSOLD'},
              winner_user_id = ${p.winner_user_id},
              updated_at = NOW()
          WHERE lot_id = ${lotId}
        `;
        break;
      }
      case 'AuctionCancelled':
        await this.db`
          UPDATE lot_status SET status = 'CANCELLED', updated_at = NOW() WHERE lot_id = ${lotId}
        `;
        break;
    }
  }
}
