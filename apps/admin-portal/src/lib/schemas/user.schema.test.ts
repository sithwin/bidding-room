import { describe, it, expect } from 'vitest';
import { SuspendUserSchema, CreateUserSchema, UpdateUserSchema } from './user.schema';

describe('SuspendUserSchema', () => {
  it('should_pass_when_reasonHasTenChars', () => {
    expect(SuspendUserSchema.safeParse({ reason: '1234567890' }).success).toBe(true);
  });

  it('should_fail_when_reasonIsTooShort', () => {
    expect(SuspendUserSchema.safeParse({ reason: 'short' }).success).toBe(false);
  });
});

describe('CreateUserSchema', () => {
  it('accepts a valid payload', () => {
    const result = CreateUserSchema.safeParse({
      email: 'buyer@example.com', password: 'CorrectHorse9!Battery', role: 'BUYER', country: 'GB',
    });
    expect(result.success).toBe(true);
  });

  it('treats an empty country as undefined', () => {
    const result = CreateUserSchema.safeParse({
      email: 'buyer@example.com', password: 'CorrectHorse9!Battery', role: 'BUYER', country: '',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.country).toBeUndefined();
  });

  it('rejects a short password and a bad role', () => {
    expect(CreateUserSchema.safeParse({ email: 'a@b.com', password: 'short', role: 'BUYER' }).success).toBe(false);
    expect(CreateUserSchema.safeParse({ email: 'a@b.com', password: 'CorrectHorse9!Battery', role: 'ROOT' }).success).toBe(false);
  });
});

describe('UpdateUserSchema', () => {
  it('accepts email and country', () => {
    expect(UpdateUserSchema.safeParse({ email: 'a@b.com', country: 'GB' }).success).toBe(true);
  });
  it('rejects an invalid email', () => {
    expect(UpdateUserSchema.safeParse({ email: 'nope', country: 'GB' }).success).toBe(false);
  });
});
