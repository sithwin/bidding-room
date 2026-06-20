export interface BidPlacedPayload {
  lotId: string;
  bidId: string;
  userId: string;
  amount: number;
  previousHighestBidderId: string | null;
  placedAt: string; // ISO 8601
}

export interface AuctionClosingSoonPayload {
  lotId: string;
  endAt: string;            // ISO 8601
  activeBidderIds: string[];
}

export interface AuctionClosedPayload {
  lotId: string;
  highestBidId: string | null;
  highestAmount: number | null;
  reserveMet: boolean;
  winnerUserId: string | null;
  closedAt: string;         // ISO 8601
}
