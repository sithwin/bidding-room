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

  return {
    userId: payload['userId'] as string,
    email: payload['email'] as string,
    verificationStatus: payload['verificationStatus'] as UserStatus,
    role: payload['role'] as UserRole,
  };
}
