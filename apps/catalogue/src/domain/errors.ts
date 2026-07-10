export class LotNotFoundError extends Error {
  constructor(lotId: string) {
    super(`Lot not found: ${lotId}`);
    this.name = 'LotNotFoundError';
  }
}

export class CategoryNotFoundError extends Error {
  constructor(categoryId: string) {
    super(`Category not found: ${categoryId}`);
    this.name = 'CategoryNotFoundError';
  }
}

export class CategorySlugConflictError extends Error {
  constructor(slug: string) {
    super(`Category slug already in use: ${slug}`);
    this.name = 'CategorySlugConflictError';
  }
}

export class CategoryHasLotsError extends Error {
  constructor(categoryId: string) {
    super(`Category has lots assigned and cannot be deleted: ${categoryId}`);
    this.name = 'CategoryHasLotsError';
  }
}
