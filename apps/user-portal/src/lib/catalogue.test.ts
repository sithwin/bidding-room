import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { lotListResponseSchema, auctionListResponseSchema, auctionResponseSchema } from '@carat-room/shared-types';
import { parseLotList, parseAuctionList, parseAuction, toLotCardProps } from './catalogue';

// Fixture typed against the real contract — drifts fail at compile time (C9)
const lotFixture = {
  id: 'lot-1', title: 'Cartier Love Ring', description: null, auctionId: 'auction-1',
  categoryId: null, condition: 'EXCELLENT', estimatedValue: 3000,
  images: [{ id: 'img-1', lotId: 'lot-1', url: '/x.jpg', thumbnailUrl: '/t.jpg', displayOrder: 0, isPrimary: true }],
  createdBy: null, createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z',
} satisfies z.infer<typeof lotListResponseSchema>['data'][number];

const auctionFixture = {
  id: 'auction-1', title: 'June Contemporary Jewellery', saleDate: '2026-06-20T00:00:00.000Z',
  location: 'London', viewingDates: '2026-06-15 - 2026-06-19', status: 'upcoming',
  createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
} satisfies z.infer<typeof auctionResponseSchema>['data'];

afterEach(() => vi.restoreAllMocks());

describe('parseLotList', () => {
  it('parses the real { data, meta } envelope', () => {
    const result = parseLotList({ data: [lotFixture], meta: { total: 1, limit: 24, offset: 0 } });
    expect(result.lots).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('returns the fallback and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parseLotList({ lots: [lotFixture] });
    expect(result.lots).toEqual([]);
    expect(result.total).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('parseAuctionList', () => {
  it('parses the real { data, meta } envelope', () => {
    const catalogueAuctionFixture = {
      id: 'auction-1', title: 'June Contemporary Jewellery', saleDate: '2026-06-20T00:00:00.000Z',
      location: 'London', viewingDates: '2026-06-15 - 2026-06-19', status: 'open', lotCount: 42,
    };
    const result = parseAuctionList({ data: [catalogueAuctionFixture], meta: { total: 1, limit: 10, offset: 0 } });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('auction-1');
    expect(result[0].lotCount).toBe(42);
  });

  it('returns the fallback and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parseAuctionList({ auctions: [] });
    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('parseAuction', () => {
  it('parses the real { data } envelope', () => {
    const result = parseAuction({ data: auctionFixture });
    expect(result).not.toBeNull();
    expect(result?.id).toBe('auction-1');
    expect(result?.title).toBe('June Contemporary Jewellery');
    expect(result?.status).toBe('upcoming');
  });

  it('returns null and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parseAuction({ auction: auctionFixture });
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('toLotCardProps', () => {
  it('maps the primary image and estimate', () => {
    const props = toLotCardProps(lotFixture, 'fallback');
    expect(props.auctionId).toBe('auction-1');
    expect(props.imageUrl).toBe('/t.jpg');
    expect(props.estimate).toBe(3000);
  });
});
