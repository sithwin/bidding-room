import { DashboardStats, LotQueryRepository } from './lot-query-repository';

export class GetDashboardStatsHandler {
  constructor(private readonly repo: LotQueryRepository) {}

  async execute(): Promise<DashboardStats> {
    return this.repo.getDashboardStats();
  }
}
