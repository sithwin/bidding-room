import { Auction, AuctionStatus } from './auction';

export interface AuctionListItem {
  auction: Auction;
  lotCount: number;
}

export interface AuctionRepository {
  findById(id: string): Promise<Auction | null>;
  findAll(status: AuctionStatus | undefined, limit: number): Promise<AuctionListItem[]>;
  save(auction: Auction): Promise<void>;
}
