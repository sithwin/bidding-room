import { LotQueryRepository, UserStats } from './lot-query-repository';

export class GetAccountStatsHandler {
  constructor(private readonly repo: LotQueryRepository) {}

  async execute(userId: string): Promise<UserStats> {
    return this.repo.getUserStats(userId);
  }
}
