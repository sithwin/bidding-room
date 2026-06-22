import { BidRow, LotQueryRepository } from './lot-query-repository';

export interface GetBidHistoryParams {
  lotId: string;
  page: number;
  pageSize: number;
}

export class GetBidHistoryHandler {
  constructor(private readonly repo: LotQueryRepository) {}

  async execute(params: GetBidHistoryParams): Promise<{ bids: BidRow[]; total: number }> {
    const offset = (params.page - 1) * params.pageSize;
    return this.repo.findBidHistory(params.lotId, params.pageSize, offset);
  }
}
