### Task 3: Infrastructure — DB and token repositories

**Files:**
- Create: `apps/user-auth/src/infrastructure/db/db.ts`
- Create: `apps/user-auth/src/infrastructure/db/postgres-user-repository.ts`
- Create: `apps/user-auth/src/infrastructure/db/postgres-token-repository.ts`
- Test: `apps/user-auth/src/infrastructure/db/postgres-user-repository.test.ts`
- Test: `apps/user-auth/src/infrastructure/db/postgres-token-repository.test.ts`

**Interfaces:**
- Consumes: `User`, `UserStatus`, `UserRole`, `UserProps` from Task 2; `UserRepository` from Task 2
- Produces:
  - `createDb(url)` factory; `Db` type
  - `PostgresUserRepository` implementing `UserRepository`
  - `TokenRepository` interface (exported from `postgres-token-repository.ts`)
  - `PostgresTokenRepository` implementing `TokenRepository`

- [x] **Step 1: Create `apps/user-auth/src/infrastructure/db/db.ts`**

```typescript
import postgres from 'postgres';

export type Db = ReturnType<typeof postgres>;

export function createDb(connectionUrl: string): Db {
  return postgres(connectionUrl);
}
```

- [x] **Step 2: Write failing user repository tests**

Create `apps/user-auth/src/infrastructure/db/postgres-user-repository.test.ts`:

```typescript
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
```

- [x] **Step 3: Run tests to verify they fail**

```bash
cd apps/user-auth && npx vitest run src/infrastructure/db/postgres-user-repository.test.ts
```

Expected: FAIL — `Cannot find module './postgres-user-repository'`

- [x] **Step 4: Implement `PostgresUserRepository`**

Create `apps/user-auth/src/infrastructure/db/postgres-user-repository.ts`:

```typescript
import { Db } from './db';
import { User, UserProps, UserRole, UserStatus } from '../../domain/user';
import { UserRepository } from '../../domain/user-repository';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  phone: string | null;
  status: string;
  role: string;
  country: string | null;
  created_at: Date;
  updated_at: Date;
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db<UserRow[]>`SELECT * FROM users WHERE id = ${id}`;
    return row ? this.toEntity(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db<UserRow[]>`SELECT * FROM users WHERE email = ${email}`;
    return row ? this.toEntity(row) : null;
  }

  async save(user: User): Promise<void> {
    const p = user.toProps();
    await this.db`
      INSERT INTO users (id, email, password_hash, phone, status, role, country, created_at, updated_at)
      VALUES (${p.id}, ${p.email}, ${p.passwordHash}, ${p.phone}, ${p.status}, ${p.role}, ${p.country}, ${p.createdAt}, ${p.updatedAt})
      ON CONFLICT (id) DO UPDATE
        SET phone      = EXCLUDED.phone,
            status     = EXCLUDED.status,
            country    = EXCLUDED.country,
            updated_at = EXCLUDED.updated_at
    `;
  }

  private toEntity(row: UserRow): User {
    const props: UserProps = {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      phone: row.phone,
      status: row.status as UserStatus,
      role: row.role as UserRole,
      country: row.country,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return User.reconstitute(props);
  }
}
```

- [x] **Step 5: Write failing token repository tests**

Create `apps/user-auth/src/infrastructure/db/postgres-token-repository.test.ts`:

```typescript
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
```

- [x] **Step 6: Run tests to verify they fail**

```bash
cd apps/user-auth && npx vitest run src/infrastructure/db/postgres-token-repository.test.ts
```

Expected: FAIL — `Cannot find module './postgres-token-repository'`

- [x] **Step 7: Implement `PostgresTokenRepository`**

Create `apps/user-auth/src/infrastructure/db/postgres-token-repository.ts`:

```typescript
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
```

- [x] **Step 8: Run all DB tests to verify they pass**

First create the test database if it does not exist:

```bash
psql -U postgres -c "CREATE DATABASE users_test;" 2>/dev/null || true
```

Then run the tests:

```bash
cd apps/user-auth && npx vitest run src/infrastructure/db/
```

Expected: all 7 tests PASS

- [x] **Step 9: Commit**

```bash
git add apps/user-auth/src/infrastructure/db/
git commit -m "feat(user-auth): DB repositories with TDD"
```

---

