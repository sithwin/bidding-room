import { describe, it, expect, vi } from 'vitest';
import { GetLotUseCase } from './get-lot-use-case';
import { ListLotsUseCase } from './list-lots-use-case';
import { SearchLotsUseCase } from './search-lots-use-case';
import { ListCategoriesUseCase } from './list-categories-use-case';
import { CreateCategoryUseCase } from './create-category-use-case';
import { RenameCategoryUseCase } from './rename-category-use-case';
import { DeleteCategoryUseCase } from './delete-category-use-case';
import { ConfirmImageUploadUseCase } from './confirm-image-upload-use-case';
import { DeleteImageUseCase } from './delete-image-use-case';
import { CreateLotUseCase } from './create-lot-use-case';
import { UpdateLotUseCase } from './update-lot-use-case';
import { Lot, LotCondition, LotImage } from '../domain/lot';
import { Category } from '../domain/category';
import { LotRepository, PaginatedResult } from '../domain/lot-repository';
import { CategoryRepository } from '../domain/category-repository';
import { SearchRepository, LotSearchResult } from '../domain/search-repository';
import { ImageStorage } from './image-storage';
import { CategoryHasLotsError, CategoryNotFoundError, CategorySlugConflictError, LotNotFoundError, LotImageNotFoundError } from '../domain/errors';

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

describe('CreateLotUseCase', () => {
  it('should_defaultStatusToActive_when_notProvided', async () => {
    const mockRepo: LotRepository = { findById: vi.fn(), findAll: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };

    await new CreateLotUseCase(mockRepo).execute({ title: 'Diamond Ring' });

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.status).toBe('ACTIVE');
  });

  it('should_useProvidedStatus_when_given', async () => {
    const mockRepo: LotRepository = { findById: vi.fn(), findAll: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };

    await new CreateLotUseCase(mockRepo).execute({ title: 'Diamond Ring', status: 'INACTIVE' });

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.status).toBe('INACTIVE');
  });
});

describe('UpdateLotUseCase', () => {
  it('should_throw_when_lotDoesNotExist', async () => {
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(null), findAll: vi.fn(), save: vi.fn() };

    await expect(new UpdateLotUseCase(mockRepo).execute('nonexistent', { title: 'New Title' }))
      .rejects.toThrow(LotNotFoundError);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('should_applyOnlyProvidedFields_when_partialUpdate', async () => {
    const mockRepo: LotRepository = {
      findById: vi.fn().mockResolvedValue(buildLot()),
      findAll: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };

    await new UpdateLotUseCase(mockRepo).execute('lot-1', { title: 'Renamed Ring' });

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.title).toBe('Renamed Ring');
    expect(savedLot.estimatedValue).toBe(3000);
  });

  it('should_updateStatus_when_provided', async () => {
    const mockRepo: LotRepository = {
      findById: vi.fn().mockResolvedValue(buildLot()),
      findAll: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };

    await new UpdateLotUseCase(mockRepo).execute('lot-1', { status: 'INACTIVE' });

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.status).toBe('INACTIVE');
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
      create: vi.fn(),
      updateName: vi.fn(),
      delete: vi.fn(),
    };

    const result = await new ListCategoriesUseCase(mockRepo).execute();

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('rings');
  });
});

