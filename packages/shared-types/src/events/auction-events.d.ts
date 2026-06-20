export interface BidPlacedPayload {
    lotId: string;
    bidId: string;
    userId: string;
    amount: number;
    previousHighestBidderId: string | null;
    placedAt: string;
}
export interface AuctionClosingSoonPayload {
    lotId: string;
    endAt: string;
    activeBidderIds: string[];
}
export interface AuctionClosedPayload {
    lotId: string;
    highestBidId: string | null;
    highestAmount: number | null;
    reserveMet: boolean;
    winnerUserId: string | null;
    closedAt: string;
}
//# sourceMappingURL=auction-events.d.ts.map