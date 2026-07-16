import { LotQueryRepository, UserBidRow } from './lot-query-repository';

export interface GetAccountBidsParams {
  userId: string;
  page: number;
  pageSize: number;
}

export class GetAccountBidsHandler {
  constructor(private readonly repo: LotQueryRepository) {}

  async execute(params: GetAccountBidsParams): Promise<{ bids: UserBidRow[]; total: number }> {
    const offset = (params.page - 1) * params.pageSize;
    return this.repo.findBidsByUser(params.userId, params.pageSize, offset);
  }
}
