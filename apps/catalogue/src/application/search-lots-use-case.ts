import { LotSearchResult, SearchRepository } from '../domain/search-repository';

export class SearchLotsUseCase {
  constructor(private readonly searchRepository: SearchRepository) {}

  async execute(
    query: string,
    categoryId: string | undefined,
    limit: number,
    offset: number,
  ): Promise<{ items: LotSearchResult[]; total: number }> {
    return this.searchRepository.search(query, { categoryId }, limit, offset);
  }
}
