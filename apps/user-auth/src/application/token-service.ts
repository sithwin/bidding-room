import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { UserRole, UserStatus } from '../domain/user';

export interface AccessTokenPayload {
  userId: string;
  email: string;
  verificationStatus: UserStatus;
  role: UserRole;
}

const ACCESS_TOKEN_TTL = '15m';

export class TokenService {
  private readonly privateKeyPem: string;
  private readonly publicKeyPem: string;

  constructor(keys: { privateKeyPem: string; publicKeyPem: string }) {
    this.privateKeyPem = keys.privateKeyPem;
    this.publicKeyPem = keys.publicKeyPem;
  }

  issueAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, this.privateKeyPem, {
      algorithm: 'RS256',
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, this.publicKeyPem, { algorithms: ['RS256'] });
    return decoded as AccessTokenPayload;
  }

  issueRefreshToken(): string {
    return randomBytes(48).toString('hex');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
