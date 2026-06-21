import { describe, it, expect, vi } from 'vitest';
import { GetLotUseCase } from './get-lot-use-case';
import { ListLotsUseCase } from './list-lots-use-case';
import { SearchLotsUseCase } from './search-lots-use-case';
import { ListCategoriesUseCase } from './list-categories-use-case';
import { ConfirmImageUploadUseCase } from './confirm-image-upload-use-case';
import { Lot, LotCondition } from '../domain/lot';
import { Category } from '../domain/category';
import { LotRepository, PaginatedResult } from '../domain/lot-repository';
import { CategoryRepository } from '../domain/category-repository';
import { SearchRepository, LotSearchResult } from '../domain/search-repository';
import { ImageStorage } from './image-storage';

function buildLot(): Lot {
  return new Lot({
    id: 'lot-1',
    title: 'Cartier Love Ring',
    description: null,
    categoryId: 'cat-1',
    condition: LotCondition.Excellent,
    estimatedValue: 3000,
    images: [],
    createdBy: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
    updatedAt: new Date('2026-06-20T00:00:00Z'),
  });
}

function buildCategory(): Category {
  return new Category({ id: 'cat-1', name: 'Rings', slug: 'rings', parentId: null, displayOrder: 1 });
}

describe('GetLotUseCase', () => {
  it('should_returnLot_when_lotExists', async () => {
    const mockRepo: LotRepository = {
      findById: vi.fn().mockResolvedValue(buildLot()),
      findAll: vi.fn(),
      save: vi.fn(),
    };

    const result = await new GetLotUseCase(mockRepo).execute('lot-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('lot-1');
    expect(mockRepo.findById).toHaveBeenCalledWith('lot-1');
  });

  it('should_returnNull_when_lotDoesNotExist', async () => {
    const mockRepo: LotRepository = {
      findById: vi.fn().mockResolvedValue(null),
      findAll: vi.fn(),
      save: vi.fn(),
    };

    const result = await new GetLotUseCase(mockRepo).execute('nonexistent');

    expect(result).toBeNull();
  });
});

describe('ListLotsUseCase', () => {
  it('should_returnPaginatedLots_when_called', async () => {
    const paginatedResult: PaginatedResult<Lot> = { items: [buildLot()], total: 1, limit: 10, offset: 0 };
    const mockRepo: LotRepository = {
      findById: vi.fn(),
      findAll: vi.fn().mockResolvedValue(paginatedResult),
      save: vi.fn(),
    };

    const result = await new ListLotsUseCase(mockRepo).execute({}, 10, 0);

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });
});

describe('SearchLotsUseCase', () => {
  it('should_delegateToSearchRepository_with_correct_filters', async () => {
    const searchResults: LotSearchResult[] = [
      { id: 'lot-1', title: 'Cartier Love Ring', thumbnailUrl: null, estimatedValue: 3000, categoryId: 'cat-1' },
    ];
    const mockSearchRepo: SearchRepository = {
      search: vi.fn().mockResolvedValue({ items: searchResults, total: 1 }),
    };

    const result = await new SearchLotsUseCase(mockSearchRepo).execute('Cartier', undefined, 10, 0);

    expect(result.items).toHaveLength(1);
    expect(mockSearchRepo.search).toHaveBeenCalledWith('Cartier', {}, 10, 0);
  });

  it('should_passCategory_when_categoryIdProvided', async () => {
    const mockSearchRepo: SearchRepository = {
      search: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    await new SearchLotsUseCase(mockSearchRepo).execute('ring', 'cat-1', 10, 0);

    expect(mockSearchRepo.search).toHaveBeenCalledWith('ring', { categoryId: 'cat-1' }, 10, 0);
  });
});

describe('ListCategoriesUseCase', () => {
  it('should_returnAllCategories', async () => {
    const mockRepo: CategoryRepository = {
      findAll: vi.fn().mockResolvedValue([buildCategory()]),
      findBySlug: vi.fn(),
      findById: vi.fn(),
    };

    const result = await new ListCategoriesUseCase(mockRepo).execute();

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('rings');
  });
});

describe('ConfirmImageUploadUseCase', () => {
  it('should_throw_when_lotDoesNotExist', async () => {
    const mockRepo: LotRepository = {
      findById: vi.fn().mockResolvedValue(null),
      findAll: vi.fn(),
      save: vi.fn(),
    };
    const mockStorage: ImageStorage = {
      generatePresignedUploadUrl: vi.fn(),
      getPublicUrl: vi.fn().mockResolvedValue('https://assets.example.com/key'),
    };

    await expect(
      new ConfirmImageUploadUseCase(mockRepo, mockStorage).execute('nonexistent', 'lots/nonexistent/img', false),
    ).rejects.toThrow();
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('should_appendImage_without_changingExistingImages_when_isPrimaryIsFalse', async () => {
    const mockRepo: LotRepository = {
      findById: vi.fn().mockResolvedValue(buildLot()),
      findAll: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const mockStorage: ImageStorage = {
      generatePresignedUploadUrl: vi.fn(),
      getPublicUrl: vi.fn().mockResolvedValue('https://assets.example.com/key'),
    };

    await new ConfirmImageUploadUseCase(mockRepo, mockStorage).execute('lot-1', 'lots/lot-1/img', false);

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.images).toHaveLength(1);
    expect(savedLot.images[0].isPrimary).toBe(false);
  });

  it('should_demoteExistingPrimary_when_isPrimaryIsTrue', async () => {
    const lotWithPrimary = new Lot({
      id: 'lot-1',
      title: 'Cartier Love Ring',
      description: null,
      categoryId: 'cat-1',
      condition: LotCondition.Excellent,
      estimatedValue: 3000,
      images: [
        { id: 'img-existing', lotId: 'lot-1', url: 'https://assets.example.com/old.jpg', thumbnailUrl: 'https://assets.example.com/old_thumb.jpg', displayOrder: 0, isPrimary: true },
      ],
      createdBy: null,
      createdAt: new Date('2026-06-20T00:00:00Z'),
      updatedAt: new Date('2026-06-20T00:00:00Z'),
    });
    const mockRepo: LotRepository = {
      findById: vi.fn().mockResolvedValue(lotWithPrimary),
      findAll: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const mockStorage: ImageStorage = {
      generatePresignedUploadUrl: vi.fn(),
      getPublicUrl: vi.fn().mockResolvedValue('https://assets.example.com/new.jpg'),
    };

    await new ConfirmImageUploadUseCase(mockRepo, mockStorage).execute('lot-1', 'lots/lot-1/new', true);

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    const existingImg = savedLot.images.find(img => img.id === 'img-existing');
    const newImg = savedLot.images.find(img => img.isPrimary);
    expect(existingImg?.isPrimary).toBe(false);
    expect(newImg?.id).not.toBe('img-existing');
  });
});
