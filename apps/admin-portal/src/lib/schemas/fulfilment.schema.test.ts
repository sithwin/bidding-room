import { describe, it, expect } from 'vitest';
import { MarkDispatchedSchema } from './fulfilment.schema';

describe('MarkDispatchedSchema', () => {
  it('should_pass_when_trackingAndCarrierArePresent', () => {
    expect(MarkDispatchedSchema.safeParse({ trackingNumber: 'TRK123456', carrier: 'DHL' }).success).toBe(true);
  });

  it('should_fail_when_trackingNumberIsEmpty', () => {
    expect(MarkDispatchedSchema.safeParse({ trackingNumber: '', carrier: 'DHL' }).success).toBe(false);
  });

  it('should_fail_when_carrierIsEmpty', () => {
    expect(MarkDispatchedSchema.safeParse({ trackingNumber: 'TRK123456', carrier: '' }).success).toBe(false);
  });
});
