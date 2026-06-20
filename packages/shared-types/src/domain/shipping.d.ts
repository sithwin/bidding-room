export type FulfilmentMethod = 'SHIP' | 'COLLECT';
export type FulfilmentStatus = 'PENDING_CHOICE' | 'PENDING_DISPATCH' | 'DISPATCHED' | 'COLLECTED';
export interface ShippingAddress {
    id: string;
    fulfilmentId: string;
    fullName: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string | null;
    postcode: string;
    country: string;
}
export interface CollectionSlot {
    id: string;
    fulfilmentId: string;
    location: string;
    date: string;
    timeSlot: string;
}
export interface Fulfilment {
    id: string;
    lotId: string;
    userId: string;
    method: FulfilmentMethod | null;
    status: FulfilmentStatus;
    createdAt: string;
    updatedAt: string;
}
//# sourceMappingURL=shipping.d.ts.map