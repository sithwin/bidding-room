import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';
import { buildLotsRouter } from './lots-router';
import { buildCategoriesRouter } from './categories-router';
import { buildAuctionsRouter } from './auctions-router';

vi.mock('@carat-room/shared-auth', () => ({
  authMiddleware: () => async (
    c: { set: (k: string, v: unknown) => void },
    next: () => Promise<void>,
  ) => {
    c.set('jwtPayload', { sub: 'admin-1', role: 'ADMIN' });
    await next();
  },
}));

vi.mock('../infrastructure/service-client', async (importActual) => {
  const actual = await importActual<typeof import('../infrastructure/service-client')>();
  return {
    ...actual,
    ServiceClient: vi.fn().mockImplementation(() => ({
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    })),
  };
});

let mockClient: ServiceClient;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = new ServiceClient('http://mock');
});

const authHeader = () => ({ Authorization: 'Bearer admin-token' });

describe('Lots router', () => {
  it('should_return200_when_postingNewLot', async () => {
    vi.mocked(mockClient.post).mockResolvedValue({ data: { id: 'lot-1' } });
    const app = new Hono().route('/', buildLotsRouter(mockClient));

    const res = await app.request('/admin/api/lots', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Diamond Ring' }),
    });

    expect(res.status).toBe(200);
    expect(mockClient.post).toHaveBeenCalledWith('/api/lots', 'admin-token', expect.any(Object));
  });

  it('should_propagateStatusCode_when_downstreamReturnsError', async () => {
    vi.mocked(mockClient.patch).mockRejectedValue(new ServiceError(404, { error: { code: 'NOT_FOUND' } }));
    const app = new Hono().route('/', buildLotsRouter(mockClient));

    const res = await app.request('/admin/api/lots/lot-1', {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });

    expect(res.status).toBe(404);
  });
});

describe('Categories router', () => {
  it('should_return200_when_listingCategories', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ data: [] });
    const app = new Hono().route('/', buildCategoriesRouter(mockClient));

    const res = await app.request('/admin/api/categories', { headers: authHeader() });

    expect(res.status).toBe(200);
    expect(mockClient.get).toHaveBeenCalledWith('/api/categories', 'admin-token');
  });

  it('should_return200_when_creatingCategory', async () => {
    vi.mocked(mockClient.post).mockResolvedValue({ data: { id: 'cat-1' } });
    const app = new Hono().route('/', buildCategoriesRouter(mockClient));

    const res = await app.request('/admin/api/categories', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Rings', slug: 'rings' }),
    });

    expect(res.status).toBe(200);
  });
});

describe('Auctions router', () => {
  it('should_return200_when_schedulingAuction', async () => {
    vi.mocked(mockClient.post).mockResolvedValue({ data: { lotId: 'lot-1' } });
    const app = new Hono().route('/', buildAuctionsRouter(mockClient));

    const res = await app.request('/admin/api/auctions', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotId: 'lot-1', startAt: '2026-07-01T10:00:00Z', endAt: '2026-07-01T12:00:00Z', reservePrice: 500, minBidIncrement: 10, autoExtendWindowMinutes: 3, autoExtendDurationMinutes: 3 }),
    });

    expect(res.status).toBe(200);
  });

  it('should_return200_when_listingAuctions', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ data: [] });
    const app = new Hono().route('/', buildAuctionsRouter(mockClient));

    const res = await app.request('/admin/api/auctions', { headers: authHeader() });

    expect(res.status).toBe(200);
  });
});
