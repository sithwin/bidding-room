import { describe, expect, it } from 'vitest';
import {
  chooseShipRequestSchema,
  fulfilmentResponseSchema,
  fulfilmentsQuery,
  fulfilmentSuccessResponseSchema,
} from './shipping';

describe('shipping contract schemas', () => {
  it('parses a pending fulfilment with null method, address and slot', () => {
    const body = fulfilmentResponseSchema.parse({
      data: {
        id: 'f1', lotId: 'lot-1', userId: 'u1', method: null,
        status: 'PENDING_CHOICE', shippingAddress: null, collectionSlot: null,
      },
    });
    expect(body.data.method).toBeNull();
  });

  it('parses a SHIP fulfilment with nullable line2/state on the address', () => {
    const body = fulfilmentResponseSchema.parse({
      data: {
        id: 'f1', lotId: 'lot-1', userId: 'u1', method: 'SHIP', status: 'PENDING_DISPATCH',
        shippingAddress: {
          id: 'a1', fulfilmentId: 'f1', fullName: 'Jane Doe', line1: '1 Pitt St',
          line2: null, city: 'Sydney', state: null, postcode: '2000', country: 'AU',
        },
        collectionSlot: null,
      },
    });
    expect(body.data.shippingAddress?.line2).toBeNull();
  });

  it('parses the { data: { success: true } } mutation response', () => {
    expect(fulfilmentSuccessResponseSchema.parse({ data: { success: true } }).data.success).toBe(true);
  });

  it('chooseShipRequest requires exactly the fields the router validates', () => {
    expect(chooseShipRequestSchema.safeParse({ fullName: 'J', line1: '1', city: 'S', postcode: '2', country: 'AU' }).success).toBe(true);
    expect(chooseShipRequestSchema.safeParse({ fullName: 'J' }).success).toBe(false);
  });
});

describe('fulfilmentsQuery', () => {
  it('emits exactly the status param the router reads', () => {
    expect(fulfilmentsQuery({ status: 'DISPATCHED' }).toString()).toBe('status=DISPATCHED');
    expect(fulfilmentsQuery({}).toString()).toBe('');
  });
});
