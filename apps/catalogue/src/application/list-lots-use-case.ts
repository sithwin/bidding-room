import { Lot } from '../domain/lot';
import { LotFilters, LotRepository, PaginatedResult } from '../domain/lot-repository';

export class ListLotsUseCase {
  constructor(private readonly lotRepository: LotRepository) {}

  async execute(filters: LotFilters, limit: number, offset: number): Promise<PaginatedResult<Lot>> {
    return this.lotRepository.findAll(filters, limit, offset);
  }
}
