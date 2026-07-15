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
  userId: string;
  amount: number;
  placedAt: Date;
}

export interface DashboardStats {
  activeAuctions: number;
  endingSoon: number;
}

export interface AuctionResultRow {
  lotId: string;
  finalBid: number | null;
  reserveMet: boolean;
  winnerUserId: string | null;
  closedAt: Date;
}

export interface UnsoldLotRow {
  lotId: string;
  highestBid: number | null;
}

// One row per lot the given user has bid on, most recent bid first.
export interface UserBidRow {
  lotId: string;
  amount: number;
  placedAt: Date;
  isWinning: boolean;
  currentHighestBid: number | null;
  status: string;
  endAt: Date;
}

export interface UserStats {
  totalBids: number;
  activeBids: number;
  leadingBids: number;
  lotsWon: number;
}

export interface LotQueryRepository {
  findLotStatus(lotId: string): Promise<LotStatusRow | null>;
  findBidHistory(lotId: string, limit: number, offset: number): Promise<{ bids: BidRow[]; total: number }>;
  findActiveLots(limit: number, offset: number): Promise<{ lots: LotStatusRow[]; total: number }>;
  getDashboardStats(): Promise<DashboardStats>;
  findClosedResults(from: Date, to: Date): Promise<AuctionResultRow[]>;
  findUnsoldLots(): Promise<UnsoldLotRow[]>;
  findBidderIds(lotId: string): Promise<string[]>;
  findBidsByUser(userId: string, limit: number, offset: number): Promise<{ bids: UserBidRow[]; total: number }>;
  getUserStats(userId: string): Promise<UserStats>;
}