function buildCategoryRepoMock(overrides: Partial<CategoryRepository> = {}): CategoryRepository {
  return {
    findAll: vi.fn(),
    findBySlug: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateName: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe('CreateCategoryUseCase', () => {
  it('should_createCategoryWithTrimmedFields_when_valid', async () => {
    const mockRepo = buildCategoryRepoMock();

    const result = await new CreateCategoryUseCase(mockRepo).execute({ name: ' Rings ', slug: ' rings ' });

    expect(result.name).toBe('Rings');
    expect(result.slug).toBe('rings');
    expect(result.parentId).toBeNull();
    expect(mockRepo.create).toHaveBeenCalledWith(result);
  });

  it('should_setParentId_when_provided', async () => {
    const mockRepo = buildCategoryRepoMock();

    const result = await new CreateCategoryUseCase(mockRepo).execute({ name: 'Gold Rings', slug: 'gold-rings', parentId: 'cat-1' });

    expect(result.parentId).toBe('cat-1');
  });

  it('should_propagate_when_repositoryThrowsSlugConflict', async () => {
    const mockRepo = buildCategoryRepoMock({ create: vi.fn().mockRejectedValue(new CategorySlugConflictError('rings')) });

    await expect(new CreateCategoryUseCase(mockRepo).execute({ name: 'Rings', slug: 'rings' }))
      .rejects.toThrow(CategorySlugConflictError);
  });
});

describe('RenameCategoryUseCase', () => {
  it('should_renameWithTrimmedName', async () => {
    const mockRepo = buildCategoryRepoMock();

    await new RenameCategoryUseCase(mockRepo).execute('cat-1', ' New Name ');

    expect(mockRepo.updateName).toHaveBeenCalledWith('cat-1', 'New Name');
  });

  it('should_propagate_when_categoryNotFound', async () => {
    const mockRepo = buildCategoryRepoMock({ updateName: vi.fn().mockRejectedValue(new CategoryNotFoundError('cat-1')) });

    await expect(new RenameCategoryUseCase(mockRepo).execute('cat-1', 'New Name'))
      .rejects.toThrow(CategoryNotFoundError);
  });
});

describe('DeleteCategoryUseCase', () => {
  it('should_deleteCategory', async () => {
    const mockRepo = buildCategoryRepoMock();

    await new DeleteCategoryUseCase(mockRepo).execute('cat-1');

    expect(mockRepo.delete).toHaveBeenCalledWith('cat-1');
  });

  it('should_propagate_when_categoryHasLots', async () => {
    const mockRepo = buildCategoryRepoMock({ delete: vi.fn().mockRejectedValue(new CategoryHasLotsError('cat-1')) });

    await expect(new DeleteCategoryUseCase(mockRepo).execute('cat-1'))
      .rejects.toThrow(CategoryHasLotsError);
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
      deleteObject: vi.fn(),
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
      deleteObject: vi.fn(),
    };

    await new ConfirmImageUploadUseCase(mockRepo, mockStorage).execute('lot-1', 'lots/lot-1/img', false);

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.images).toHaveLength(1);
    expect(savedLot.images[0].isPrimary).toBe(false);
    expect(savedLot.images[0].key).toBe('lots/lot-1/img');
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
        { id: 'img-existing', lotId: 'lot-1', key: 'lots/lot-1/img-existing', url: 'https://assets.example.com/old.jpg', thumbnailUrl: 'https://assets.example.com/old_thumb.jpg', displayOrder: 0, isPrimary: true },
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
      deleteObject: vi.fn(),
    };

    await new ConfirmImageUploadUseCase(mockRepo, mockStorage).execute('lot-1', 'lots/lot-1/new', true);

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    const existingImg = savedLot.images.find(img => img.id === 'img-existing');
    const newImg = savedLot.images.find(img => img.isPrimary);
    expect(existingImg?.isPrimary).toBe(false);
    expect(newImg?.id).not.toBe('img-existing');
  });
});

function buildLotWithImages(images: LotImage[]): Lot {
  return new Lot({
    id: 'lot-1',
    title: 'Cartier Love Ring',
    description: null,
    categoryId: 'cat-1',
    condition: LotCondition.Excellent,
    estimatedValue: 3000,
    images,
    createdBy: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
    updatedAt: new Date('2026-06-20T00:00:00Z'),
  });
}

