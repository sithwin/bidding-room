import { describe, it, expect } from 'vitest';
import { decodeJwtPayload } from './jwt';

describe('decodeJwtPayload', () => {
  it('should_returnPayload_when_tokenIsWellFormed', () => {
    const payload = { userId: 'user-1', email: 'a@b.com', verificationStatus: 'VERIFIED', role: 'BUYER' };
    const token = `header.${btoa(JSON.stringify(payload))}.signature`;

    expect(decodeJwtPayload(token)).toEqual(payload);
  });

  it('should_returnNull_when_tokenIsMalformed', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
  });
});
