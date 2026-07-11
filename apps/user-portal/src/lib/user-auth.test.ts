import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { accessTokenResponseSchema, meResponseSchema } from '@carat-room/shared-types';
import { parseAccessToken, parseMe, errorMessage } from './user-auth';

const accessTokenFixture = {
  data: { accessToken: 'header.payload.signature' },
} satisfies z.infer<typeof accessTokenResponseSchema>;

const meFixture = {
  data: {
    id: 'user-1', email: 'a@b.com', phone: null, status: 'PHONE_VERIFIED', role: 'BUYER', country: null,
  },
} satisfies z.infer<typeof meResponseSchema>;

afterEach(() => vi.restoreAllMocks());

describe('parseAccessToken', () => {
  it('parses the real { data: { accessToken } } envelope', () => {
    const result = parseAccessToken(accessTokenFixture);
    expect(result).toBe('header.payload.signature');
  });

  it('returns null and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parseAccessToken({ accessToken: 'header.payload.signature' });
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('parseMe', () => {
  it('parses the real { data } envelope', () => {
    const result = parseMe(meFixture);
    expect(result?.email).toBe('a@b.com');
    expect(result?.status).toBe('PHONE_VERIFIED');
  });

  it('returns null and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parseMe({ email: 'a@b.com' });
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('errorMessage', () => {
  it('extracts message from the structured { error: { code, message } } shape', () => {
    expect(errorMessage({ error: { code: 'X', message: 'boom' } }, 'fallback')).toBe('boom');
  });

  it('extracts message from the bare { error: string } shape', () => {
    expect(errorMessage({ error: 'bare boom' }, 'fallback')).toBe('bare boom');
  });

  it('returns the fallback when neither error shape matches', () => {
    expect(errorMessage({}, 'fallback')).toBe('fallback');
  });
});
