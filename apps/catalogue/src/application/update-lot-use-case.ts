import { Lot, LotActiveStatus, LotCondition } from '../domain/lot';
import { LotRepository } from '../domain/lot-repository';
import { LotNotFoundError } from '../domain/errors';

export interface UpdateLotInput {
  title?: string;
  description?: string;
  categoryId?: string;
  condition?: LotCondition;
  estimatedValue?: number;
  status?: LotActiveStatus;
}

export class UpdateLotUseCase {
  constructor(private readonly lotRepository: LotRepository) {}

  async execute(id: string, input: UpdateLotInput): Promise<void> {
    const lot = await this.lotRepository.findById(id);
    if (!lot) {
      throw new LotNotFoundError(id);
    }

    const updatedLot = new Lot({
      id: lot.id,
      title: input.title ?? lot.title,
      description: input.description ?? lot.description,
      auctionId: lot.auctionId,
      categoryId: input.categoryId ?? lot.categoryId,
      condition: input.condition ?? lot.condition,
      estimatedValue: input.estimatedValue ?? lot.estimatedValue,
      status: input.status ?? lot.status,
      images: lot.images,
      createdBy: lot.createdBy,
      createdAt: lot.createdAt,
      updatedAt: new Date(),
    });

    await this.lotRepository.save(updatedLot);
  }
}
