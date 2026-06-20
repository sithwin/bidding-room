export interface ItemDispatchedPayload {
  fulfilmentId: string;
  lotId: string;
  userId: string;
  trackingNumber: string;
  carrier: string;
  dispatchedAt: string; // ISO 8601
}

export interface ItemCollectedPayload {
  fulfilmentId: string;
  lotId: string;
  userId: string;
  collectedAt: string; // ISO 8601
}
