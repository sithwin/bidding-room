export interface LotImageUploadedPayload {
  jobId: string;
  storageKey: string;
}

export interface LotImageProcessedPayload {
  jobId: string;
  thumbnailKey?: string;
}

export type LotImageRejectionReason = 'virus_detected' | 'processing_failed';

export interface LotImageRejectedPayload {
  jobId: string;
  reason: LotImageRejectionReason;
}
