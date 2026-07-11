import { Lot } from '../domain/lot';
import { LotRepository } from '../domain/lot-repository';
import { LotNotFoundError, ImageOrderMismatchError } from '../domain/errors';

export class ReorderImagesUseCase {
  constructor(private readonly lotRepository: LotRepository) {}

  async execute(lotId: string, imageIds: string[]): Promise<void> {
    const lot = await this.lotRepository.findById(lotId);
    if (!lot) {
      throw new LotNotFoundError(lotId);
    }

    const currentIds = new Set(lot.images.map(img => img.id));
    const providedIds = new Set(imageIds);
    const isSameSize = currentIds.size === providedIds.size;
    const hasSameMembers = [...currentIds].every(id => providedIds.has(id));
    if (!isSameSize || !hasSameMembers) {
      throw new ImageOrderMismatchError(lotId);
    }

    const imagesById = new Map(lot.images.map(img => [img.id, img]));
    const reordered = imageIds.map((id, index) => ({ ...imagesById.get(id)!, displayOrder: index }));

    const updatedLot = new Lot({
      id: lot.id,
      title: lot.title,
      description: lot.description,
      auctionId: lot.auctionId,
      categoryId: lot.categoryId,
      condition: lot.condition,
      estimatedValue: lot.estimatedValue,
      status: lot.status,
      images: reordered,
      createdBy: lot.createdBy,
      createdAt: lot.createdAt,
      updatedAt: new Date(),
    });

    await this.lotRepository.save(updatedLot);
  }
}
