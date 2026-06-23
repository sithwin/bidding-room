import { describe, it, expect } from 'vitest';
import { CategoryFormSchema } from './category.schema';

describe('CategoryFormSchema', () => {
  it('should_pass_when_nameAndSlugArePresent', () => {
    expect(CategoryFormSchema.safeParse({ name: 'Rings', slug: 'rings' }).success).toBe(true);
  });

  it('should_pass_when_parentIdIsProvided', () => {
    expect(CategoryFormSchema.safeParse({
      name: 'Solitaire',
      slug: 'solitaire',
      parentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    }).success).toBe(true);
  });

  it('should_fail_when_nameIsEmpty', () => {
    expect(CategoryFormSchema.safeParse({ name: '', slug: 'rings' }).success).toBe(false);
  });

  it('should_fail_when_slugContainsSpaces', () => {
    expect(CategoryFormSchema.safeParse({ name: 'Fine Rings', slug: 'fine rings' }).success).toBe(false);
  });
});