describe('DeleteImageUseCase', () => {
  it('should_throw_when_lotDoesNotExist', async () => {
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(null), findAll: vi.fn(), save: vi.fn() };
    const mockStorage: ImageStorage = { generatePresignedUploadUrl: vi.fn(), getPublicUrl: vi.fn(), deleteObject: vi.fn() };

    await expect(new DeleteImageUseCase(mockRepo, mockStorage).execute('nonexistent', 'img-1'))
      .rejects.toThrow(LotNotFoundError);
  });

  it('should_throw_when_imageDoesNotExistOnLot', async () => {
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(buildLotWithImages([])), findAll: vi.fn(), save: vi.fn() };
    const mockStorage: ImageStorage = { generatePresignedUploadUrl: vi.fn(), getPublicUrl: vi.fn(), deleteObject: vi.fn() };

    await expect(new DeleteImageUseCase(mockRepo, mockStorage).execute('lot-1', 'nonexistent'))
      .rejects.toThrow(LotImageNotFoundError);
  });

  it('should_deleteBothOriginalAndThumbnailObjects_when_imageDeleted', async () => {
    const images: LotImage[] = [
      { id: 'img-1', lotId: 'lot-1', key: 'lots/lot-1/a', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: false },
    ];
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(buildLotWithImages(images)), findAll: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
    const mockStorage: ImageStorage = { generatePresignedUploadUrl: vi.fn(), getPublicUrl: vi.fn(), deleteObject: vi.fn().mockResolvedValue(undefined) };

    await new DeleteImageUseCase(mockRepo, mockStorage).execute('lot-1', 'img-1');

    expect(mockStorage.deleteObject).toHaveBeenCalledWith('lots/lot-1/a');
    expect(mockStorage.deleteObject).toHaveBeenCalledWith('lots/lot-1/a_thumb');
  });

  it('should_promoteLowestDisplayOrderRemaining_when_primaryImageDeleted', async () => {
    const images: LotImage[] = [
      { id: 'img-1', lotId: 'lot-1', key: 'lots/lot-1/a', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: true },
      { id: 'img-2', lotId: 'lot-1', key: 'lots/lot-1/b', url: 'https://b', thumbnailUrl: 'https://b_thumb', displayOrder: 1, isPrimary: false },
      { id: 'img-3', lotId: 'lot-1', key: 'lots/lot-1/c', url: 'https://c', thumbnailUrl: 'https://c_thumb', displayOrder: 2, isPrimary: false },
    ];
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(buildLotWithImages(images)), findAll: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
    const mockStorage: ImageStorage = { generatePresignedUploadUrl: vi.fn(), getPublicUrl: vi.fn(), deleteObject: vi.fn().mockResolvedValue(undefined) };

    await new DeleteImageUseCase(mockRepo, mockStorage).execute('lot-1', 'img-1');

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.images).toHaveLength(2);
    expect(savedLot.images.find(img => img.id === 'img-2')?.isPrimary).toBe(true);
    expect(savedLot.images.map(img => img.displayOrder)).toEqual([0, 1]);
  });

  it('should_leaveNoPrimary_when_lastImageDeleted', async () => {
    const images: LotImage[] = [
      { id: 'img-1', lotId: 'lot-1', key: 'lots/lot-1/a', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: true },
    ];
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(buildLotWithImages(images)), findAll: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
    const mockStorage: ImageStorage = { generatePresignedUploadUrl: vi.fn(), getPublicUrl: vi.fn(), deleteObject: vi.fn().mockResolvedValue(undefined) };

    await new DeleteImageUseCase(mockRepo, mockStorage).execute('lot-1', 'img-1');

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.images).toHaveLength(0);
  });

  it('should_notChangePrimary_when_nonPrimaryImageDeleted', async () => {
    const images: LotImage[] = [
      { id: 'img-1', lotId: 'lot-1', key: 'lots/lot-1/a', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: true },
      { id: 'img-2', lotId: 'lot-1', key: 'lots/lot-1/b', url: 'https://b', thumbnailUrl: 'https://b_thumb', displayOrder: 1, isPrimary: false },
    ];
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(buildLotWithImages(images)), findAll: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
    const mockStorage: ImageStorage = { generatePresignedUploadUrl: vi.fn(), getPublicUrl: vi.fn(), deleteObject: vi.fn().mockResolvedValue(undefined) };

    await new DeleteImageUseCase(mockRepo, mockStorage).execute('lot-1', 'img-2');

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.images.find(img => img.id === 'img-1')?.isPrimary).toBe(true);
  });
});
