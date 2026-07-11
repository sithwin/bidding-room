import { LotQueryRepository, UnsoldLotRow } from './lot-query-repository';

export class GetUnsoldLotsHandler {
  constructor(private readonly repo: LotQueryRepository) {}

  async execute(): Promise<UnsoldLotRow[]> {
    return this.repo.findUnsoldLots();
  }
}
