export type FulfilmentMethod = 'SHIP' | 'COLLECT';

export type FulfilmentStatus =
  | 'PENDING_CHOICE'
  | 'PENDING_DISPATCH'
  | 'DISPATCHED'
  | 'COLLECTED';

export interface ShippingAddress {
  id: string;
  fulfilmentId: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postcode: string;
  country: string;           // ISO 3166-1 alpha-2
}

export interface CollectionSlot {
  id: string;
  fulfilmentId: string;
  location: string;
  date: string;              // YYYY-MM-DD
  timeSlot: string;          // e.g. '10:00-11:00'
}

export interface Fulfilment {
  id: string;
  lotId: string;
  userId: string;
  method: FulfilmentMethod | null;
  status: FulfilmentStatus;
  createdAt: string;         // ISO 8601
  updatedAt: string;         // ISO 8601
}
