import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { auctionListResponseSchema, auctionResponseSchema, auctionsQuery } from '@carat-room/shared-types';
import { buildAuctionRouter } from './auction-router';
import { Auction } from '../domain/auction';

function buildAuction(overrides: Partial<{ id: string; status: 'upcoming' | 'open' | 'closed' }> = {}): Auction {
  return new Auction({
    id: overrides.id ?? 'auction-1',
    title: 'June Fine Jewellery Sale',
    saleDate: new Date('2026-07-20T10:00:00Z'),
    location: 'Sydney',
    viewingDates: '18–19 July',
    status: overrides.status ?? 'upcoming',
    createdAt: new Date('2026-06-20T00:00:00Z'),
    updatedAt: new Date('2026-06-20T00:00:00Z'),
  });
}

function buildDeps(overrides: Record<string, unknown> = {}) {
  return {
    auctionRepository: {
      findById: vi.fn().mockResolvedValue(null),
      findAll: vi.fn().mockResolvedValue([]),
      ...overrides,
    },
  };
}

describe('GET /api/auctions', () => {
  it('should_return200WithAuctionsAndLotCounts', async () => {
    const deps = buildDeps({
      findAll: vi.fn().mockResolvedValue([{ auction: buildAuction(), lotCount: 42 }]),
    });
    const app = new Hono().route('/', buildAuctionRouter(deps));

    const res = await app.request('/api/auctions');

    expect(res.status).toBe(200);
    const body = auctionListResponseSchema.parse(await res.json());
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('auction-1');
    expect(body.data[0].title).toBe('June Fine Jewellery Sale');
    expect(body.data[0].saleDate).toBe('2026-07-20T10:00:00.000Z');
    expect(body.data[0].lotCount).toBe(42);
  });

  it('should_passStatusFilterAndLimit_when_provided', async () => {
    const findAll = vi.fn().mockResolvedValue([]);
    const app = new Hono().route('/', buildAuctionRouter(buildDeps({ findAll })));

    const res = await app.request(`/api/auctions?${auctionsQuery({ status: 'upcoming', limit: 3 })}`);

    expect(res.status).toBe(200);
    expect(findAll).toHaveBeenCalledWith('upcoming', 3);
  });

  it('should_ignoreInvalidStatus', async () => {
    const findAll = vi.fn().mockResolvedValue([]);
    const app = new Hono().route('/', buildAuctionRouter(buildDeps({ findAll })));

    const res = await app.request('/api/auctions?status=bogus');

    expect(res.status).toBe(200);
    expect(findAll).toHaveBeenCalledWith(undefined, 20);
  });
});

describe('GET /api/auctions/:id', () => {
  it('should_return200WithAuction_when_auctionExists', async () => {
    const deps = buildDeps({ findById: vi.fn().mockResolvedValue(buildAuction()) });
    const app = new Hono().route('/', buildAuctionRouter(deps));

    const res = await app.request('/api/auctions/auction-1');

    expect(res.status).toBe(200);
    const body = auctionResponseSchema.parse(await res.json());
    expect(body.data.id).toBe('auction-1');
  });

  it('should_return404_when_auctionDoesNotExist', async () => {
    const app = new Hono().route('/', buildAuctionRouter(buildDeps()));

    const res = await app.request('/api/auctions/nonexistent');

    expect(res.status).toBe(404);
  });
});
