import { describe, it, expect } from 'vitest';
import { pendingFulfilmentCountResponseSchema } from './shipping-reports.js';

describe('pendingFulfilmentCountResponseSchema', () => {
  it('should_parsePendingFulfilmentCountEnvelope', () => {
    const parsed = pendingFulfilmentCountResponseSchema.parse({ data: { count: 7 } });
    expect(parsed.data.count).toBe(7);
  });

  it('should_rejectMissingData', () => {
    expect(pendingFulfilmentCountResponseSchema.safeParse({ count: 7 }).success).toBe(false);
  });
});
