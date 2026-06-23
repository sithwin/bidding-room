import { randomUUID } from 'node:crypto';
import { Lot, LotCondition } from '../domain/lot';
import { LotRepository } from '../domain/lot-repository';

export interface CreateLotInput {
  title: string;
  description?: string;
  categoryId?: string;
  condition?: string;
  estimatedValue?: number;
  createdBy?: string;
}

export class CreateLotUseCase {
  constructor(private readonly lotRepository: LotRepository) {}

  async execute(input: CreateLotInput): Promise<{ id: string }> {
    const now = new Date();
    const lot = new Lot({
      id: randomUUID(),
      title: input.title.trim(),
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      condition: (input.condition as LotCondition) ?? null,
      estimatedValue: input.estimatedValue ?? null,
      images: [],
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await this.lotRepository.save(lot);
    return { id: lot.id };
  }
}
