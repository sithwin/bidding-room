import {
  lotListResponseSchema, auctionListResponseSchema, auctionResponseSchema,
  type CatalogueLot, type CatalogueAuction,
} from '@carat-room/shared-types';
import type { z } from 'zod';
import type { LotCardProps } from '@/components/primitives/lot-card';

export type { CatalogueLot, CatalogueAuction };
export type AuctionDetail = z.infer<typeof auctionResponseSchema>['data'];

// Transitional shape kept for callers not yet converted to parseLotList (Task 7 removes this).
export interface CatalogueListResponse<T> {
  data?: T[];
  meta?: { total: number; limit: number; offset: number };
}

// Contract boundary: every catalogue response is parsed through the shared
// schema. Drift logs and degrades to the fallback — pages render empty
// states, never crash.
export function parseLotList(json: unknown): { lots: CatalogueLot[]; total?: number } {
  const parsed = lotListResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Catalogue lot list failed contract validation', parsed.error.issues);
    return { lots: [] };
  }
  return { lots: parsed.data.data, total: parsed.data.meta.total };
}

export function parseAuctionList(json: unknown): CatalogueAuction[] {
  const parsed = auctionListResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Catalogue auction list failed contract validation', parsed.error.issues);
    return [];
  }
  return parsed.data.data;
}

export function parseAuction(json: unknown): AuctionDetail | null {
  const parsed = auctionResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Catalogue auction failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data;
}

// Transitional alias — removed in the consumer-conversion task (Task 7)
export function lotsFromResponse(json: unknown): CatalogueLot[] {
  return parseLotList(json).lots;
}

export function primaryImageUrl(lot: CatalogueLot): string | undefined {
  const primary = lot.images.find(img => img.isPrimary) ?? lot.images[0];
  return primary?.thumbnailUrl;
}

export function toLotCardProps(lot: CatalogueLot, fallbackAuctionId: string): LotCardProps {
  return {
    lotId: lot.id,
    auctionId: lot.auctionId ?? fallbackAuctionId,
    title: lot.title,
    imageUrl: primaryImageUrl(lot),
    estimate: lot.estimatedValue ?? undefined,
  };
}
