import { describe, it, expect } from 'vitest';
import {
  lotListResponseSchema, auctionListResponseSchema, facetsResponseSchema,
  lotsQuery, auctionsQuery,
} from './catalogue.js';

const lotFixture = {
  id: 'lot-1', title: 'Cartier Love Ring', description: null, auctionId: 'auction-1',
  categoryId: null, condition: 'EXCELLENT', estimatedValue: 3000,
  images: [{ id: 'img-1', lotId: 'lot-1', url: 'https://a/x.jpg', thumbnailUrl: 'https://a/t.jpg', displayOrder: 0, isPrimary: true }],
  createdBy: null, createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z',
};

describe('catalogue schemas', () => {
  it('should_parseLotListEnvelope', () => {
    const parsed = lotListResponseSchema.parse({ data: [lotFixture], meta: { total: 1, limit: 20, offset: 0 } });
    expect(parsed.data[0].auctionId).toBe('auction-1');
  });

  it('should_rejectImaginedLotsShape', () => {
    expect(lotListResponseSchema.safeParse({ lots: [lotFixture] }).success).toBe(false);
  });

  it('should_parseAuctionList', () => {
    const parsed = auctionListResponseSchema.parse({
      data: [{ id: 'a1', title: 'June Sale', saleDate: '2026-07-20T10:00:00.000Z', location: 'Sydney', viewingDates: null, status: 'upcoming', lotCount: 42 }],
    });
    expect(parsed.data[0].lotCount).toBe(42);
  });

  it('should_parseFacets', () => {
    // facets deviates from the { data } envelope — schema documents reality
    const parsed = facetsResponseSchema.parse({ departments: [{ name: 'Jewellery', count: 3 }], auctions: [{ id: 'a1', title: 'June Sale' }] });
    expect(parsed.departments[0].count).toBe(3);
  });
});

describe('query builders', () => {
  it('should_buildLotsQueryWithBackendParamNames', () => {
    const qs = lotsQuery({ auctionId: 'a1', minValue: 100, maxValue: 500, limit: 24, offset: 24 });
    expect(qs.get('auctionId')).toBe('a1');
    expect(qs.get('minValue')).toBe('100');
    expect(qs.get('offset')).toBe('24');
    // the drifted names must not exist
    expect(qs.get('page')).toBeNull();
    expect(qs.get('minPrice')).toBeNull();
  });

  it('should_omitUndefinedParams', () => {
    expect(auctionsQuery({ status: 'upcoming' }).toString()).toBe('status=upcoming');
  });
});
