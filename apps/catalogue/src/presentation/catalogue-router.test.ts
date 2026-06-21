import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { buildCatalogueRouter } from './catalogue-router';
import { Lot, LotCondition } from '../domain/lot';
import { Category } from '../domain/category';

function buildLot(): Lot {
  return new Lot({
    id: 'lot-1',
    title: 'Cartier Love Ring',
    description: 'Authentic piece',
    categoryId: 'cat-1',
    condition: LotCondition.Excellent,
    estimatedValue: 3000,
    images: [],
    createdBy: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
    updatedAt: new Date('2026-06-20T00:00:00Z'),
  });
}

function buildUseCases(overrides: Record<string, unknown> = {}) {
  return {
    getLot: { execute: vi.fn().mockResolvedValue(null) },
    listLots: { execute: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 }) },
    searchLots: { execute: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
    listCategories: { execute: vi.fn().mockResolvedValue([]) },
    requestImageUpload: { execute: vi.fn() },
    confirmImageUpload: { execute: vi.fn() },
    ...overrides,
  };
}

describe('GET /api/lots/:id', () => {
  it('should_return200WithLot_when_lotExists', async () => {
    const useCases = buildUseCases({ getLot: { execute: vi.fn().mockResolvedValue(buildLot()) } });
    const app = new Hono().route('/', buildCatalogueRouter(useCases));

    const res = await app.request('/api/lots/lot-1');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { id: string } };
    expect(body.data.id).toBe('lot-1');
  });

  it('should_return404_when_lotDoesNotExist', async () => {
    const app = new Hono().route('/', buildCatalogueRouter(buildUseCases()));

    const res = await app.request('/api/lots/nonexistent');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/lots', () => {
  it('should_return200WithPaginatedLots', async () => {
    const useCases = buildUseCases({
      listLots: { execute: vi.fn().mockResolvedValue({ items: [buildLot()], total: 1, limit: 10, offset: 0 }) },
    });
    const app = new Hono().route('/', buildCatalogueRouter(useCases));

    const res = await app.request('/api/lots?limit=10&offset=0');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; meta: { total: number } };
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
  });
});

describe('GET /api/lots/search', () => {
  it('should_return400_when_queryMissing', async () => {
    const app = new Hono().route('/', buildCatalogueRouter(buildUseCases()));

    const res = await app.request('/api/lots/search');

    expect(res.status).toBe(400);
  });

  it('should_return200WithResults_when_queryProvided', async () => {
    const useCases = buildUseCases({
      searchLots: { execute: vi.fn().mockResolvedValue({
        items: [{ id: 'lot-1', title: 'Cartier Love Ring', thumbnailUrl: null, estimatedValue: 3000, categoryId: 'cat-1' }],
        total: 1,
      }) },
    });
    const app = new Hono().route('/', buildCatalogueRouter(useCases));

    const res = await app.request('/api/lots/search?q=Cartier');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });
});

describe('GET /api/categories', () => {
  it('should_return200WithCategories', async () => {
    const useCases = buildUseCases({
      listCategories: { execute: vi.fn().mockResolvedValue([
        new Category({ id: 'cat-1', name: 'Rings', slug: 'rings', parentId: null, displayOrder: 1 }),
      ]) },
    });
    const app = new Hono().route('/', buildCatalogueRouter(useCases));

    const res = await app.request('/api/categories');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { slug: string }[] };
    expect(body.data[0].slug).toBe('rings');
  });
});
