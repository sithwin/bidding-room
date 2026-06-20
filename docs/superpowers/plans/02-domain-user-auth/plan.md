# User Auth Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the User Auth Service — a Hono microservice handling registration, email verification, login, JWT issuance, refresh token rotation, logout, phone OTP verification, and profile management.

**Architecture:** Clean Architecture (domain → application → infrastructure → presentation). The domain layer holds the `User` aggregate and `UserRepository` interface with zero framework imports. Infrastructure adapters implement interfaces defined in the domain/application layers. JWT signing is RS256 — private key signs tokens, public key verifies them (shared with all other services via `@carat-room/shared-auth`).

**Tech Stack:** Node.js 20, TypeScript 5.4, Hono, postgres.js, Vitest, bcrypt, jsonwebtoken, @carat-room/shared-types, @carat-room/shared-events, @carat-room/shared-auth

## Global Constraints

- All files TypeScript with strict mode; no `any`
- Hono only — no Express, no Fastify
- postgres.js for DB access — no ORM
- Vitest for all tests — no Jest
- Named exports only — no `export default`
- Single quotes for all string literals
- `const`/`let` only — no `var`
- JWT: RS256, 15-minute access token, 30-day refresh token stored as hash in DB
- Phone OTP: 6-digit code, 10-minute expiry, max 3 attempts then 15-minute lockout
- Port: 3000
- Service name in monorepo: `apps/user-auth`
- Database name: `users`

---

### Task 1: Package scaffold and DB migration

**Files:**
- Create: `apps/user-auth/package.json`
- Create: `apps/user-auth/tsconfig.json`
- Create: `apps/user-auth/vitest.config.ts`
- Create: `apps/user-auth/migrations/001_create_users.sql`

**Interfaces:**
- Produces: runnable `vitest` and `tsc --noEmit` commands with zero errors

- [ ] **Step 1: Create `apps/user-auth/package.json`**

