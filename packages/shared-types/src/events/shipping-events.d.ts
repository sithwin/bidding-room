export interface ItemDispatchedPayload {
    fulfilmentId: string;
    lotId: string;
    userId: string;
    trackingNumber: string;
    carrier: string;
    dispatchedAt: string;
}
export interface ItemCollectedPayload {
    fulfilmentId: string;
    lotId: string;
    userId: string;
    collectedAt: string;
}
//# sourceMappingURL=shipping-events.d.ts.map