import type { LotCardProps } from '@/components/primitives/lot-card';

// Shapes returned by the catalogue service — list responses use a { data, meta } envelope
export interface CatalogueLotImage {
  url: string;
  thumbnailUrl: string;
  displayOrder: number;
  isPrimary: boolean;
}

export interface CatalogueLot {
  id: string;
  auctionId: string | null;
  title: string;
  estimatedValue: number | null;
  images: CatalogueLotImage[];
}

export interface CatalogueListResponse<T> {
  data?: T[];
  meta?: { total: number; limit: number; offset: number };
}

export function lotsFromResponse(response: CatalogueListResponse<CatalogueLot> | undefined): CatalogueLot[] {
  return Array.isArray(response?.data) ? response.data : [];
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
