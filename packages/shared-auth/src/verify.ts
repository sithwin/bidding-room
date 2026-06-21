import { importSPKI, jwtVerify } from 'jose';
import type { UserStatus, UserRole } from '@carat-room/shared-types';

export interface JwtPayload {
  userId: string;
  email: string;
  verificationStatus: UserStatus;
  role: UserRole;
}

export async function verifyJwt(token: string, publicKeyPem: string): Promise<JwtPayload> {
  const publicKey = await importSPKI(publicKeyPem, 'RS256');
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });

  const userId = payload['userId'];
  const email = payload['email'];
  const verificationStatus = payload['verificationStatus'];
  const role = payload['role'];

  if (
    typeof userId !== 'string' ||
    typeof email !== 'string' ||
    typeof verificationStatus !== 'string' ||
    typeof role !== 'string'
  ) {
    throw new TypeError('JWT payload is missing required claims');
  }

  return {
    userId,
    email,
    verificationStatus: verificationStatus as UserStatus,
    role: role as UserRole,
  };
}
