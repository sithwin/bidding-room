import { AuctionResultRow, LotQueryRepository } from './lot-query-repository';

export class GetAuctionResultsHandler {
  constructor(private readonly repo: LotQueryRepository) {}

  async execute(from: Date, to: Date): Promise<AuctionResultRow[]> {
    return this.repo.findClosedResults(from, to);
  }
}
