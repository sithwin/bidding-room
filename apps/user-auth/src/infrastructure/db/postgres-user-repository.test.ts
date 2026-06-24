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
        password_hash TEXT NOT NULL,
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'REGISTERED',
        role TEXT NOT NULL DEFAULT 'BUYER',
        country TEXT,
        identity_document_key TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
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
});
