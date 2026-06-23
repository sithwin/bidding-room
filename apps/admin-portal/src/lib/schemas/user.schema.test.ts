import { describe, it, expect } from 'vitest';
import { SuspendUserSchema } from './user.schema';

describe('SuspendUserSchema', () => {
  it('should_pass_when_reasonHasTenChars', () => {
    expect(SuspendUserSchema.safeParse({ reason: '1234567890' }).success).toBe(true);
  });

  it('should_fail_when_reasonIsTooShort', () => {
    expect(SuspendUserSchema.safeParse({ reason: 'short' }).success).toBe(false);
  });
});
