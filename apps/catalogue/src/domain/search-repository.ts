export interface LotSearchResult {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  estimatedValue: number | null;
  categoryId: string | null;
}

export interface SearchFilters {
  categoryId?: string;
}

export interface SearchRepository {
  search(query: string, filters: SearchFilters, limit: number, offset: number): Promise<{ items: LotSearchResult[]; total: number }>;
}
