import { describe, it, expect } from 'vitest';
import { PasswordService } from './password-service';
import { TokenService } from './token-service';
import { OtpService } from './otp-service';
import { UserRole, UserStatus } from '../domain/user';
import { generateKeyPairSync } from 'crypto';

describe('PasswordService', () => {
  const sut = new PasswordService();

  it('should_returnTrue_when_plainMatchesHash', async () => {
    const hash = await sut.hash('secret123');

    const result = await sut.verify('secret123', hash);

    expect(result).toBe(true);
  });

  it('should_returnFalse_when_plainDoesNotMatchHash', async () => {
    const hash = await sut.hash('secret123');

    const result = await sut.verify('wrong', hash);

    expect(result).toBe(false);
  });
});

describe('TokenService', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  const sut = new TokenService({ privateKeyPem, publicKeyPem });

  it('should_issueAndVerifyAccessToken', () => {
    const payload = {
      userId: 'u-1',
      email: 'jane@example.com',
      verificationStatus: UserStatus.APPROVED_BIDDER,
      role: UserRole.BUYER,
    };

    const token = sut.issueAccessToken(payload);
    const decoded = sut.verifyAccessToken(token);

    expect(decoded.userId).toBe('u-1');
    expect(decoded.email).toBe('jane@example.com');
  });

  it('should_throwError_when_tokenIsInvalid', () => {
    expect(() => sut.verifyAccessToken('bad.token.value')).toThrow();
  });

  it('should_issueOpaqueRefreshToken', () => {
    const token = sut.issueRefreshToken();

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(32);
  });
});

describe('OtpService', () => {
  const sut = new OtpService();

  it('should_generateSixDigitString', () => {
    const otp = sut.generate();

    expect(otp).toMatch(/^\d{6}$/);
  });
});
