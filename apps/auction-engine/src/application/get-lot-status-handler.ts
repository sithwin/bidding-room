import { LotQueryRepository, LotStatusRow } from './lot-query-repository';

export class GetLotStatusHandler {
  constructor(private readonly repo: LotQueryRepository) {}

  async execute(lotId: string): Promise<LotStatusRow | null> {
    return this.repo.findLotStatus(lotId);
  }
}
