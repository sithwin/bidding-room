import { v4 as uuidv4 } from 'uuid';
import { Lot, LotImage } from '../domain/lot';
import { LotRepository } from '../domain/lot-repository';
import { ImageStorage } from './image-storage';

export class ConfirmImageUploadUseCase {
  constructor(
    private readonly lotRepository: LotRepository,
    private readonly imageStorage: ImageStorage,
  ) {}

  async execute(lotId: string, imageKey: string, isPrimary: boolean): Promise<void> {
    const lot = await this.lotRepository.findById(lotId);
    if (!lot) {
      throw new Error(`Lot not found: ${lotId}`);
    }

    const url = await this.imageStorage.getPublicUrl(imageKey);
    const thumbnailUrl = await this.imageStorage.getPublicUrl(`${imageKey}_thumb`);

    const newImage: LotImage = {
      id: uuidv4(),
      lotId,
      url,
      thumbnailUrl,
      displayOrder: lot.images.length,
      isPrimary,
    };

    const updatedImages = isPrimary
      ? [...lot.images.map(img => ({ ...img, isPrimary: false })), newImage]
      : [...lot.images, newImage];

    const updatedLot = new Lot({
      id: lot.id,
      title: lot.title,
      description: lot.description,
      categoryId: lot.categoryId,
      condition: lot.condition,
      estimatedValue: lot.estimatedValue,
      images: updatedImages,
      createdBy: lot.createdBy,
      createdAt: lot.createdAt,
      updatedAt: new Date(),
    });

    await this.lotRepository.save(updatedLot);
  }
}
