### Task 1: user-auth — PENDING_REVIEW status + identity document field

**Files:**
- Modify: `apps/user-auth/src/domain/user.ts`
- Modify: `apps/user-auth/src/infrastructure/db/postgres-user-repository.ts`

**Interfaces:**
- Produces: `UserStatus.PENDING_REVIEW`, `User.submitIdentityDocument(key: string)`, `UserProps.identityDocumentKey`
- `verifyPhone()` now sets status to `PHONE_VERIFIED` (not `APPROVED_BIDDER`) — bidder registration wizard handles final approval

**Migration SQL** (run manually against user-auth DB before starting):

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS identity_document_key TEXT;

ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'PHONE_VERIFIED';
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
```

If `user_status` is stored as plain `VARCHAR` (not a Postgres enum), no `ALTER TYPE` needed — only the column addition.

- [ ] **Step 1: Update `apps/user-auth/src/domain/user.ts`**

```typescript
export enum UserStatus {
  REGISTERED = 'REGISTERED',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  PHONE_VERIFIED = 'PHONE_VERIFIED',
  PENDING_REVIEW = 'PENDING_REVIEW',
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
  identityDocumentKey: string | null;
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
      identityDocumentKey: null,
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
  get identityDocumentKey(): string | null { return this.props.identityDocumentKey; }
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
    this.props.status = UserStatus.PHONE_VERIFIED;
    this.props.updatedAt = new Date();
  }

  submitIdentityDocument(key: string): void {
    if (this.props.status === UserStatus.REGISTERED) {
      throw new Error('Email must be verified before submitting identity');
    }
    this.props.identityDocumentKey = key;
    this.props.status = UserStatus.PENDING_REVIEW;
    this.props.updatedAt = new Date();
  }

  approve(): void {
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

- [ ] **Step 2: Update `apps/user-auth/src/infrastructure/db/postgres-user-repository.ts`**

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
  identity_document_key: string | null;
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
    const props = user.toProps();
    await this.db`
      INSERT INTO users (id, email, password_hash, phone, status, role, country, identity_document_key, created_at, updated_at)
      VALUES (${props.id}, ${props.email}, ${props.passwordHash}, ${props.phone}, ${props.status}, ${props.role}, ${props.country}, ${props.identityDocumentKey}, ${props.createdAt}, ${props.updatedAt})
      ON CONFLICT (id) DO UPDATE
        SET phone                 = EXCLUDED.phone,
            status                = EXCLUDED.status,
            country               = EXCLUDED.country,
            identity_document_key = EXCLUDED.identity_document_key,
            updated_at            = EXCLUDED.updated_at
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
      identityDocumentKey: row.identity_document_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return User.reconstitute(props);
  }
}
```

- [ ] **Step 3: Run the existing user-auth tests to confirm no regressions**

```bash
pnpm turbo test --filter=user-auth
```

Expected: all existing tests pass. If `verifyPhone` tests assert `APPROVED_BIDDER`, update them to assert `PHONE_VERIFIED`.

- [ ] **Step 4: Commit**

```bash
git add apps/user-auth/src/domain/user.ts apps/user-auth/src/infrastructure/db/postgres-user-repository.ts
git commit -m "feat(user-auth): add PENDING_REVIEW status and identity_document_key field"
```

---

