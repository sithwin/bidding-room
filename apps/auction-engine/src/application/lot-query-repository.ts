export interface LotStatusRow {
  lotId: string;
  status: string;
  currentHighestBid: number | null;
  bidCount: number;
  endAt: Date;
  winnerUserId: string | null;
  updatedAt: Date;
}

export interface BidRow {
  id: string;
  amount: number;
  placedAt: Date;
}

export interface LotQueryRepository {
  findLotStatus(lotId: string): Promise<LotStatusRow | null>;
  findBidHistory(lotId: string, limit: number, offset: number): Promise<{ bids: BidRow[]; total: number }>;
  findActiveLots(limit: number, offset: number): Promise<{ lots: LotStatusRow[]; total: number }>;
}
