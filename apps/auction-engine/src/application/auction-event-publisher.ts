export interface AuctionEventPublisher {
  publishBidPlaced(params: {
    lotId: string;
    bidId: string;
    userId: string;
    amount: number;
    bidCount: number;
    endAt: string;
  }): Promise<void>;
  publishAuctionClosingSoon(params: { lotId: string; endAt: string }): Promise<void>;
  publishAuctionClosed(params: {
    lotId: string;
    reserveMet: boolean;
    winnerUserId: string | null;
    finalAmount: number;
  }): Promise<void>;
}
