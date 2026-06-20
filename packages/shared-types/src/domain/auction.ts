export type LotAuctionStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'LIVE'
  | 'CLOSING'
  | 'CLOSED'
  | 'SOLD'
  | 'UNSOLD';

export interface Bid {
  id: string;
  lotId: string;
  userId: string;
  amount: number;
  placedAt: string; // ISO 8601
}

export interface LotStatus {
  lotId: string;
  status: LotAuctionStatus;
  currentHighestBid: number | null;
  bidCount: number;
  endAt: string;            // ISO 8601
  winnerUserId: string | null;
  updatedAt: string;        // ISO 8601
}
