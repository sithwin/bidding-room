import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { buildFacetsRouter } from './facets-router';

const mockUnsafe = vi.fn();
const mockDb = Object.assign(vi.fn(), { unsafe: mockUnsafe });

describe('facets-router', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/', buildFacetsRouter(mockDb as any));
  });

  it('GET /api/lots/facets returns departments and auctions', async () => {
    mockUnsafe.mockResolvedValueOnce([
      { department: 'Jewellery', count: '12' },
      { department: 'Watches', count: '5' },
    ]);
    mockUnsafe.mockResolvedValueOnce([
      { id: 'auction-1', title: 'June Sale' },
    ]);

    const res = await app.request('/api/lots/facets');
    expect(res.status).toBe(200);
    const body = await res.json() as { departments: { name: string; count: number }[]; auctions: { id: string; title: string }[] };
    expect(body.departments).toEqual([
      { name: 'Jewellery', count: 12 },
      { name: 'Watches', count: 5 },
    ]);
    expect(body.auctions).toEqual([{ id: 'auction-1', title: 'June Sale' }]);
  });

  it('GET /api/lots/facets returns empty arrays when no data exists', async () => {
    mockUnsafe.mockResolvedValueOnce([]);
    mockUnsafe.mockResolvedValueOnce([]);

    const res = await app.request('/api/lots/facets');
    expect(res.status).toBe(200);
    const body = await res.json() as { departments: unknown[]; auctions: unknown[] };
    expect(body.departments).toEqual([]);
    expect(body.auctions).toEqual([]);
  });

  it('GET /api/lots/facets passes filter params through to department query', async () => {
    mockUnsafe.mockResolvedValueOnce([{ department: 'Jewellery', count: '3' }]);
    mockUnsafe.mockResolvedValueOnce([]);

    const res = await app.request('/api/lots/facets?q=diamond&minPrice=1000&maxPrice=5000');
    expect(res.status).toBe(200);
    expect(mockUnsafe).toHaveBeenCalledTimes(2);
    // First call should include the filter conditions
    const firstCallSql = mockUnsafe.mock.calls[0][0] as string;
    expect(firstCallSql).toContain('plainto_tsquery');
    expect(firstCallSql).toContain('estimated_value >=');
    expect(firstCallSql).toContain('estimated_value <=');
  });
});
