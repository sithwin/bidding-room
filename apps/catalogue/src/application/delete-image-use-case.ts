import { Lot } from '../domain/lot';
import { LotRepository } from '../domain/lot-repository';
import { LotNotFoundError, LotImageNotFoundError } from '../domain/errors';
import { ImageStorage } from './image-storage';

export class DeleteImageUseCase {
  constructor(
    private readonly lotRepository: LotRepository,
    private readonly imageStorage: ImageStorage,
  ) {}

  async execute(lotId: string, imageId: string): Promise<void> {
    const lot = await this.lotRepository.findById(lotId);
    if (!lot) {
      throw new LotNotFoundError(lotId);
    }

    const image = lot.images.find(img => img.id === imageId);
    if (!image) {
      throw new LotImageNotFoundError(imageId);
    }

    await this.imageStorage.deleteObject(image.key);
    await this.imageStorage.deleteObject(`${image.key}_thumb`);

    const remaining = lot.images
      .filter(img => img.id !== imageId)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((img, index) => ({ ...img, displayOrder: index }));

    if (image.isPrimary && remaining.length > 0) {
      remaining[0] = { ...remaining[0], isPrimary: true };
    }

    const updatedLot = new Lot({
      id: lot.id,
      title: lot.title,
      description: lot.description,
      auctionId: lot.auctionId,
      categoryId: lot.categoryId,
      condition: lot.condition,
      estimatedValue: lot.estimatedValue,
      status: lot.status,
      images: remaining,
      createdBy: lot.createdBy,
      createdAt: lot.createdAt,
      updatedAt: new Date(),
    });

    await this.lotRepository.save(updatedLot);
  }
}
