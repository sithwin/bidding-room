import { describe, it, expect } from 'vitest';
import { Lot, LotCondition, LotImage } from './lot';

describe('Lot', () => {
  it('should_createLot_when_allRequiredFieldsProvided', () => {
    const lot = new Lot({
      id: 'lot-1',
      title: 'Cartier Love Ring 18ct Gold',
      description: 'Authenticated, original box included',
      categoryId: 'cat-1',
      condition: LotCondition.Excellent,
      estimatedValue: 2500,
      images: [],
      createdBy: 'admin-1',
      createdAt: new Date('2026-06-20T00:00:00Z'),
      updatedAt: new Date('2026-06-20T00:00:00Z'),
    });

    expect(lot.id).toBe('lot-1');
    expect(lot.title).toBe('Cartier Love Ring 18ct Gold');
    expect(lot.condition).toBe(LotCondition.Excellent);
  });

  it('should_returnPrimaryImage_when_imagesContainPrimaryFlag', () => {
    const images: LotImage[] = [
      { id: 'img-1', lotId: 'lot-1', url: 'https://assets.example.com/img1.jpg', thumbnailUrl: 'https://assets.example.com/img1_thumb.jpg', displayOrder: 0, isPrimary: false },
      { id: 'img-2', lotId: 'lot-1', url: 'https://assets.example.com/img2.jpg', thumbnailUrl: 'https://assets.example.com/img2_thumb.jpg', displayOrder: 1, isPrimary: true },
    ];
    const lot = new Lot({
      id: 'lot-1',
      title: 'Chanel Classic Flap',
      description: null,
      categoryId: null,
      condition: LotCondition.VeryGood,
      estimatedValue: null,
      images,
      createdBy: 'admin-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(lot.primaryImage()).toEqual(images[1]);
  });

  it('should_returnNull_when_noImagesExist', () => {
    const lot = new Lot({
      id: 'lot-1',
      title: 'Empty lot',
      description: null,
      categoryId: null,
      condition: null,
      estimatedValue: null,
      images: [],
      createdBy: 'admin-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(lot.primaryImage()).toBeNull();
  });

  it('should_returnSortedImages_when_multipleImagesExist', () => {
    const images: LotImage[] = [
      { id: 'img-2', lotId: 'lot-1', url: 'b.jpg', thumbnailUrl: 'b_t.jpg', displayOrder: 1, isPrimary: false },
      { id: 'img-1', lotId: 'lot-1', url: 'a.jpg', thumbnailUrl: 'a_t.jpg', displayOrder: 0, isPrimary: true },
    ];
    const lot = new Lot({
      id: 'lot-1', title: 'T', description: null, categoryId: null,
      condition: null, estimatedValue: null, images,
      createdBy: 'admin-1', createdAt: new Date(), updatedAt: new Date(),
    });

    const sorted = lot.sortedImages();
    expect(sorted[0].id).toBe('img-1');
    expect(sorted[1].id).toBe('img-2');
  });
});
