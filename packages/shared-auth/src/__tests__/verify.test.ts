import { describe, it, expect } from 'vitest';
import { SignJWT, generateKeyPair, exportSPKI } from 'jose';
import { verifyJwt } from '../verify.js';

async function buildKeys() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicKeyPem = await exportSPKI(publicKey);
  return { privateKey, publicKeyPem };
}

describe('verifyJwt', () => {
  it('should_returnPayload_when_tokenIsValid', async () => {
    const { privateKey, publicKeyPem } = await buildKeys();

    const token = await new SignJWT({
      userId: 'user-123',
      email: 'test@example.com',
      verificationStatus: 'APPROVED_BIDDER',
      role: 'BUYER',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    const payload = await verifyJwt(token, publicKeyPem);

    expect(payload.userId).toBe('user-123');
    expect(payload.email).toBe('test@example.com');
    expect(payload.verificationStatus).toBe('APPROVED_BIDDER');
    expect(payload.role).toBe('BUYER');
  });

  it('should_throwError_when_tokenIsExpired', async () => {
    const { privateKey, publicKeyPem } = await buildKeys();

    const token = await new SignJWT({
      userId: 'user-123',
      email: 'test@example.com',
      verificationStatus: 'APPROVED_BIDDER',
      role: 'BUYER',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('-1s')
      .sign(privateKey);

    await expect(verifyJwt(token, publicKeyPem)).rejects.toThrow();
  });

  it('should_throwError_when_tokenSignatureIsInvalid', async () => {
    const { publicKeyPem } = await buildKeys();
    const { privateKey: otherKey } = await buildKeys();

    const token = await new SignJWT({
      userId: 'user-123',
      email: 'test@example.com',
      verificationStatus: 'APPROVED_BIDDER',
      role: 'BUYER',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(otherKey);

    await expect(verifyJwt(token, publicKeyPem)).rejects.toThrow();
  });
});
