import { Db } from './db';

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

interface VerificationTokenRow {
  id: string;
  user_id: string;
  type: string;
  code: string;
  expires_at: Date;
  used_at: Date | null;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
}

export class PostgresTokenRepository implements TokenRepository {
  constructor(private readonly db: Db) {}

  async saveVerificationToken(params: {
    id: string;
    userId: string;
    type: 'EMAIL' | 'PHONE';
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.db`
      INSERT INTO verification_tokens (id, user_id, type, code, expires_at)
      VALUES (${params.id}, ${params.userId}, ${params.type}, ${params.code}, ${params.expiresAt})
    `;
  }

  async findVerificationToken(params: {
    userId: string;
    type: 'EMAIL' | 'PHONE';
    code: string;
  }): Promise<{ id: string; expiresAt: Date; usedAt: Date | null } | null> {
    const [row] = await this.db<VerificationTokenRow[]>`
      SELECT * FROM verification_tokens
      WHERE user_id = ${params.userId}
        AND type    = ${params.type}
        AND code    = ${params.code}
      ORDER BY expires_at DESC
      LIMIT 1
    `;
    if (!row) return null;
    return { id: row.id, expiresAt: row.expires_at, usedAt: row.used_at };
  }

  async markVerificationTokenUsed(id: string): Promise<void> {
    await this.db`UPDATE verification_tokens SET used_at = NOW() WHERE id = ${id}`;
  }

  async countRecentPhoneAttempts(userId: string, since: Date): Promise<number> {
    const [{ count }] = await this.db<[{ count: string }]>`
      SELECT COUNT(*) AS count
      FROM verification_tokens
      WHERE user_id  = ${userId}
        AND type     = 'PHONE'
        AND expires_at > ${since}
    `;
    return Number(count);
  }

  async saveRefreshToken(params: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.db`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES (${params.id}, ${params.userId}, ${params.tokenHash}, ${params.expiresAt})
    `;
  }

  async findRefreshToken(tokenHash: string): Promise<{
    id: string;
    userId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  } | null> {
    const [row] = await this.db<RefreshTokenRow[]>`
      SELECT * FROM refresh_tokens WHERE token_hash = ${tokenHash}
    `;
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await this.db`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ${id}`;
  }
}
