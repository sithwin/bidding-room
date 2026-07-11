export type LotCondition = 'NEW' | 'EXCELLENT' | 'VERY_GOOD' | 'GOOD';

export interface LotImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  displayOrder: number;
  isPrimary: boolean;
  processingStatus: 'pending' | 'ready' | 'rejected';
  rejectionReason: 'virus_detected' | 'processing_failed' | null;
}

export interface Lot {
  id: string;
  title: string;
  description: string | null;
  categoryId: string;
  condition: LotCondition | null;
  estimatedValue: number | null;
  images: LotImage[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
