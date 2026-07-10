import { CategoryRepository } from '../domain/category-repository';

export class RenameCategoryUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(id: string, name: string): Promise<void> {
    await this.categoryRepository.updateName(id, name.trim());
  }
}
