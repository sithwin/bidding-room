import { randomUUID } from 'node:crypto';
import { Category } from '../domain/category';
import { CategoryRepository } from '../domain/category-repository';

export interface CreateCategoryInput {
  name: string;
  slug: string;
  parentId?: string;
}

export class CreateCategoryUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(input: CreateCategoryInput): Promise<Category> {
    const category = new Category({
      id: randomUUID(),
      name: input.name.trim(),
      slug: input.slug.trim(),
      parentId: input.parentId ?? null,
      displayOrder: 0,
    });
    await this.categoryRepository.create(category);
    return category;
  }
}
