import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgresTokenRepository } from './postgres-token-repository';
import { createDb, Db } from './db';
import { v4 as uuidv4 } from 'uuid';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/users_test';

describe('PostgresTokenRepository', () => {
  let db: Db;
  let repo: PostgresTokenRepository;
  let userId: string;

  beforeAll(async () => {
    db = createDb(TEST_DB_URL);
    repo = new PostgresTokenRepository(db);
    await db`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'REGISTERED',
        role TEXT NOT NULL DEFAULT 'BUYER',
        country TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS verification_tokens (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id),
        type TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      )
    `;
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db`TRUNCATE verification_tokens, refresh_tokens, users CASCADE`;
    userId = uuidv4();
    await db`
      INSERT INTO users (id, email, password_hash, status, role)
      VALUES (${userId}, ${`user-${userId}@example.com`}, 'hash', 'REGISTERED', 'BUYER')
    `;
  });

  it('should_saveAndFindVerificationToken_when_tokenCreated', async () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await repo.saveVerificationToken({
      id: uuidv4(),
      userId,
      type: 'EMAIL',
      code: '123456',
      expiresAt,
    });

    const found = await repo.findVerificationToken({ userId, type: 'EMAIL', code: '123456' });

    expect(found).not.toBeNull();
    expect(found!.usedAt).toBeNull();
  });

  it('should_markTokenUsed_when_markVerificationTokenUsedCalled', async () => {
    const id = uuidv4();
    await repo.saveVerificationToken({
      id,
      userId,
      type: 'EMAIL',
      code: '654321',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    await repo.markVerificationTokenUsed(id);
    const found = await repo.findVerificationToken({ userId, type: 'EMAIL', code: '654321' });

    expect(found!.usedAt).not.toBeNull();
  });

  it('should_saveAndFindRefreshToken_when_tokenCreated', async () => {
    const id = uuidv4();
    await repo.saveRefreshToken({
      id,
      userId,
      tokenHash: 'hashed-token-value',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const found = await repo.findRefreshToken('hashed-token-value');

    expect(found).not.toBeNull();
    expect(found!.userId).toBe(userId);
    expect(found!.revokedAt).toBeNull();
  });

  it('should_revokeRefreshToken_when_revokeRefreshTokenCalled', async () => {
    const id = uuidv4();
    await repo.saveRefreshToken({
      id,
      userId,
      tokenHash: 'revoke-me',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await repo.revokeRefreshToken(id);
    const found = await repo.findRefreshToken('revoke-me');

    expect(found!.revokedAt).not.toBeNull();
  });
});
