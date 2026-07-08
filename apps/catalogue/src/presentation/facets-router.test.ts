import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { facetsResponseSchema } from '@carat-room/shared-types';
import { FacetRepository } from '../domain/facet-repository';
import { buildFacetsRouter } from './facets-router';

const countLotsByDepartment = vi.fn();
const listOpenAuctions = vi.fn();
const facetRepository: FacetRepository = { countLotsByDepartment, listOpenAuctions };

describe('facets-router', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/', buildFacetsRouter({ facetRepository }));
  });

  it('GET /api/lots/facets returns departments and auctions', async () => {
    countLotsByDepartment.mockResolvedValueOnce([
      { name: 'Jewellery', count: 12 },
      { name: 'Watches', count: 5 },
    ]);
    listOpenAuctions.mockResolvedValueOnce([{ id: 'auction-1', title: 'June Sale' }]);

    const res = await app.request('/api/lots/facets');
    expect(res.status).toBe(200);
    const body = facetsResponseSchema.parse(await res.json());
    expect(body.departments).toEqual([
      { name: 'Jewellery', count: 12 },
      { name: 'Watches', count: 5 },
    ]);
    expect(body.auctions).toEqual([{ id: 'auction-1', title: 'June Sale' }]);
  });

  it('GET /api/lots/facets returns empty arrays when no data exists', async () => {
    countLotsByDepartment.mockResolvedValueOnce([]);
    listOpenAuctions.mockResolvedValueOnce([]);

    const res = await app.request('/api/lots/facets');
    expect(res.status).toBe(200);
    const body = await res.json() as { departments: unknown[]; auctions: unknown[] };
    expect(body.departments).toEqual([]);
    expect(body.auctions).toEqual([]);
  });

  it('GET /api/lots/facets maps query params to facet filters', async () => {
    countLotsByDepartment.mockResolvedValueOnce([{ name: 'Jewellery', count: 3 }]);
    listOpenAuctions.mockResolvedValueOnce([]);

    const res = await app.request('/api/lots/facets?q=diamond&auctionId=auction-1&minPrice=1000&maxPrice=5000');
    expect(res.status).toBe(200);
    expect(countLotsByDepartment).toHaveBeenCalledWith({
      query: 'diamond',
      auctionId: 'auction-1',
      minEstimatedValue: 1000,
      maxEstimatedValue: 5000,
    });
  });

  it('GET /api/lots/facets omits filters that are not supplied', async () => {
    countLotsByDepartment.mockResolvedValueOnce([]);
    listOpenAuctions.mockResolvedValueOnce([]);

    await app.request('/api/lots/facets');
    expect(countLotsByDepartment).toHaveBeenCalledWith({
      query: undefined,
      auctionId: undefined,
      minEstimatedValue: undefined,
      maxEstimatedValue: undefined,
    });
  });
});
