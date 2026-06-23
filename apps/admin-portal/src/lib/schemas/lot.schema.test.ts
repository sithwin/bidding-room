import { describe, it, expect } from 'vitest';
import { LotFormSchema } from './lot.schema';

describe('LotFormSchema', () => {
  const valid = {
    title: 'Diamond Solitaire Ring',
    description: 'Brilliant cut, 1.2ct',
    categoryId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    condition: 'EXCELLENT' as const,
    estimatedValue: 5000,
  };

  it('should_pass_when_allFieldsAreValid', () => {
    expect(LotFormSchema.safeParse(valid).success).toBe(true);
  });

  it('should_fail_when_titleIsEmpty', () => {
    expect(LotFormSchema.safeParse({ ...valid, title: '' }).success).toBe(false);
  });

  it('should_fail_when_estimatedValueIsNegative', () => {
    expect(LotFormSchema.safeParse({ ...valid, estimatedValue: -1 }).success).toBe(false);
  });

  it('should_fail_when_conditionIsInvalid', () => {
    expect(LotFormSchema.safeParse({ ...valid, condition: 'PERFECT' }).success).toBe(false);
  });
});
