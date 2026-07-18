import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgresUserRepository } from './postgres-user-repository';
import { createDb, Db } from './db';
import { User, UserRole, UserStatus } from '../../domain/user';
import { v4 as uuidv4 } from 'uuid';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/users_test';

describe('PostgresUserRepository', () => {
  let db: Db;
  let repo: PostgresUserRepository;

  beforeAll(async () => {
    db = createDb(TEST_DB_URL);
    repo = new PostgresUserRepository(db);
    await db`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'REGISTERED',
        role TEXT NOT NULL DEFAULT 'BUYER',
        country TEXT,
        identity_document_key TEXT,
        google_id TEXT,
        auth_provider TEXT NOT NULL DEFAULT 'PASSWORD',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await db`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL
    `;
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db`TRUNCATE users CASCADE`;
  });

  it('should_saveAndFindById_when_userCreated', async () => {
    const user = User.create({
      id: uuidv4(),
      email: 'jane@example.com',
      passwordHash: 'hash',
      role: UserRole.BUYER,
    });

    await repo.save(user);
    const found = await repo.findById(user.id);

    expect(found).not.toBeNull();
    expect(found!.email).toBe('jane@example.com');
    expect(found!.status).toBe(UserStatus.REGISTERED);
  });

  it('should_findByEmail_when_userExists', async () => {
    const user = User.create({
      id: uuidv4(),
      email: 'bob@example.com',
      passwordHash: 'hash',
      role: UserRole.BUYER,
    });
    await repo.save(user);

    const found = await repo.findByEmail('bob@example.com');

    expect(found).not.toBeNull();
    expect(found!.id).toBe(user.id);
  });

  it('should_returnNull_when_userNotFound', async () => {
    const found = await repo.findById(uuidv4());
    expect(found).toBeNull();
  });

  it('should_findUser_when_googleIdMatches', async () => {
    const userId = uuidv4();
    const user = User.createFromGoogle({
      id: userId,
      email: 'google.user@example.com',
      googleId: 'google-sub-abc',
      role: UserRole.BUYER,
    });
    await repo.save(user);

    const found = await repo.findByGoogleId('google-sub-abc');

    expect(found?.id).toBe(userId);
    expect(found?.authProvider).toBe('GOOGLE');
    expect(found?.passwordHash).toBeNull();
  });

  it('should_returnNull_when_noUserHasThatGoogleId', async () => {
    const found = await repo.findByGoogleId('nonexistent-sub');

    expect(found).toBeNull();
  });

  it('should_persistLinkedGoogleAccount_when_saved', async () => {
    const userId = uuidv4();
    const user = User.create({ id: userId, email: 'pw.user@example.com', passwordHash: 'h', role: UserRole.BUYER });
    await repo.save(user);

    user.linkGoogleAccount('google-sub-def');
    await repo.save(user);

    const found = await repo.findByGoogleId('google-sub-def');
    expect(found?.id).toBe(userId);
    expect(found?.authProvider).toBe('BOTH');
    expect(found?.passwordHash).toBe('h');
  });
});
