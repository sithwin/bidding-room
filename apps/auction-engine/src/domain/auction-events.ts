export interface AuctionScheduledPayload {
  start_at: string;
  end_at: string;
  reserve_price: number;
  min_bid_increment: number;
  auto_extend_window_minutes: number;
  auto_extend_duration_minutes: number;
}

export interface BidPlacedPayload {
  bid_id: string;
  user_id: string;
  amount: number;
  placed_at: string;
}

export interface TimerExtendedPayload {
  new_end_at: string;
  extended_by_minutes: number;
}

export interface AuctionClosedPayload {
  highest_bid_id: string | null;
  highest_amount: number;
  reserve_met: boolean;
  winner_user_id: string | null;
}

export interface AuctionCancelledPayload {
  reason: string;
}

export type AuctionDomainEvent =
  | { type: 'AuctionScheduled'; payload: AuctionScheduledPayload }
  | { type: 'AuctionStarted'; payload: Record<string, never> }
  | { type: 'BidPlaced'; payload: BidPlacedPayload }
  | { type: 'TimerExtended'; payload: TimerExtendedPayload }
  | { type: 'AuctionClosed'; payload: AuctionClosedPayload }
  | { type: 'AuctionCancelled'; payload: AuctionCancelledPayload };
