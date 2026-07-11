import { CategoryRepository } from '../domain/category-repository';

export class DeleteCategoryUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(id: string): Promise<void> {
    await this.categoryRepository.delete(id);
  }
}
