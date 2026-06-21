import { Lot, LotCondition } from './lot';

export interface LotFilters {
  categoryId?: string;
  condition?: LotCondition;
  minEstimatedValue?: number;
  maxEstimatedValue?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface LotRepository {
  findById(id: string): Promise<Lot | null>;
  findAll(filters: LotFilters, limit: number, offset: number): Promise<PaginatedResult<Lot>>;
  save(lot: Lot): Promise<void>;
}
