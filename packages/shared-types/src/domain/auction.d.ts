export type LotAuctionStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'CLOSING' | 'CLOSED' | 'SOLD' | 'UNSOLD';
export interface Bid {
    id: string;
    lotId: string;
    userId: string;
    amount: number;
    placedAt: string;
}
export interface LotStatus {
    lotId: string;
    status: LotAuctionStatus;
    currentHighestBid: number | null;
    bidCount: number;
    endAt: string;
    winnerUserId: string | null;
    updatedAt: string;
}
//# sourceMappingURL=auction.d.ts.map