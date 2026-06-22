import {
  AuctionDomainEvent,
  AuctionScheduledPayload,
  BidPlacedPayload,
  TimerExtendedPayload,
  AuctionClosedPayload,
} from './auction-events';
import { StoredEvent } from './event-store';

export enum LotStatus {
  Draft = 'DRAFT',
  Scheduled = 'SCHEDULED',
  Live = 'LIVE',
  Closing = 'CLOSING',
  Closed = 'CLOSED',
  Sold = 'SOLD',
  Unsold = 'UNSOLD',
  Cancelled = 'CANCELLED',
}

export type PlaceBidResult =
  | { success: true; timerExtended: false }
  | { success: true; timerExtended: true; newEndAt: Date }
  | { success: false; reason: 'BID_TOO_LOW' | 'CANNOT_OUTBID_SELF' | 'AUCTION_NOT_ACTIVE' };

export interface CloseAuctionResult {
  alreadyClosed: boolean;
  reserveMet: boolean;
  winnerUserId: string | null;
  finalAmount: number;
}

export class AuctionAggregate {
  sequence = 0;
  uncommittedEvents: AuctionDomainEvent[] = [];

  status = LotStatus.Draft;
  startAt: Date = new Date(0);
  endAt: Date = new Date(0);
  reservePrice = 0;
  minBidIncrement = 0;
  autoExtendWindowMinutes = 0;
  autoExtendDurationMinutes = 0;
  highestBidId: string | null = null;
  highestBidAmount = 0;
  highestBidUserId: string | null = null;
  bidCount = 0;

  private constructor(readonly lotId: string) {}

  static create(lotId: string): AuctionAggregate {
    return new AuctionAggregate(lotId);
  }

  applyStored(stored: StoredEvent): void {
    this.sequence = stored.sequence;
    this.applyEvent({ type: stored.type, payload: stored.payload } as AuctionDomainEvent);
  }

  private appendEvent(event: AuctionDomainEvent): void {
    this.uncommittedEvents.push(event);
    this.applyEvent(event);
  }

  private applyEvent(event: AuctionDomainEvent): void {
    switch (event.type) {
      case 'AuctionScheduled': {
        const p = event.payload as AuctionScheduledPayload;
        this.status = LotStatus.Scheduled;
        this.startAt = new Date(p.start_at);
        this.endAt = new Date(p.end_at);
        this.reservePrice = p.reserve_price;
        this.minBidIncrement = p.min_bid_increment;
        this.autoExtendWindowMinutes = p.auto_extend_window_minutes;
        this.autoExtendDurationMinutes = p.auto_extend_duration_minutes;
        break;
      }
      case 'AuctionStarted':
        this.status = LotStatus.Live;
        break;
      case 'BidPlaced': {
        const p = event.payload as BidPlacedPayload;
        this.highestBidId = p.bid_id;
        this.highestBidAmount = p.amount;
        this.highestBidUserId = p.user_id;
        this.bidCount += 1;
        break;
      }
      case 'TimerExtended': {
        const p = event.payload as TimerExtendedPayload;
        this.endAt = new Date(p.new_end_at);
        this.status = LotStatus.Closing;
        break;
      }
      case 'AuctionClosed': {
        const p = event.payload as AuctionClosedPayload;
        this.status = p.reserve_met ? LotStatus.Sold : LotStatus.Unsold;
        break;
      }
      case 'AuctionCancelled':
        this.status = LotStatus.Cancelled;
        break;
    }
  }

  scheduleAuction(params: {
    startAt: Date;
    endAt: Date;
    reservePrice: number;
    minBidIncrement: number;
    autoExtendWindowMinutes: number;
    autoExtendDurationMinutes: number;
  }): void {
    this.appendEvent({
      type: 'AuctionScheduled',
      payload: {
        start_at: params.startAt.toISOString(),
        end_at: params.endAt.toISOString(),
        reserve_price: params.reservePrice,
        min_bid_increment: params.minBidIncrement,
        auto_extend_window_minutes: params.autoExtendWindowMinutes,
        auto_extend_duration_minutes: params.autoExtendDurationMinutes,
      },
    });
  }

  startAuction(): void {
    this.appendEvent({ type: 'AuctionStarted', payload: {} });
  }

  placeBid(params: {
    bidId: string;
    userId: string;
    amount: number;
    placedAt: Date;
  }): PlaceBidResult {
    if (this.status !== LotStatus.Live && this.status !== LotStatus.Closing) {
      return { success: false, reason: 'AUCTION_NOT_ACTIVE' };
    }
    if (params.userId === this.highestBidUserId) {
      return { success: false, reason: 'CANNOT_OUTBID_SELF' };
    }
    if (params.amount < this.highestBidAmount + this.minBidIncrement) {
      return { success: false, reason: 'BID_TOO_LOW' };
    }

    this.appendEvent({
      type: 'BidPlaced',
      payload: {
        bid_id: params.bidId,
        user_id: params.userId,
        amount: params.amount,
        placed_at: params.placedAt.toISOString(),
      },
    });

    const msToClose = this.endAt.getTime() - params.placedAt.getTime();
    const windowMs = this.autoExtendWindowMinutes * 60 * 1000;

    if (msToClose < windowMs) {
      const newEndAt = new Date(params.placedAt.getTime() + this.autoExtendDurationMinutes * 60 * 1000);
      this.appendEvent({
        type: 'TimerExtended',
        payload: {
          new_end_at: newEndAt.toISOString(),
          extended_by_minutes: this.autoExtendDurationMinutes,
        },
      });
      return { success: true, timerExtended: true, newEndAt };
    }

    return { success: true, timerExtended: false };
  }

  cancel(reason: string): void {
    this.appendEvent({ type: 'AuctionCancelled', payload: { reason } });
  }

  close(): CloseAuctionResult {
    const terminalStatuses: LotStatus[] = [
      LotStatus.Sold, LotStatus.Unsold, LotStatus.Closed, LotStatus.Cancelled,
    ];
    if (terminalStatuses.includes(this.status)) {
      return { alreadyClosed: true, reserveMet: false, winnerUserId: null, finalAmount: 0 };
    }

    const reserveMet = this.highestBidId !== null && this.highestBidAmount >= this.reservePrice;

    this.appendEvent({
      type: 'AuctionClosed',
      payload: {
        highest_bid_id: this.highestBidId,
        highest_amount: this.highestBidAmount,
        reserve_met: reserveMet,
        winner_user_id: reserveMet ? this.highestBidUserId : null,
      },
    });

    return {
      alreadyClosed: false,
      reserveMet,
      winnerUserId: reserveMet ? this.highestBidUserId : null,
      finalAmount: this.highestBidAmount,
    };
  }
}
