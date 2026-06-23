import { describe, it, expect } from 'vitest';
import { ExtendDueDateSchema, CancelInvoiceSchema } from './invoice.schema';

describe('ExtendDueDateSchema', () => {
  it('should_pass_when_dueDateIsInFuture', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
    expect(ExtendDueDateSchema.safeParse({ dueAt: future }).success).toBe(true);
  });

  it('should_fail_when_dueDateIsInPast', () => {
    expect(ExtendDueDateSchema.safeParse({ dueAt: '2020-01-01' }).success).toBe(false);
  });
});

describe('CancelInvoiceSchema', () => {
  it('should_pass_when_reasonHasTenChars', () => {
    expect(CancelInvoiceSchema.safeParse({ reason: '1234567890' }).success).toBe(true);
  });

  it('should_fail_when_reasonIsTooShort', () => {
    expect(CancelInvoiceSchema.safeParse({ reason: 'short' }).success).toBe(false);
  });
});
