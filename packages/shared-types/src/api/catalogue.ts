import { z } from 'zod';
import { envelope, listEnvelope } from './envelope.js';

// ── Response schemas (match apps/catalogue routers exactly) ──

export const catalogueLotImageSchema = z.object({
  id: z.string(),
  lotId: z.string(),
  url: z.string(),
  thumbnailUrl: z.string(),
  displayOrder: z.number(),
  isPrimary: z.boolean(),
});

export const LOT_ACTIVE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const lotActiveStatusSchema = z.enum(LOT_ACTIVE_STATUSES);

export const catalogueLotSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  auctionId: z.string().nullable(),
  categoryId: z.string().nullable(),
  condition: z.enum(['NEW', 'EXCELLENT', 'VERY_GOOD', 'GOOD']).nullable(),
  estimatedValue: z.number().nullable(),
  status: lotActiveStatusSchema,
  images: z.array(catalogueLotImageSchema),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const lotListResponseSchema = listEnvelope(catalogueLotSchema);
export const lotResponseSchema = envelope(catalogueLotSchema);

// GET /api/lots/search items (PostgresSearchRepository.search)
export const lotSearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  estimatedValue: z.number().nullable(),
  categoryId: z.string().nullable(),
});
export const lotSearchResponseSchema = listEnvelope(lotSearchResultSchema);

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  parentId: z.string().nullable(),
  displayOrder: z.number(),
});
export const categoryListResponseSchema = envelope(z.array(categorySchema));

export const auctionStatusSchema = z.enum(['upcoming', 'open', 'closed']);

// GET /api/auctions list items (buildAuctionRouter)
export const catalogueAuctionSchema = z.object({
  id: z.string(),
  title: z.string(),
  saleDate: z.string().nullable(),
  location: z.string().nullable(),
  viewingDates: z.string().nullable(),
  status: auctionStatusSchema,
  lotCount: z.number(),
});
export const auctionListResponseSchema = envelope(z.array(catalogueAuctionSchema));

// GET /api/auctions/:id (no lotCount; has timestamps)
export const auctionResponseSchema = envelope(z.object({
  id: z.string(),
  title: z.string(),
  saleDate: z.string().nullable(),
  location: z.string().nullable(),
  viewingDates: z.string().nullable(),
  status: auctionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}));

// GET /api/lots/facets — deviates from the { data } envelope; documents reality
export const facetsResponseSchema = z.object({
  departments: z.array(z.object({ name: z.string(), count: z.number() })),
  auctions: z.array(z.object({ id: z.string(), title: z.string() })),
});

export type CatalogueLot = z.infer<typeof catalogueLotSchema>;
export type CatalogueLotImage = z.infer<typeof catalogueLotImageSchema>;
export type CatalogueAuction = z.infer<typeof catalogueAuctionSchema>;

// ── Typed query builders — keys are exactly what the routers read ──

function toParams(entries: Record<string, string | number | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  return params;
}

export function lotsQuery(params: {
  auctionId?: string;
  categoryId?: string;
  condition?: 'NEW' | 'EXCELLENT' | 'VERY_GOOD' | 'GOOD';
  minValue?: number;
  maxValue?: number;
  limit?: number;
  offset?: number;
} = {}): URLSearchParams {
  return toParams(params);
}

export function auctionsQuery(params: {
  status?: 'upcoming' | 'open' | 'closed';
  limit?: number;
} = {}): URLSearchParams {
  return toParams(params);
}