```json
{
  "name": "@carat-room/user-auth",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc --build",
    "start": "node dist/main.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@carat-room/shared-auth": "workspace:*",
    "@carat-room/shared-events": "workspace:*",
    "@carat-room/shared-types": "workspace:*",
    "hono": "^4.4.0",
    "postgres": "^3.4.4",
    "@hono/node-server": "^1.12.0",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "@types/bcrypt": "^5.0.2",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.16.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `apps/user-auth/tsconfig.json`**

```json
{
  "extends": "@carat-room/tsconfig/service.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `apps/user-auth/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create `apps/user-auth/migrations/001_create_users.sql`**

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  phone           TEXT,
  status          TEXT NOT NULL DEFAULT 'REGISTERED',
  -- REGISTERED | EMAIL_VERIFIED | APPROVED_BIDDER | SUSPENDED
  role            TEXT NOT NULL DEFAULT 'BUYER',
  -- BUYER | ADMIN
  country         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE verification_tokens (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,  -- EMAIL | PHONE
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_users_email               ON users(email);
CREATE INDEX idx_verification_tokens_user  ON verification_tokens(user_id);
CREATE INDEX idx_refresh_tokens_user       ON refresh_tokens(user_id);
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/user-auth && npx tsc --noEmit
```

Expected: no errors (config-only validation, no source files yet)

- [ ] **Step 6: Commit**

```bash
git add apps/user-auth/
git commit -m "feat(user-auth): scaffold package and DB migration"
```

---

### Task 2: Domain layer — User aggregate

**Files:**
- Create: `apps/user-auth/src/domain/user.ts`
- Create: `apps/user-auth/src/domain/user-repository.ts`
- Test: `apps/user-auth/src/domain/user.test.ts`

**Interfaces:**
- Produces:
  - `UserStatus` enum: `REGISTERED | EMAIL_VERIFIED | APPROVED_BIDDER | SUSPENDED`
  - `UserRole` enum: `BUYER | ADMIN`
  - `User` entity with `verifyEmail()`, `requestPhoneVerification(phone)`, `verifyPhone()`, `suspend()`, `updateProfile(patch)` methods
  - `UserRepository` interface

- [ ] **Step 1: Write failing tests**

Create `apps/user-auth/src/domain/user.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { User, UserStatus, UserRole } from './user';

const makeUser = () =>
  User.create({
    id: 'u-1',
    email: 'jane@example.com',
    passwordHash: 'hashed',
    role: UserRole.BUYER,
  });

describe('User', () => {
  describe('verifyEmail', () => {
    it('should_setStatusToEmailVerified_when_statusIsRegistered', () => {
      const user = makeUser();

      user.verifyEmail();

      expect(user.status).toBe(UserStatus.EMAIL_VERIFIED);
    });

    it('should_throwError_when_emailAlreadyVerified', () => {
      const user = makeUser();
      user.verifyEmail();

      expect(() => user.verifyEmail()).toThrow('Email already verified');
    });
  });

  describe('requestPhoneVerification', () => {
    it('should_setPhone_when_emailVerified', () => {
      const user = makeUser();
      user.verifyEmail();

      user.requestPhoneVerification('+61412345678');

      expect(user.phone).toBe('+61412345678');
    });

    it('should_throwError_when_emailNotYetVerified', () => {
      const user = makeUser();

      expect(() => user.requestPhoneVerification('+61412345678')).toThrow(
        'Email must be verified before phone verification',
      );
    });
  });

  describe('verifyPhone', () => {
    it('should_setStatusToApprovedBidder_when_emailVerifiedAndPhoneSet', () => {
      const user = makeUser();
      user.verifyEmail();
      user.requestPhoneVerification('+61412345678');

      user.verifyPhone();

      expect(user.status).toBe(UserStatus.APPROVED_BIDDER);
    });

    it('should_throwError_when_phoneNotSet', () => {
      const user = makeUser();
      user.verifyEmail();

      expect(() => user.verifyPhone()).toThrow('Phone not set');
    });
  });

  describe('suspend', () => {
    it('should_setStatusToSuspended', () => {
      const user = makeUser();

      user.suspend();

      expect(user.status).toBe(UserStatus.SUSPENDED);
    });
  });

  describe('updateProfile', () => {
    it('should_updateCountry_when_countryProvided', () => {
      const user = makeUser();

      user.updateProfile({ country: 'AU' });

      expect(user.country).toBe('AU');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/user-auth && npx vitest run src/domain/user.test.ts
```

Expected: FAIL — `Cannot find module './user'`

- [ ] **Step 3: Implement `User` entity**

Create `apps/user-auth/src/domain/user.ts`:

```typescript
export enum UserStatus {
  REGISTERED = 'REGISTERED',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  APPROVED_BIDDER = 'APPROVED_BIDDER',
  SUSPENDED = 'SUSPENDED',
}

export enum UserRole {
  BUYER = 'BUYER',
  ADMIN = 'ADMIN',
}

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  phone: string | null;
  status: UserStatus;
  role: UserRole;
  country: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class User {
  private props: UserProps;

  private constructor(props: UserProps) {
    this.props = props;
  }

  static create(params: {
    id: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    country?: string;
  }): User {
    return new User({
      id: params.id,
      email: params.email,
      passwordHash: params.passwordHash,
      phone: null,
      status: UserStatus.REGISTERED,
      role: params.role,
      country: params.country ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static reconstitute(props: UserProps): User {
    return new User(props);
  }

  get id(): string { return this.props.id; }
  get email(): string { return this.props.email; }
  get passwordHash(): string { return this.props.passwordHash; }
  get phone(): string | null { return this.props.phone; }
  get status(): UserStatus { return this.props.status; }
  get role(): UserRole { return this.props.role; }
  get country(): string | null { return this.props.country; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  verifyEmail(): void {
    if (this.props.status !== UserStatus.REGISTERED) {
      throw new Error('Email already verified');
    }
    this.props.status = UserStatus.EMAIL_VERIFIED;
    this.props.updatedAt = new Date();
  }

  requestPhoneVerification(phone: string): void {
    if (this.props.status === UserStatus.REGISTERED) {
      throw new Error('Email must be verified before phone verification');
    }
    this.props.phone = phone;
    this.props.updatedAt = new Date();
  }

  verifyPhone(): void {
    if (!this.props.phone) {
      throw new Error('Phone not set');
    }
    this.props.status = UserStatus.APPROVED_BIDDER;
    this.props.updatedAt = new Date();
  }

  suspend(): void {
    this.props.status = UserStatus.SUSPENDED;
    this.props.updatedAt = new Date();
  }

  updateProfile(patch: { country?: string }): void {
    if (patch.country !== undefined) {
      this.props.country = patch.country;
    }
    this.props.updatedAt = new Date();
  }

  toProps(): UserProps {
    return { ...this.props };
  }
}
```

- [ ] **Step 4: Create `apps/user-auth/src/domain/user-repository.ts`**

```typescript
import { User } from './user';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/user-auth && npx vitest run src/domain/user.test.ts
```

Expected: all 8 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/user-auth/src/domain/
git commit -m "feat(user-auth): User aggregate and UserRepository interface"
```

---

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

- [ ] **Step 1: Create `apps/user-auth/src/infrastructure/db/db.ts`**

```typescript
import postgres from 'postgres';

export type Db = ReturnType<typeof postgres>;

export function createDb(connectionUrl: string): Db {
  return postgres(connectionUrl);
}
```

- [ ] **Step 2: Write failing user repository tests**

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

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/user-auth && npx vitest run src/infrastructure/db/postgres-user-repository.test.ts
```

Expected: FAIL — `Cannot find module './postgres-user-repository'`

- [ ] **Step 4: Implement `PostgresUserRepository`**

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

- [ ] **Step 5: Write failing token repository tests**

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

- [ ] **Step 6: Run tests to verify they fail**

```bash
cd apps/user-auth && npx vitest run src/infrastructure/db/postgres-token-repository.test.ts
```

Expected: FAIL — `Cannot find module './postgres-token-repository'`

- [ ] **Step 7: Implement `PostgresTokenRepository`**

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

- [ ] **Step 8: Run all DB tests to verify they pass**

First create the test database if it does not exist:

```bash
psql -U postgres -c "CREATE DATABASE users_test;" 2>/dev/null || true
```

Then run the tests:

```bash
cd apps/user-auth && npx vitest run src/infrastructure/db/
```

Expected: all 7 tests PASS

- [ ] **Step 9: Commit**

```bash
git add apps/user-auth/src/infrastructure/db/
git commit -m "feat(user-auth): DB repositories with TDD"
```

---

### Task 4: Application services — auth and token helpers

**Files:**
- Create: `apps/user-auth/src/application/password-service.ts`
- Create: `apps/user-auth/src/application/token-service.ts`
- Create: `apps/user-auth/src/application/otp-service.ts`
- Test: `apps/user-auth/src/application/auth-services.test.ts`

**Interfaces:**
- Consumes: `UserStatus`, `UserRole` from Task 2
- Produces:
  - `PasswordService` — `hash(plain): Promise<string>`, `verify(plain, hash): Promise<boolean>`
  - `TokenService` — `issueAccessToken(payload)`, `verifyAccessToken(token)`, `issueRefreshToken()`, `hashRefreshToken(token)`
  - `AccessTokenPayload` type: `{ userId, email, verificationStatus: UserStatus, role: UserRole }`
  - `OtpService` — `generate(): string`

- [ ] **Step 1: Write failing tests**

Create `apps/user-auth/src/application/auth-services.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/user-auth && npx vitest run src/application/auth-services.test.ts
```

Expected: FAIL — cannot find modules

- [ ] **Step 3: Implement `PasswordService`**

Create `apps/user-auth/src/application/password-service.ts`:

```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export class PasswordService {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
```

- [ ] **Step 4: Implement `TokenService`**

Create `apps/user-auth/src/application/token-service.ts`:

```typescript
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
```

- [ ] **Step 5: Implement `OtpService`**

Create `apps/user-auth/src/application/otp-service.ts`:

```typescript
import { randomInt } from 'crypto';

export class OtpService {
  generate(): string {
    return String(randomInt(100000, 999999));
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd apps/user-auth && npx vitest run src/application/auth-services.test.ts
```

Expected: all 5 tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/user-auth/src/application/password-service.ts apps/user-auth/src/application/token-service.ts apps/user-auth/src/application/otp-service.ts apps/user-auth/src/application/auth-services.test.ts
git commit -m "feat(user-auth): PasswordService, TokenService, OtpService"
```

---

### Task 5: Application use cases

**Files:**
- Create: `apps/user-auth/src/application/register.use-case.ts`
- Create: `apps/user-auth/src/application/verify-email.use-case.ts`
- Create: `apps/user-auth/src/application/login.use-case.ts`
- Create: `apps/user-auth/src/application/refresh.use-case.ts`
- Create: `apps/user-auth/src/application/logout.use-case.ts`
- Create: `apps/user-auth/src/application/request-phone-otp.use-case.ts`
- Create: `apps/user-auth/src/application/verify-phone-otp.use-case.ts`
- Create: `apps/user-auth/src/application/get-me.use-case.ts`
- Create: `apps/user-auth/src/application/update-me.use-case.ts`
- Test: `apps/user-auth/src/application/use-cases.test.ts`

**Interfaces:**
- Consumes: `User`, `UserRole` from Task 2; `UserRepository` from Task 2; `TokenRepository` from Task 3; `PasswordService`, `TokenService`, `OtpService`, `AccessTokenPayload` from Task 4; `EventPublisher` from `@carat-room/shared-events`; `ROUTING_KEYS`, `UserRegisteredPayload`, `PhoneVerificationRequestedPayload` from `@carat-room/shared-types`
- Produces: nine use case classes each with `execute(dto)` method

- [ ] **Step 1: Write failing tests**

Create `apps/user-auth/src/application/use-cases.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterUseCase } from './register.use-case';
import { VerifyEmailUseCase } from './verify-email.use-case';
import { LoginUseCase } from './login.use-case';
import { RequestPhoneOtpUseCase } from './request-phone-otp.use-case';
import { VerifyPhoneOtpUseCase } from './verify-phone-otp.use-case';
import { User, UserRole, UserStatus } from '../domain/user';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';
import { PasswordService } from './password-service';
import { TokenService } from './token-service';
import { OtpService } from './otp-service';
import { EventPublisher } from '@carat-room/shared-events';

const makeUserRepo = (): UserRepository => ({
  findById: vi.fn(),
  findByEmail: vi.fn(),
  save: vi.fn(),
});

const makeTokenRepo = (): TokenRepository => ({
  saveVerificationToken: vi.fn(),
  findVerificationToken: vi.fn(),
  markVerificationTokenUsed: vi.fn(),
  countRecentPhoneAttempts: vi.fn(),
  saveRefreshToken: vi.fn(),
  findRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
});

const makePasswordService = () =>
  ({ hash: vi.fn(), verify: vi.fn() } as unknown as PasswordService);

const makeTokenService = () =>
  ({
    issueAccessToken: vi.fn().mockReturnValue('access-token'),
    issueRefreshToken: vi.fn().mockReturnValue('refresh-token'),
    hashRefreshToken: vi.fn().mockReturnValue('hashed-refresh'),
    verifyAccessToken: vi.fn(),
  } as unknown as TokenService);

const makeOtpService = () =>
  ({ generate: vi.fn().mockReturnValue('123456') } as unknown as OtpService);

const makePublisher = () =>
  ({ publish: vi.fn() } as unknown as EventPublisher);

describe('RegisterUseCase', () => {
  it('should_saveUserAndPublishEvent_when_emailNotTaken', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const passwordService = makePasswordService();
    const publisher = makePublisher();
    (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (passwordService.hash as ReturnType<typeof vi.fn>).mockResolvedValue('hashed-pw');

    const sut = new RegisterUseCase(userRepo, tokenRepo, passwordService, publisher);
    await sut.execute({ email: 'jane@example.com', password: 'secret123' });

    expect(userRepo.save).toHaveBeenCalledOnce();
    expect(tokenRepo.saveVerificationToken).toHaveBeenCalledOnce();
    expect(publisher.publish).toHaveBeenCalledOnce();
  });

  it('should_throwError_when_emailAlreadyTaken', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const passwordService = makePasswordService();
    const publisher = makePublisher();
    const existing = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });
    (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    const sut = new RegisterUseCase(userRepo, tokenRepo, passwordService, publisher);

    await expect(
      sut.execute({ email: 'jane@example.com', password: 'secret123' }),
    ).rejects.toThrow('Email already registered');
  });
});

describe('VerifyEmailUseCase', () => {
  it('should_verifyEmailAndUpdateUser_when_tokenValid', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (tokenRepo.findVerificationToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tok-1',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });

    const sut = new VerifyEmailUseCase(userRepo, tokenRepo);
    await sut.execute({ userId: 'u-1', code: '123456' });

    expect(userRepo.save).toHaveBeenCalledOnce();
    expect(tokenRepo.markVerificationTokenUsed).toHaveBeenCalledWith('tok-1');
    const saved = (userRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as User;
    expect(saved.status).toBe(UserStatus.EMAIL_VERIFIED);
  });

  it('should_throwError_when_tokenNotFound', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (tokenRepo.findVerificationToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const sut = new VerifyEmailUseCase(userRepo, tokenRepo);

    await expect(sut.execute({ userId: 'u-1', code: '000000' })).rejects.toThrow('Invalid or expired token');
  });
});

describe('LoginUseCase', () => {
  it('should_returnTokens_when_credentialsValid', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const passwordService = makePasswordService();
    const tokenService = makeTokenService();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'hash', role: UserRole.BUYER });
    user.verifyEmail();
    (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (passwordService.verify as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const sut = new LoginUseCase(userRepo, tokenRepo, passwordService, tokenService);
    const result = await sut.execute({ email: 'jane@example.com', password: 'secret' });

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(tokenRepo.saveRefreshToken).toHaveBeenCalledOnce();
  });

  it('should_throwError_when_passwordWrong', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const passwordService = makePasswordService();
    const tokenService = makeTokenService();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'hash', role: UserRole.BUYER });
    (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (passwordService.verify as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const sut = new LoginUseCase(userRepo, tokenRepo, passwordService, tokenService);

    await expect(
      sut.execute({ email: 'jane@example.com', password: 'wrong' }),
    ).rejects.toThrow('Invalid credentials');
  });
});

describe('RequestPhoneOtpUseCase', () => {
  it('should_saveOtpAndPublishEvent_when_notLockedOut', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const otpService = makeOtpService();
    const publisher = makePublisher();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });
    user.verifyEmail();
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (tokenRepo.countRecentPhoneAttempts as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const sut = new RequestPhoneOtpUseCase(userRepo, tokenRepo, otpService, publisher);
    await sut.execute({ userId: 'u-1', phone: '+61412345678' });

    expect(tokenRepo.saveVerificationToken).toHaveBeenCalledOnce();
    expect(publisher.publish).toHaveBeenCalledOnce();
  });

  it('should_throwError_when_tooManyAttempts', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const otpService = makeOtpService();
    const publisher = makePublisher();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });
    user.verifyEmail();
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (tokenRepo.countRecentPhoneAttempts as ReturnType<typeof vi.fn>).mockResolvedValue(3);

    const sut = new RequestPhoneOtpUseCase(userRepo, tokenRepo, otpService, publisher);

    await expect(
      sut.execute({ userId: 'u-1', phone: '+61412345678' }),
    ).rejects.toThrow('Too many OTP attempts. Please wait 15 minutes.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/user-auth && npx vitest run src/application/use-cases.test.ts
```

Expected: FAIL — cannot find modules

- [ ] **Step 3: Implement `RegisterUseCase`**

Create `apps/user-auth/src/application/register.use-case.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole } from '../domain/user';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';
import { PasswordService } from './password-service';
import { EventPublisher } from '@carat-room/shared-events';
import { ROUTING_KEYS, UserRegisteredPayload } from '@carat-room/shared-types';

interface RegisterDto {
  email: string;
  password: string;
  country?: string;
}

const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export class RegisterUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly passwordService: PasswordService,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(dto: RegisterDto): Promise<void> {
    const existing = await this.userRepo.findByEmail(dto.email);
    if (existing) throw new Error('Email already registered');

    const passwordHash = await this.passwordService.hash(dto.password);
    const user = User.create({
      id: uuidv4(),
      email: dto.email,
      passwordHash,
      role: UserRole.BUYER,
      country: dto.country,
    });

    await this.userRepo.save(user);

    const tokenCode = uuidv4().replace(/-/g, '');
    await this.tokenRepo.saveVerificationToken({
      id: uuidv4(),
      userId: user.id,
      type: 'EMAIL',
      code: tokenCode,
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
    });

    const payload: UserRegisteredPayload = {
      userId: user.id,
      email: user.email,
      emailVerificationCode: tokenCode,
    };
    await this.publisher.publish(ROUTING_KEYS.USER_REGISTERED, payload);
  }
}
```

- [ ] **Step 4: Implement `VerifyEmailUseCase`**

Create `apps/user-auth/src/application/verify-email.use-case.ts`:

```typescript
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';

interface VerifyEmailDto {
  userId: string;
  code: string;
}

export class VerifyEmailUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
  ) {}

  async execute(dto: VerifyEmailDto): Promise<void> {
    const user = await this.userRepo.findById(dto.userId);
    if (!user) throw new Error('User not found');

    const token = await this.tokenRepo.findVerificationToken({
      userId: dto.userId,
      type: 'EMAIL',
      code: dto.code,
    });

    if (!token || token.usedAt || token.expiresAt < new Date()) {
      throw new Error('Invalid or expired token');
    }

    user.verifyEmail();
    await this.userRepo.save(user);
    await this.tokenRepo.markVerificationTokenUsed(token.id);
  }
}
```

- [ ] **Step 5: Implement `LoginUseCase`**

Create `apps/user-auth/src/application/login.use-case.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';
import { PasswordService } from './password-service';
import { TokenService } from './token-service';

interface LoginDto {
  email: string;
  password: string;
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class LoginUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: LoginDto): Promise<LoginResult> {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) throw new Error('Invalid credentials');

    const valid = await this.passwordService.verify(dto.password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');

    const accessToken = this.tokenService.issueAccessToken({
      userId: user.id,
      email: user.email,
      verificationStatus: user.status,
      role: user.role,
    });

    const refreshToken = this.tokenService.issueRefreshToken();
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken);

    await this.tokenRepo.saveRefreshToken({
      id: uuidv4(),
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });

    return { accessToken, refreshToken };
  }
}
```

- [ ] **Step 6: Implement `RefreshUseCase`**

Create `apps/user-auth/src/application/refresh.use-case.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';
import { TokenService } from './token-service';

interface RefreshDto {
  refreshToken: string;
}

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class RefreshUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: RefreshDto): Promise<RefreshResult> {
    const tokenHash = this.tokenService.hashRefreshToken(dto.refreshToken);
    const stored = await this.tokenRepo.findRefreshToken(tokenHash);

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new Error('Invalid or expired refresh token');
    }

    await this.tokenRepo.revokeRefreshToken(stored.id);

    const user = await this.userRepo.findById(stored.userId);
    if (!user) throw new Error('User not found');

    const accessToken = this.tokenService.issueAccessToken({
      userId: user.id,
      email: user.email,
      verificationStatus: user.status,
      role: user.role,
    });

    const newRefreshToken = this.tokenService.issueRefreshToken();
    const newHash = this.tokenService.hashRefreshToken(newRefreshToken);

    await this.tokenRepo.saveRefreshToken({
      id: uuidv4(),
      userId: user.id,
      tokenHash: newHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });

    return { accessToken, refreshToken: newRefreshToken };
  }
}
```

- [ ] **Step 7: Implement `LogoutUseCase`**

Create `apps/user-auth/src/application/logout.use-case.ts`:

```typescript
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';
import { TokenService } from './token-service';

interface LogoutDto {
  refreshToken: string;
}

export class LogoutUseCase {
  constructor(
    private readonly tokenRepo: TokenRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: LogoutDto): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(dto.refreshToken);
    const stored = await this.tokenRepo.findRefreshToken(tokenHash);
    if (stored && !stored.revokedAt) {
      await this.tokenRepo.revokeRefreshToken(stored.id);
    }
  }
}
```

- [ ] **Step 8: Implement `RequestPhoneOtpUseCase`**

Create `apps/user-auth/src/application/request-phone-otp.use-case.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';
import { OtpService } from './otp-service';
import { EventPublisher } from '@carat-room/shared-events';
import { ROUTING_KEYS, PhoneVerificationRequestedPayload } from '@carat-room/shared-types';

interface RequestPhoneOtpDto {
  userId: string;
  phone: string;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 15 * 60 * 1000;

export class RequestPhoneOtpUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly otpService: OtpService,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(dto: RequestPhoneOtpDto): Promise<void> {
    const user = await this.userRepo.findById(dto.userId);
    if (!user) throw new Error('User not found');

    const lockoutWindow = new Date(Date.now() - LOCKOUT_MS);
    const attempts = await this.tokenRepo.countRecentPhoneAttempts(dto.userId, lockoutWindow);
    if (attempts >= MAX_ATTEMPTS) {
      throw new Error('Too many OTP attempts. Please wait 15 minutes.');
    }

    user.requestPhoneVerification(dto.phone);
    await this.userRepo.save(user);

    const code = this.otpService.generate();
    await this.tokenRepo.saveVerificationToken({
      id: uuidv4(),
      userId: dto.userId,
      type: 'PHONE',
      code,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    const payload: PhoneVerificationRequestedPayload = {
      userId: dto.userId,
      phone: dto.phone,
      otpCode: code,
    };
    await this.publisher.publish(ROUTING_KEYS.USER_PHONE_VERIFICATION_REQUESTED, payload);
  }
}
```

- [ ] **Step 9: Implement `VerifyPhoneOtpUseCase`**

Create `apps/user-auth/src/application/verify-phone-otp.use-case.ts`:

```typescript
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';

interface VerifyPhoneOtpDto {
  userId: string;
  code: string;
}

export class VerifyPhoneOtpUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
  ) {}

  async execute(dto: VerifyPhoneOtpDto): Promise<void> {
    const user = await this.userRepo.findById(dto.userId);
    if (!user) throw new Error('User not found');

    const token = await this.tokenRepo.findVerificationToken({
      userId: dto.userId,
      type: 'PHONE',
      code: dto.code,
    });

    if (!token || token.usedAt || token.expiresAt < new Date()) {
      throw new Error('Invalid or expired OTP');
    }

    user.verifyPhone();
    await this.userRepo.save(user);
    await this.tokenRepo.markVerificationTokenUsed(token.id);
  }
}
```

- [ ] **Step 10: Implement `GetMeUseCase` and `UpdateMeUseCase`**

Create `apps/user-auth/src/application/get-me.use-case.ts`:

```typescript
import { User } from '../domain/user';
import { UserRepository } from '../domain/user-repository';

export class GetMeUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(userId: string): Promise<User> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new Error('User not found');
    return user;
  }
}
```

Create `apps/user-auth/src/application/update-me.use-case.ts`:

```typescript
import { UserRepository } from '../domain/user-repository';

interface UpdateMeDto {
  userId: string;
  country?: string;
}

export class UpdateMeUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(dto: UpdateMeDto): Promise<void> {
    const user = await this.userRepo.findById(dto.userId);
    if (!user) throw new Error('User not found');
    user.updateProfile({ country: dto.country });
    await this.userRepo.save(user);
  }
}
```

- [ ] **Step 11: Run tests to verify they pass**

```bash
cd apps/user-auth && npx vitest run src/application/use-cases.test.ts
```

Expected: all 8 tests PASS

- [ ] **Step 12: Commit**

```bash
git add apps/user-auth/src/application/
git commit -m "feat(user-auth): application use cases with TDD"
```

---

### Task 6: Hono routes, wiring, and Dockerfile

**Files:**
- Create: `apps/user-auth/src/presentation/user-router.ts`
- Test: `apps/user-auth/src/presentation/user-router.test.ts`
- Create: `apps/user-auth/src/main.ts`
- Create: `apps/user-auth/Dockerfile`

**Interfaces:**
- Consumes: all use cases from Task 5; `TokenService` from Task 4; `authMiddleware`, `JwtPayload` from `@carat-room/shared-auth`; `createAmqpConnection`, `EventPublisher` from `@carat-room/shared-events`; `createDb` from Task 3
- Produces: Hono app on port 3000 with `GET /health` + 9 API routes

Routes:
```
POST  /api/users/register        — public
POST  /api/users/verify-email    — public
POST  /api/users/login           — public
POST  /api/users/refresh         — reads httpOnly cookie
POST  /api/users/logout          — reads httpOnly cookie
POST  /api/users/phone/request   — auth required
POST  /api/users/phone/verify    — auth required
GET   /api/users/me              — auth required
PATCH /api/users/me              — auth required
```

- [ ] **Step 1: Write failing tests**

Create `apps/user-auth/src/presentation/user-router.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { buildUserRouter } from './user-router';
import { RegisterUseCase } from '../application/register.use-case';
import { LoginUseCase } from '../application/login.use-case';
import { GetMeUseCase } from '../application/get-me.use-case';
import { User, UserRole, UserStatus } from '../domain/user';
import { JwtPayload } from '@carat-room/shared-auth';

const makeUseCases = () => ({
  register:        { execute: vi.fn() } as unknown as RegisterUseCase,
  verifyEmail:     { execute: vi.fn() } as unknown as any,
  login:           { execute: vi.fn() } as unknown as LoginUseCase,
  refresh:         { execute: vi.fn() } as unknown as any,
  logout:          { execute: vi.fn() } as unknown as any,
  requestPhoneOtp: { execute: vi.fn() } as unknown as any,
  verifyPhoneOtp:  { execute: vi.fn() } as unknown as any,
  getMe:           { execute: vi.fn() } as unknown as GetMeUseCase,
  updateMe:        { execute: vi.fn() } as unknown as any,
});

const jwtMiddleware = (userId = 'user-1') =>
  vi.fn(async (c: any, next: any) => {
    c.set('jwtPayload', {
      userId,
      role: 'BUYER',
      verificationStatus: UserStatus.APPROVED_BIDDER,
    } as JwtPayload);
    await next();
  });

describe('POST /api/users/register', () => {
  it('should_return201_when_registrationSucceeds', async () => {
    const useCases = makeUseCases();
    (useCases.register.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases));

    const res = await app.request('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com', password: 'secret123' }),
    });

    expect(res.status).toBe(201);
  });

  it('should_return400_when_emailMissing', async () => {
    const useCases = makeUseCases();
    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases));

    const res = await app.request('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'secret123' }),
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/users/login', () => {
  it('should_return200WithAccessToken_when_credentialsValid', async () => {
    const useCases = makeUseCases();
    (useCases.login.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
    });

    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases));

    const res = await app.request('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com', password: 'secret' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.accessToken).toBe('at');
  });
});

describe('GET /api/users/me', () => {
  it('should_return200WithProfile_when_authenticated', async () => {
    const useCases = makeUseCases();
    const user = User.create({
      id: 'u-1',
      email: 'jane@example.com',
      passwordHash: 'h',
      role: UserRole.BUYER,
    });
    (useCases.getMe.execute as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/users', buildUserRouter(useCases));

    const res = await app.request('/api/users/me');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.email).toBe('jane@example.com');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/user-auth && npx vitest run src/presentation/user-router.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Implement `buildUserRouter`**

Create `apps/user-auth/src/presentation/user-router.ts`:

```typescript
import { Hono } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';
import { RegisterUseCase } from '../application/register.use-case';
import { VerifyEmailUseCase } from '../application/verify-email.use-case';
import { LoginUseCase } from '../application/login.use-case';
import { RefreshUseCase } from '../application/refresh.use-case';
import { LogoutUseCase } from '../application/logout.use-case';
import { RequestPhoneOtpUseCase } from '../application/request-phone-otp.use-case';
import { VerifyPhoneOtpUseCase } from '../application/verify-phone-otp.use-case';
import { GetMeUseCase } from '../application/get-me.use-case';
import { UpdateMeUseCase } from '../application/update-me.use-case';
import { JwtPayload } from '@carat-room/shared-auth';

interface UseCases {
  register: RegisterUseCase;
  verifyEmail: VerifyEmailUseCase;
  login: LoginUseCase;
  refresh: RefreshUseCase;
  logout: LogoutUseCase;
  requestPhoneOtp: RequestPhoneOtpUseCase;
  verifyPhoneOtp: VerifyPhoneOtpUseCase;
  getMe: GetMeUseCase;
  updateMe: UpdateMeUseCase;
}

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

const REFRESH_COOKIE = 'carat_refresh';

export function buildUserRouter(useCases: UseCases): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.post('/register', async (c) => {
    const body = await c.req.json();
    const { email, password, country } = body;
    if (!email || !password) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'email and password are required' } },
        400,
      );
    }
    try {
      await useCases.register.execute({ email, password, country });
      return c.json(
        { data: { message: 'Registration successful. Check your email to verify your account.' } },
        201,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Email already registered') {
        return c.json({ error: { code: 'CONFLICT', message: 'Email already registered' } }, 409);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.post('/verify-email', async (c) => {
    const body = await c.req.json();
    const { userId, code } = body;
    if (!userId || !code) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'userId and code are required' } },
        400,
      );
    }
    try {
      await useCases.verifyEmail.execute({ userId, code });
      return c.json({ data: { message: 'Email verified successfully.' } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Invalid or expired token') {
        return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid or expired token' } }, 400);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.post('/login', async (c) => {
    const body = await c.req.json();
    const { email, password } = body;
    if (!email || !password) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'email and password are required' } },
        400,
      );
    }
    try {
      const { accessToken, refreshToken } = await useCases.login.execute({ email, password });
      setCookie(c, REFRESH_COOKIE, refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
      });
      return c.json({ data: { accessToken } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Invalid credentials') {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }, 401);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.post('/refresh', async (c) => {
    const refreshToken = getCookie(c, REFRESH_COOKIE);
    if (!refreshToken) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'No refresh token' } }, 401);
    }
    try {
      const result = await useCases.refresh.execute({ refreshToken });
      setCookie(c, REFRESH_COOKIE, result.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
      });
      return c.json({ data: { accessToken: result.accessToken } });
    } catch {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token' } },
        401,
      );
    }
  });

  router.post('/logout', async (c) => {
    const refreshToken = getCookie(c, REFRESH_COOKIE);
    if (refreshToken) {
      await useCases.logout.execute({ refreshToken });
    }
    setCookie(c, REFRESH_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
    return c.json({ data: { message: 'Logged out.' } });
  });

  router.post('/phone/request', async (c) => {
    const { userId } = c.get('jwtPayload');
    const body = await c.req.json();
    const { phone } = body;
    if (!phone) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'phone is required' } }, 400);
    }
    try {
      await useCases.requestPhoneOtp.execute({ userId, phone });
      return c.json({ data: { message: 'OTP sent.' } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('Too many OTP attempts')) {
        return c.json({ error: { code: 'TOO_MANY_REQUESTS', message } }, 429);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.post('/phone/verify', async (c) => {
    const { userId } = c.get('jwtPayload');
    const body = await c.req.json();
    const { code } = body;
    if (!code) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'code is required' } }, 400);
    }
    try {
      await useCases.verifyPhoneOtp.execute({ userId, code });
      return c.json({ data: { message: 'Phone verified. You are now an approved bidder.' } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Invalid or expired OTP') {
        return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid or expired OTP' } }, 400);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.get('/me', async (c) => {
    const { userId } = c.get('jwtPayload');
    const user = await useCases.getMe.execute(userId);
    const p = user.toProps();
    return c.json({
      data: {
        id: p.id,
        email: p.email,
        phone: p.phone,
        status: p.status,
        role: p.role,
        country: p.country,
      },
    });
  });

  router.patch('/me', async (c) => {
    const { userId } = c.get('jwtPayload');
    const body = await c.req.json();
    await useCases.updateMe.execute({ userId, country: body.country });
    return c.json({ data: { message: 'Profile updated.' } });
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/user-auth && npx vitest run src/presentation/user-router.test.ts
```

Expected: all 4 tests PASS

- [ ] **Step 5: Create `apps/user-auth/src/main.ts`**

```typescript
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createDb } from './infrastructure/db/db';
import { PostgresUserRepository } from './infrastructure/db/postgres-user-repository';
import { PostgresTokenRepository } from './infrastructure/db/postgres-token-repository';
import { PasswordService } from './application/password-service';
import { TokenService } from './application/token-service';
import { OtpService } from './application/otp-service';
import { RegisterUseCase } from './application/register.use-case';
import { VerifyEmailUseCase } from './application/verify-email.use-case';
import { LoginUseCase } from './application/login.use-case';
import { RefreshUseCase } from './application/refresh.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { RequestPhoneOtpUseCase } from './application/request-phone-otp.use-case';
import { VerifyPhoneOtpUseCase } from './application/verify-phone-otp.use-case';
import { GetMeUseCase } from './application/get-me.use-case';
import { UpdateMeUseCase } from './application/update-me.use-case';
import { buildUserRouter } from './presentation/user-router';
import { createAmqpConnection, EventPublisher } from '@carat-room/shared-events';
import { authMiddleware, JwtPayload } from '@carat-room/shared-auth';

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const amqpUrl = process.env.AMQP_URL;
  const jwtPrivateKey = process.env.JWT_PRIVATE_KEY;
  const jwtPublicKey = process.env.JWT_PUBLIC_KEY;
  const port = Number(process.env.PORT ?? 3000);

  if (!databaseUrl || !amqpUrl || !jwtPrivateKey || !jwtPublicKey) {
    throw new Error(
      'Missing required environment variables: DATABASE_URL, AMQP_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY',
    );
  }

  const db = createDb(databaseUrl);
  const userRepo = new PostgresUserRepository(db);
  const tokenRepo = new PostgresTokenRepository(db);

  const passwordService = new PasswordService();
  const tokenService = new TokenService({ privateKeyPem: jwtPrivateKey, publicKeyPem: jwtPublicKey });
  const otpService = new OtpService();

  const amqp = await createAmqpConnection(amqpUrl);
  const publisher = new EventPublisher(amqp);

  const app = new Hono<AppEnv>();

  app.get('/health', (c) => c.json({ status: 'ok', service: 'user-auth' }));

  app.use('/api/users/phone/*', authMiddleware(jwtPublicKey));
  app.use('/api/users/me', authMiddleware(jwtPublicKey));

  app.route('/api/users', buildUserRouter({
    register:        new RegisterUseCase(userRepo, tokenRepo, passwordService, publisher),
    verifyEmail:     new VerifyEmailUseCase(userRepo, tokenRepo),
    login:           new LoginUseCase(userRepo, tokenRepo, passwordService, tokenService),
    refresh:         new RefreshUseCase(userRepo, tokenRepo, tokenService),
    logout:          new LogoutUseCase(tokenRepo, tokenService),
    requestPhoneOtp: new RequestPhoneOtpUseCase(userRepo, tokenRepo, otpService, publisher),
    verifyPhoneOtp:  new VerifyPhoneOtpUseCase(userRepo, tokenRepo),
    getMe:           new GetMeUseCase(userRepo),
    updateMe:        new UpdateMeUseCase(userRepo),
  }));

  serve({ fetch: app.fetch, port }, () => {
    console.log(`User auth service listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 6: Create `apps/user-auth/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/user-auth/package.json ./apps/user-auth/
COPY packages/ ./packages/
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY apps/user-auth/ ./apps/user-auth/
RUN pnpm --filter @carat-room/user-auth build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/user-auth/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

- [ ] **Step 7: Run all tests**

```bash
cd apps/user-auth && npx vitest run
```

Expected: all tests PASS

- [ ] **Step 8: Verify TypeScript compiles cleanly**

```bash
cd apps/user-auth && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add apps/user-auth/src/presentation/ apps/user-auth/src/main.ts apps/user-auth/Dockerfile
git commit -m "feat(user-auth): Hono router, main entry point, and Dockerfile"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| `users` table — `REGISTERED \| EMAIL_VERIFIED \| APPROVED_BIDDER \| SUSPENDED` | Task 1 |
| `verification_tokens` table (EMAIL + PHONE types) | Task 1 |
| `refresh_tokens` table | Task 1 |
| `POST /api/users/register` | Task 6 |
| `POST /api/users/verify-email` | Task 6 |
| `POST /api/users/login` | Task 6 |
| `POST /api/users/refresh` | Task 6 |
| `POST /api/users/logout` | Task 6 |
| `POST /api/users/phone/request` | Task 6 |
| `POST /api/users/phone/verify` | Task 6 |
| `GET /api/users/me` | Task 6 |
| `PATCH /api/users/me` | Task 6 |
| JWT RS256, 15-minute access token | Task 4 |
| Refresh token httpOnly cookie, 30-day expiry | Tasks 4, 6 |
| Phone OTP 6-digit, 10-minute expiry | Tasks 4, 5 |
| Max 3 OTP attempts → 15-minute lockout | Task 5 |
| `UserRegistered` event published | Task 5 |
| `PhoneVerificationRequested` event published | Task 5 |
| Clean Architecture layers | Tasks 2–6 |
| Auth middleware on phone + me routes only | Task 6 |
| `GET /health` | Task 6 |

### Placeholder scan
No TBDs, TODOs, or incomplete steps found.

### Type consistency
- `UserStatus` and `UserRole` defined in Task 2 (`domain/user.ts`), used consistently across Tasks 3–6
- `UserRepository` interface defined in Task 2, implemented in Task 3, injected into all use cases in Task 5
- `TokenRepository` interface defined in Task 3 (`postgres-token-repository.ts`), injected into all relevant use cases in Task 5
- `AccessTokenPayload` defined in Task 4 (`token-service.ts`), consistent with `JwtPayload` from `@carat-room/shared-auth`
- `UserRegisteredPayload` and `PhoneVerificationRequestedPayload` imported from `@carat-room/shared-types` in `RegisterUseCase` and `RequestPhoneOtpUseCase` respectively
