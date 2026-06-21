export interface TokenRepository {
  saveVerificationToken(params: {
    id: string;
    userId: string;
    type: 'EMAIL' | 'PHONE';
    code: string;
    expiresAt: Date;
  }): Promise<void>;

  findVerificationToken(params: {
    userId: string;
    type: 'EMAIL' | 'PHONE';
    code: string;
  }): Promise<{ id: string; expiresAt: Date; usedAt: Date | null } | null>;

  markVerificationTokenUsed(id: string): Promise<void>;

  countRecentPhoneAttempts(userId: string, since: Date): Promise<number>;

  saveRefreshToken(params: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;

  findRefreshToken(tokenHash: string): Promise<{
    id: string;
    userId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  } | null>;

  revokeRefreshToken(id: string): Promise<void>;
}
