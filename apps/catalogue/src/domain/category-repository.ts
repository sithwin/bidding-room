import { Category } from './category';

export interface CategoryRepository {
  findAll(): Promise<Category[]>;
  findBySlug(slug: string): Promise<Category | null>;
  findById(id: string): Promise<Category | null>;
  /** Throws CategorySlugConflictError if the slug is already in use. */
  create(category: Category): Promise<void>;
  /** Throws CategoryNotFoundError if no category exists with this id. */
  updateName(id: string, name: string): Promise<void>;
  /** Throws CategoryNotFoundError if no category exists with this id, CategoryHasLotsError if lots reference it. */
  delete(id: string): Promise<void>;
}
