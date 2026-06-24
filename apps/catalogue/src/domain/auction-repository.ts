import { Auction } from './auction';

export interface AuctionRepository {
  findById(id: string): Promise<Auction | null>;
  save(auction: Auction): Promise<void>;
}
