import { LotQueryRepository, LotStatusRow } from './lot-query-repository';

export interface GetActiveLotsParams {
  page: number;
  pageSize: number;
}

export class GetActiveLotsHandler {
  constructor(private readonly repo: LotQueryRepository) {}

  async execute(params: GetActiveLotsParams): Promise<{ lots: LotStatusRow[]; total: number }> {
    const offset = (params.page - 1) * params.pageSize;
    return this.repo.findActiveLots(params.pageSize, offset);
  }
}
