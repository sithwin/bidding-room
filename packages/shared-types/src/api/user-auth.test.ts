import { describe, expect, it } from 'vitest';
import {
  accessTokenResponseSchema,
  adminUserDetailSchema,
  meResponseSchema,
  messageResponseSchema,
  usersQuery,
} from './user-auth';

describe('user-auth contract schemas', () => {
  it('parses the login/refresh envelope', () => {
    expect(accessTokenResponseSchema.parse({ data: { accessToken: 'jwt' } }).data.accessToken).toBe('jwt');
  });

  it('rejects the imagined flat { accessToken, user } shape', () => {
    expect(accessTokenResponseSchema.safeParse({ accessToken: 'jwt', user: {} }).success).toBe(false);
  });

  it('parses GET /me with nullable phone and country', () => {
    const body = meResponseSchema.parse({
      data: { id: 'u1', email: 'a@b.c', phone: null, status: 'EMAIL_VERIFIED', role: 'BUYER', country: null, hasPassword: true },
    });
    expect(body.data.phone).toBeNull();
  });

  it('should_includeHasPassword_when_parsingMeResponse', () => {
    const body = meResponseSchema.parse({
      data: {
        id: 'u-1',
        email: 'jane@example.com',
        phone: null,
        status: 'EMAIL_VERIFIED',
        role: 'BUYER',
        country: null,
        hasPassword: false,
      },
    });
    expect(body.data.hasPassword).toBe(false);
  });

  it('parses message envelopes', () => {
    expect(messageResponseSchema.parse({ data: { message: 'OTP sent.' } }).data.message).toBe('OTP sent.');
  });

  it('parses an admin detail row with ISO registeredAt and verification booleans', () => {
    const row = adminUserDetailSchema.parse({
      id: 'u1', email: 'a@b.c', status: 'APPROVED_BIDDER', country: 'AU',
      registeredAt: '2026-07-01T00:00:00.000Z', emailVerified: true, phoneVerified: true,
    });
    expect(row.phoneVerified).toBe(true);
  });
});

describe('usersQuery', () => {
  it('emits exactly the params the admin router reads', () => {
    expect(usersQuery({ status: 'SUSPENDED', search: 'jane' }).toString()).toBe('status=SUSPENDED&search=jane');
  });

  it('omits absent params', () => {
    expect(usersQuery({}).toString()).toBe('');
  });
});
