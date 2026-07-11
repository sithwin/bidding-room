import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { fulfilmentResponseSchema, fulfilmentSuccessResponseSchema } from '@carat-room/shared-types';
import { parseFulfilment, parseFulfilmentSuccess } from './shipping';

const fulfilmentFixture = {
  data: {
    id: 'fulfilment-1',
    lotId: 'lot-1',
    userId: 'user-1',
    method: 'SHIP',
    status: 'PENDING_DISPATCH',
    shippingAddress: {
      id: 'address-1',
      fulfilmentId: 'fulfilment-1',
      fullName: 'Jane Doe',
      line1: '1 Main St',
      line2: null,
      city: 'Sydney',
      state: 'NSW',
      postcode: '2000',
      country: 'AU',
    },
    collectionSlot: null,
  },
} satisfies z.infer<typeof fulfilmentResponseSchema>;

const fulfilmentSuccessFixture = {
  data: { success: true },
} satisfies z.infer<typeof fulfilmentSuccessResponseSchema>;

afterEach(() => vi.restoreAllMocks());

describe('parseFulfilment', () => {
  it('parses the real { data } envelope', () => {
    const result = parseFulfilment(fulfilmentFixture);
    expect(result?.id).toBe('fulfilment-1');
    expect(result?.status).toBe('PENDING_DISPATCH');
  });

  it('returns null and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parseFulfilment({ id: 'fulfilment-1' });
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('parseFulfilmentSuccess', () => {
  it('returns true for the real { data: { success: true } } envelope', () => {
    const result = parseFulfilmentSuccess(fulfilmentSuccessFixture);
    expect(result).toBe(true);
  });

  it('returns false and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parseFulfilmentSuccess({ success: true });
    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});
