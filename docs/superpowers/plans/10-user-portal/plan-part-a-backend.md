# User Portal — Part A: Backend Additions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three groups of new endpoints to existing services: identity-document upload to user-auth, Stripe SetupIntent + pay-saved-card to payment, and valuation enquiry to admin.

**Architecture:** Each service gets the minimum additions needed. user-auth gains an R2 upload client and a new route. Payment service gains a `payment_profiles` table (userId → Stripe customer + payment method) and three new routes. Admin service gains a small Postgres DB for valuation enquiries plus two public routes and an R2 upload client. No existing endpoints are modified except `verifyPhone()` status change.

**Tech Stack:** Hono, postgres.js, @aws-sdk/client-s3 (R2), Stripe Node SDK, Vitest.

## Global Constraints

- TypeScript strict mode, no implicit `any`
- Named exports only — no `export default`
- Single quotes for string literals; `const`/`let` only
- British English in all copy: "authorise", "cancelled", "fulfilment"
- Test files co-located with source: `<name>.test.ts`
- No `var`, no `_` prefix on private fields (use `private` keyword)
- Boolean variables must use `is`, `has`, `can`, `should`, `was`, or `will` prefix

---

## File Map

```
apps/user-auth/src/
  domain/user.ts                                  MODIFY — add PENDING_REVIEW, identityDocumentKey, submitIdentityDocument()
  infrastructure/db/postgres-user-repository.ts   MODIFY — persist identity_document_key
  infrastructure/r2/r2-upload-client.ts           CREATE
  infrastructure/r2/r2-upload-client.test.ts      CREATE
  application/upload-identity-document.use-case.ts  CREATE
  application/upload-identity-document.use-case.test.ts  CREATE
  presentation/user-router.ts                     MODIFY — add POST /identity-document route
  main.ts                                         MODIFY — wire R2 client + use case

apps/payment/src/
  application/stripe-client.ts                    MODIFY — add setupIntent + paymentIntent methods
  application/payment-profile-repository.ts       CREATE — interface
  application/create-setup-intent.use-case.ts     CREATE
  application/create-setup-intent.use-case.test.ts  CREATE
  application/confirm-setup-intent.use-case.ts    CREATE
  application/confirm-setup-intent.use-case.test.ts  CREATE
  application/pay-saved-card.use-case.ts          CREATE
  application/pay-saved-card.use-case.test.ts     CREATE
  infrastructure/stripe-adapter.ts                MODIFY — implement new Stripe methods
  infrastructure/postgres-payment-profile-repository.ts  CREATE
  infrastructure/postgres-payment-profile-repository.test.ts  CREATE
  presentation/payment-router.ts                  MODIFY — add 3 new routes
  main.ts                                         MODIFY — wire new use cases

apps/admin/src/
  infrastructure/db.ts                            CREATE — postgres connection
  infrastructure/r2-upload-client.ts              CREATE
  infrastructure/r2-upload-client.test.ts         CREATE
  infrastructure/postgres-enquiry-repository.ts   CREATE
  infrastructure/postgres-enquiry-repository.test.ts  CREATE
  application/submit-valuation-enquiry.use-case.ts  CREATE
  application/submit-valuation-enquiry.use-case.test.ts  CREATE
  presentation/enquiries-router.ts                CREATE
  presentation/enquiries-router.test.ts           CREATE
  main.ts                                         MODIFY — wire enquiry router + DB
  package.json                                    MODIFY — add postgres, @aws-sdk/client-s3
```

---

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

### Task 2: user-auth — R2 upload client

**Files:**
- Create: `apps/user-auth/src/infrastructure/r2/r2-upload-client.ts`
- Create: `apps/user-auth/src/infrastructure/r2/r2-upload-client.test.ts`

**Interfaces:**
- Produces: `R2UploadClient` with `upload(key: string, body: Buffer, contentType: string): Promise<void>`
- Consumed by: Task 3 `UploadIdentityDocumentUseCase`

Environment variables needed in user-auth:
- `R2_ACCOUNT_ID` — Cloudflare account ID
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

Add to `apps/user-auth/package.json` dependencies:
```json
"@aws-sdk/client-s3": "^3.600.0"
```

- [ ] **Step 1: Write the failing test**

```typescript
// apps/user-auth/src/infrastructure/r2/r2-upload-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { R2UploadClient } from './r2-upload-client';

vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn().mockResolvedValue({});
  return {
    S3Client: vi.fn(() => ({ send: mockSend })),
    PutObjectCommand: vi.fn((input) => ({ input })),
    __mockSend: mockSend,
  };
});

describe('R2UploadClient', () => {
  let client: R2UploadClient;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new R2UploadClient({
      accountId: 'test-account',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      bucketName: 'test-bucket',
    });
    const mod = vi.mocked(S3Client).mock.results[0].value as { send: ReturnType<typeof vi.fn> };
    mockSend = mod.send;
  });

  it('calls PutObjectCommand with correct key, body, and content type', async () => {
    const body = Buffer.from('test-content');
    await client.upload('identity-docs/user-1/doc.jpg', body, 'image/jpeg');

    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'identity-docs/user-1/doc.jpg',
      Body: body,
      ContentType: 'image/jpeg',
    });
    expect(mockSend).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm turbo test --filter=user-auth
```

Expected: FAIL — `R2UploadClient` not found.

- [ ] **Step 3: Implement `apps/user-auth/src/infrastructure/r2/r2-upload-client.ts`**

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export class R2UploadClient {
  private readonly s3: S3Client;
  private readonly bucketName: string;

  constructor(config: R2Config) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucketName = config.bucketName;
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm turbo test --filter=user-auth
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/user-auth/src/infrastructure/r2/
git commit -m "feat(user-auth): add R2 upload client"
```

---

### Task 3: user-auth — identity-document upload endpoint

**Files:**
- Create: `apps/user-auth/src/application/upload-identity-document.use-case.ts`
- Create: `apps/user-auth/src/application/upload-identity-document.use-case.test.ts`
- Modify: `apps/user-auth/src/presentation/user-router.ts` — add `POST /identity-document`
- Modify: `apps/user-auth/src/main.ts` — wire R2 client + use case

**Interfaces:**
- Consumes: `UserRepository` (Task 1), `R2UploadClient` (Task 2)
- Produces: `POST /api/users/identity-document` — multipart, returns `{ status: 'pending_review' }`

- [ ] **Step 1: Write the failing use case test**

```typescript
// apps/user-auth/src/application/upload-identity-document.use-case.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadIdentityDocumentUseCase } from './upload-identity-document.use-case';
import { User, UserStatus, UserRole } from '../domain/user';

const mockRepo = {
  findById: vi.fn(),
  findByEmail: vi.fn(),
  save: vi.fn(),
};
const mockR2 = {
  upload: vi.fn(),
};

function makeUser(status: UserStatus): User {
  return User.reconstitute({
    id: 'user-1',
    email: 'a@b.com',
    passwordHash: 'hash',
    phone: '+61400000000',
    status,
    role: UserRole.BUYER,
    country: null,
    identityDocumentKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('UploadIdentityDocumentUseCase', () => {
  let useCase: UploadIdentityDocumentUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new UploadIdentityDocumentUseCase(mockRepo as any, mockR2 as any);
  });

  it('uploads file to R2 and sets PENDING_REVIEW on user', async () => {
    const user = makeUser(UserStatus.PHONE_VERIFIED);
    mockRepo.findById.mockResolvedValue(user);
    mockR2.upload.mockResolvedValue(undefined);
    mockRepo.save.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: 'user-1',
      fileBuffer: Buffer.from('fake-pdf'),
      contentType: 'application/pdf',
      originalFilename: 'passport.pdf',
    });

    expect(mockR2.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^identity-docs\/user-1\/.+\.pdf$/),
      expect.any(Buffer),
      'application/pdf',
    );
    expect(mockRepo.save).toHaveBeenCalledOnce();
    expect(user.status).toBe(UserStatus.PENDING_REVIEW);
    expect(result).toEqual({ status: 'pending_review' });
  });

  it('throws if user not found', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ userId: 'missing', fileBuffer: Buffer.from(''), contentType: 'image/jpeg', originalFilename: 'id.jpg' }),
    ).rejects.toThrow('User not found');
  });

  it('rejects unsupported file types', async () => {
    const user = makeUser(UserStatus.PHONE_VERIFIED);
    mockRepo.findById.mockResolvedValue(user);
    await expect(
      useCase.execute({ userId: 'user-1', fileBuffer: Buffer.from(''), contentType: 'text/plain', originalFilename: 'doc.txt' }),
    ).rejects.toThrow('Unsupported file type');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm turbo test --filter=user-auth
```

Expected: FAIL — `UploadIdentityDocumentUseCase` not found.

- [ ] **Step 3: Implement the use case**

```typescript
// apps/user-auth/src/application/upload-identity-document.use-case.ts
import { UserRepository } from '../domain/user-repository';
import { R2UploadClient } from '../infrastructure/r2/r2-upload-client';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_BYTES = 10 * 1024 * 1024;

interface Input {
  userId: string;
  fileBuffer: Buffer;
  contentType: string;
  originalFilename: string;
}

export class UploadIdentityDocumentUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly r2: R2UploadClient,
  ) {}

  async execute(input: Input): Promise<{ status: 'pending_review' }> {
    if (!ALLOWED_TYPES.has(input.contentType)) {
      throw new Error('Unsupported file type');
    }
    if (input.fileBuffer.byteLength > MAX_BYTES) {
      throw new Error('File exceeds 10 MB limit');
    }

    const user = await this.userRepo.findById(input.userId);
    if (!user) throw new Error('User not found');

    const ext = input.originalFilename.split('.').pop() ?? 'bin';
    const key = `identity-docs/${user.id}/${Date.now()}.${ext}`;

    await this.r2.upload(key, input.fileBuffer, input.contentType);
    user.submitIdentityDocument(key);
    await this.userRepo.save(user);

    return { status: 'pending_review' };
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm turbo test --filter=user-auth
```

Expected: all tests PASS.

- [ ] **Step 5: Add route to `apps/user-auth/src/presentation/user-router.ts`**

At the top of the file, add the import and a new dependency type. The existing `buildUserRouter` function takes a `deps` object — extend it:

```typescript
// Add to the deps interface in user-router.ts:
uploadIdentityDocument: UploadIdentityDocumentUseCase;
```

Add the import at the top:
```typescript
import { UploadIdentityDocumentUseCase } from '../application/upload-identity-document.use-case';
```

Add the route (inside `buildUserRouter`, after the existing routes):
```typescript
router.post('/identity-document', async (c) => {
  const payload = c.get('jwtPayload');
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!(file instanceof File)) {
    return c.json({ error: 'Missing file field' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const result = await deps.uploadIdentityDocument.execute({
      userId: payload.userId,
      fileBuffer: buffer,
      contentType: file.type,
      originalFilename: file.name,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return c.json({ error: message }, 422);
  }
});
```

The route must be protected. In `main.ts`, add the middleware for this path:
```typescript
app.use('/api/users/identity-document', authMiddleware(jwtPublicKey));
```

- [ ] **Step 6: Wire R2 client and use case in `apps/user-auth/src/main.ts`**

Add environment variables section:
```typescript
const R2_ACCOUNT_ID       = process.env['R2_ACCOUNT_ID']!;
const R2_ACCESS_KEY_ID    = process.env['R2_ACCESS_KEY_ID']!;
const R2_SECRET_ACCESS_KEY = process.env['R2_SECRET_ACCESS_KEY']!;
const R2_BUCKET_NAME      = process.env['R2_BUCKET_NAME']!;
```

Instantiate and wire:
```typescript
import { R2UploadClient } from './infrastructure/r2/r2-upload-client';
import { UploadIdentityDocumentUseCase } from './application/upload-identity-document.use-case';

// inside main():
const r2 = new R2UploadClient({
  accountId: R2_ACCOUNT_ID,
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  bucketName: R2_BUCKET_NAME,
});

// add to authMiddleware lines:
app.use('/api/users/identity-document', authMiddleware(jwtPublicKey));

// add to buildUserRouter deps:
uploadIdentityDocument: new UploadIdentityDocumentUseCase(userRepo, r2),
```

- [ ] **Step 7: Run all user-auth tests**

```bash
pnpm turbo test --filter=user-auth
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/user-auth/
git commit -m "feat(user-auth): identity document upload endpoint with R2 storage"
```

---

### Task 4: payment — payment_profiles table + repository

**Files:**
- Create: `apps/payment/src/application/payment-profile-repository.ts`
- Create: `apps/payment/src/infrastructure/postgres-payment-profile-repository.ts`
- Create: `apps/payment/src/infrastructure/postgres-payment-profile-repository.test.ts`

**Interfaces:**
- Produces: `PaymentProfileRepository` interface + `PostgresPaymentProfileRepository`
- Consumed by: Tasks 5, 6, 7

**Migration SQL** (run against payment service DB):

```sql
CREATE TABLE IF NOT EXISTS payment_profiles (
  user_id                  UUID PRIMARY KEY,
  stripe_customer_id       TEXT NOT NULL,
  stripe_payment_method_id TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 1: Create the repository interface**

```typescript
// apps/payment/src/application/payment-profile-repository.ts
export interface PaymentProfile {
  userId: string;
  stripeCustomerId: string;
  stripePaymentMethodId: string | null;
}

export interface PaymentProfileRepository {
  findByUserId(userId: string): Promise<PaymentProfile | null>;
  save(profile: PaymentProfile): Promise<void>;
}
```

- [ ] **Step 2: Write the failing repository test**

```typescript
// apps/payment/src/infrastructure/postgres-payment-profile-repository.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgresPaymentProfileRepository } from './postgres-payment-profile-repository';

const mockDb = vi.fn();
mockDb.mockReturnValue([]);

describe('PostgresPaymentProfileRepository', () => {
  let repo: PostgresPaymentProfileRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.mockReturnValue([]);
    repo = new PostgresPaymentProfileRepository(mockDb as any);
  });

  it('returns null when no profile found', async () => {
    mockDb.mockReturnValue([]);
    const result = await repo.findByUserId('user-1');
    expect(result).toBeNull();
  });

  it('returns profile when found', async () => {
    mockDb.mockReturnValue([{
      user_id: 'user-1',
      stripe_customer_id: 'cus_abc',
      stripe_payment_method_id: 'pm_xyz',
      created_at: new Date(),
      updated_at: new Date(),
    }]);
    const result = await repo.findByUserId('user-1');
    expect(result).toEqual({
      userId: 'user-1',
      stripeCustomerId: 'cus_abc',
      stripePaymentMethodId: 'pm_xyz',
    });
  });

  it('upserts a profile on save', async () => {
    mockDb.mockReturnValue([]);
    await repo.save({ userId: 'user-1', stripeCustomerId: 'cus_abc', stripePaymentMethodId: 'pm_xyz' });
    expect(mockDb).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
pnpm turbo test --filter=payment
```

Expected: FAIL — `PostgresPaymentProfileRepository` not found.

- [ ] **Step 4: Implement the repository**

```typescript
// apps/payment/src/infrastructure/postgres-payment-profile-repository.ts
import { Db } from './db';
import { PaymentProfile, PaymentProfileRepository } from '../application/payment-profile-repository';

interface ProfileRow {
  user_id: string;
  stripe_customer_id: string;
  stripe_payment_method_id: string | null;
}

export class PostgresPaymentProfileRepository implements PaymentProfileRepository {
  constructor(private readonly db: Db) {}

  async findByUserId(userId: string): Promise<PaymentProfile | null> {
    const [row] = await this.db<ProfileRow[]>`
      SELECT user_id, stripe_customer_id, stripe_payment_method_id
      FROM payment_profiles WHERE user_id = ${userId}
    `;
    if (!row) return null;
    return {
      userId: row.user_id,
      stripeCustomerId: row.stripe_customer_id,
      stripePaymentMethodId: row.stripe_payment_method_id,
    };
  }

  async save(profile: PaymentProfile): Promise<void> {
    await this.db`
      INSERT INTO payment_profiles (user_id, stripe_customer_id, stripe_payment_method_id, updated_at)
      VALUES (${profile.userId}, ${profile.stripeCustomerId}, ${profile.stripePaymentMethodId}, NOW())
      ON CONFLICT (user_id) DO UPDATE
        SET stripe_customer_id       = EXCLUDED.stripe_customer_id,
            stripe_payment_method_id = EXCLUDED.stripe_payment_method_id,
            updated_at               = EXCLUDED.updated_at
    `;
  }
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm turbo test --filter=payment
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/payment/src/application/payment-profile-repository.ts apps/payment/src/infrastructure/postgres-payment-profile-repository.ts apps/payment/src/infrastructure/postgres-payment-profile-repository.test.ts
git commit -m "feat(payment): add payment_profiles repository"
```

---

### Task 5: payment — setup-intent endpoint

**Files:**
- Modify: `apps/payment/src/application/stripe-client.ts` — add `createCustomer` + `createSetupIntent` methods
- Modify: `apps/payment/src/infrastructure/stripe-adapter.ts` — implement them
- Create: `apps/payment/src/application/create-setup-intent.use-case.ts`
- Create: `apps/payment/src/application/create-setup-intent.use-case.test.ts`
- Modify: `apps/payment/src/presentation/payment-router.ts` — add `POST /setup-intent`

**Interfaces:**
- Consumes: `PaymentProfileRepository` (Task 4)
- Produces: `POST /api/payments/setup-intent` (authenticated) → `{ clientSecret: string }`

- [ ] **Step 1: Extend the StripeClient interface**

In `apps/payment/src/application/stripe-client.ts`, add:
```typescript
createCustomer(userId: string, email: string): Promise<{ customerId: string }>;
createSetupIntent(customerId: string): Promise<{ clientSecret: string }>;
```

- [ ] **Step 2: Implement new Stripe methods in stripe-adapter.ts**

Add to the `StripeAdapter` class:
```typescript
async createCustomer(userId: string, email: string): Promise<{ customerId: string }> {
  const customer = await this.stripe.customers.create({
    email,
    metadata: { userId },
  });
  return { customerId: customer.id };
}

async createSetupIntent(customerId: string): Promise<{ clientSecret: string }> {
  const intent = await this.stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
  });
  if (!intent.client_secret) throw new Error('Stripe did not return a client_secret');
  return { clientSecret: intent.client_secret };
}
```

- [ ] **Step 3: Write the failing use case test**

```typescript
// apps/payment/src/application/create-setup-intent.use-case.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateSetupIntentUseCase } from './create-setup-intent.use-case';

const mockProfiles = { findByUserId: vi.fn(), save: vi.fn() };
const mockStripe = {
  createCustomer: vi.fn(),
  createSetupIntent: vi.fn(),
};

describe('CreateSetupIntentUseCase', () => {
  let useCase: CreateSetupIntentUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new CreateSetupIntentUseCase(mockProfiles as any, mockStripe as any);
  });

  it('creates a new Stripe customer if none exists then returns clientSecret', async () => {
    mockProfiles.findByUserId.mockResolvedValue(null);
    mockStripe.createCustomer.mockResolvedValue({ customerId: 'cus_new' });
    mockStripe.createSetupIntent.mockResolvedValue({ clientSecret: 'seti_secret' });
    mockProfiles.save.mockResolvedValue(undefined);

    const result = await useCase.execute({ userId: 'u1', email: 'a@b.com' });

    expect(mockStripe.createCustomer).toHaveBeenCalledWith('u1', 'a@b.com');
    expect(mockProfiles.save).toHaveBeenCalledWith({ userId: 'u1', stripeCustomerId: 'cus_new', stripePaymentMethodId: null });
    expect(result).toEqual({ clientSecret: 'seti_secret' });
  });

  it('reuses existing Stripe customer if profile exists', async () => {
    mockProfiles.findByUserId.mockResolvedValue({ userId: 'u1', stripeCustomerId: 'cus_existing', stripePaymentMethodId: null });
    mockStripe.createSetupIntent.mockResolvedValue({ clientSecret: 'seti_secret2' });

    const result = await useCase.execute({ userId: 'u1', email: 'a@b.com' });

    expect(mockStripe.createCustomer).not.toHaveBeenCalled();
    expect(result).toEqual({ clientSecret: 'seti_secret2' });
  });
});
```

- [ ] **Step 4: Run test to confirm it fails**

```bash
pnpm turbo test --filter=payment
```

Expected: FAIL — `CreateSetupIntentUseCase` not found.

- [ ] **Step 5: Implement the use case**

```typescript
// apps/payment/src/application/create-setup-intent.use-case.ts
import { PaymentProfileRepository } from './payment-profile-repository';
import { StripeClient } from './stripe-client';

interface Input {
  userId: string;
  email: string;
}

export class CreateSetupIntentUseCase {
  constructor(
    private readonly profiles: PaymentProfileRepository,
    private readonly stripe: StripeClient,
  ) {}

  async execute(input: Input): Promise<{ clientSecret: string }> {
    let profile = await this.profiles.findByUserId(input.userId);

    if (!profile) {
      const { customerId } = await this.stripe.createCustomer(input.userId, input.email);
      profile = { userId: input.userId, stripeCustomerId: customerId, stripePaymentMethodId: null };
      await this.profiles.save(profile);
    }

    return this.stripe.createSetupIntent(profile.stripeCustomerId);
  }
}
```

- [ ] **Step 6: Run test to confirm it passes**

```bash
pnpm turbo test --filter=payment
```

Expected: all tests PASS.

- [ ] **Step 7: Add route to `apps/payment/src/presentation/payment-router.ts`**

The existing router uses `buildPaymentRouter(deps)` pattern. Add to the deps type:
```typescript
createSetupIntent: CreateSetupIntentUseCase;
```

Add the route (protected — requires JWT):
```typescript
router.post('/setup-intent', async (c) => {
  const payload = c.get('jwtPayload');
  const result = await deps.createSetupIntent.execute({
    userId: payload.userId,
    email: payload.email,
  });
  return c.json(result);
});
```

Auth middleware for this path is added in `main.ts`:
```typescript
app.use('/api/payments/setup-intent*', authMiddleware(JWT_PUBLIC_KEY));
```

- [ ] **Step 8: Run all payment tests**

```bash
pnpm turbo test --filter=payment
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/payment/src/
git commit -m "feat(payment): setup-intent endpoint for Stripe card pre-authorisation"
```

---

### Task 6: payment — setup-intent confirm endpoint

**Files:**
- Modify: `apps/payment/src/application/stripe-client.ts` — add `retrieveSetupIntent`
- Modify: `apps/payment/src/infrastructure/stripe-adapter.ts` — implement it
- Create: `apps/payment/src/application/confirm-setup-intent.use-case.ts`
- Create: `apps/payment/src/application/confirm-setup-intent.use-case.test.ts`
- Modify: `apps/payment/src/presentation/payment-router.ts` — add `POST /setup-intent/confirm`

**Interfaces:**
- Consumes: `PaymentProfileRepository` (Task 4)
- Produces: `POST /api/payments/setup-intent/confirm` → `{ ok: true }`

- [ ] **Step 1: Extend StripeClient interface and adapter**

Add to `stripe-client.ts`:
```typescript
retrieveSetupIntent(setupIntentId: string): Promise<{ status: string; customerId: string; paymentMethodId: string | null }>;
```

Add to `stripe-adapter.ts`:
```typescript
async retrieveSetupIntent(setupIntentId: string): Promise<{ status: string; customerId: string; paymentMethodId: string | null }> {
  const intent = await this.stripe.setupIntents.retrieve(setupIntentId);
  return {
    status: intent.status,
    customerId: typeof intent.customer === 'string' ? intent.customer : intent.customer?.id ?? '',
    paymentMethodId: typeof intent.payment_method === 'string' ? intent.payment_method : null,
  };
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/payment/src/application/confirm-setup-intent.use-case.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmSetupIntentUseCase } from './confirm-setup-intent.use-case';

const mockProfiles = { findByUserId: vi.fn(), save: vi.fn() };
const mockStripe = { retrieveSetupIntent: vi.fn() };

describe('ConfirmSetupIntentUseCase', () => {
  let useCase: ConfirmSetupIntentUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new ConfirmSetupIntentUseCase(mockProfiles as any, mockStripe as any);
  });

  it('saves paymentMethodId when SetupIntent succeeded', async () => {
    mockStripe.retrieveSetupIntent.mockResolvedValue({
      status: 'succeeded',
      customerId: 'cus_abc',
      paymentMethodId: 'pm_xyz',
    });
    mockProfiles.findByUserId.mockResolvedValue({ userId: 'u1', stripeCustomerId: 'cus_abc', stripePaymentMethodId: null });
    mockProfiles.save.mockResolvedValue(undefined);

    const result = await useCase.execute({ userId: 'u1', setupIntentId: 'seti_1' });

    expect(mockProfiles.save).toHaveBeenCalledWith({
      userId: 'u1',
      stripeCustomerId: 'cus_abc',
      stripePaymentMethodId: 'pm_xyz',
    });
    expect(result).toEqual({ ok: true });
  });

  it('throws when SetupIntent has not succeeded', async () => {
    mockStripe.retrieveSetupIntent.mockResolvedValue({ status: 'requires_action', customerId: 'cus_abc', paymentMethodId: null });
    await expect(
      useCase.execute({ userId: 'u1', setupIntentId: 'seti_1' }),
    ).rejects.toThrow('SetupIntent has not succeeded');
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
pnpm turbo test --filter=payment
```

- [ ] **Step 4: Implement the use case**

```typescript
// apps/payment/src/application/confirm-setup-intent.use-case.ts
import { PaymentProfileRepository } from './payment-profile-repository';
import { StripeClient } from './stripe-client';

interface Input {
  userId: string;
  setupIntentId: string;
}

export class ConfirmSetupIntentUseCase {
  constructor(
    private readonly profiles: PaymentProfileRepository,
    private readonly stripe: StripeClient,
  ) {}

  async execute(input: Input): Promise<{ ok: true }> {
    const intent = await this.stripe.retrieveSetupIntent(input.setupIntentId);
    if (intent.status !== 'succeeded') {
      throw new Error('SetupIntent has not succeeded');
    }
    if (!intent.paymentMethodId) {
      throw new Error('No payment method attached to SetupIntent');
    }

    const existing = await this.profiles.findByUserId(input.userId);
    await this.profiles.save({
      userId: input.userId,
      stripeCustomerId: existing?.stripeCustomerId ?? intent.customerId,
      stripePaymentMethodId: intent.paymentMethodId,
    });

    return { ok: true };
  }
}
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
pnpm turbo test --filter=payment
```

- [ ] **Step 6: Add route to payment-router.ts**

Add to deps type: `confirmSetupIntent: ConfirmSetupIntentUseCase;`

Add the route:
```typescript
router.post('/setup-intent/confirm', async (c) => {
  const payload = c.get('jwtPayload');
  const { setupIntentId } = await c.req.json<{ setupIntentId: string }>();
  try {
    const result = await deps.confirmSetupIntent.execute({ userId: payload.userId, setupIntentId });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Confirm failed';
    return c.json({ error: message }, 422);
  }
});
```

- [ ] **Step 7: Commit**

```bash
git add apps/payment/src/
git commit -m "feat(payment): setup-intent confirm endpoint"
```

---

### Task 7: payment — pay-saved-card endpoint

**Files:**
- Modify: `apps/payment/src/application/stripe-client.ts` — add `chargePaymentMethod`
- Modify: `apps/payment/src/infrastructure/stripe-adapter.ts` — implement it
- Create: `apps/payment/src/application/pay-saved-card.use-case.ts`
- Create: `apps/payment/src/application/pay-saved-card.use-case.test.ts`
- Modify: `apps/payment/src/presentation/payment-router.ts` — add `POST /invoices/:id/pay-saved-card`
- Modify: `apps/payment/src/main.ts` — wire new use cases + profile repository

**Interfaces:**
- Consumes: `InvoiceRepository` (existing), `PaymentProfileRepository` (Task 4)
- Produces: `POST /api/payments/invoices/:id/pay-saved-card` → `{ status: 'paid' }` or `{ error: string }`

- [ ] **Step 1: Extend StripeClient and adapter**

Add to `stripe-client.ts`:
```typescript
chargePaymentMethod(params: { customerId: string; paymentMethodId: string; amount: number; currency: string; description: string }): Promise<{ status: string; paymentIntentId: string }>;
```

Add to `stripe-adapter.ts`:
```typescript
async chargePaymentMethod(params: { customerId: string; paymentMethodId: string; amount: number; currency: string; description: string }): Promise<{ status: string; paymentIntentId: string }> {
  const intent = await this.stripe.paymentIntents.create({
    amount: Math.round(params.amount * 100),
    currency: params.currency.toLowerCase(),
    customer: params.customerId,
    payment_method: params.paymentMethodId,
    description: params.description,
    confirm: true,
    off_session: true,
  });
  return { status: intent.status, paymentIntentId: intent.id };
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/payment/src/application/pay-saved-card.use-case.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaySavedCardUseCase } from './pay-saved-card.use-case';
import { InvoiceStatus } from '../domain/invoice';

const mockInvoices = { findById: vi.fn(), save: vi.fn() };
const mockProfiles = { findByUserId: vi.fn(), save: vi.fn() };
const mockStripe = { chargePaymentMethod: vi.fn() };
const mockPublish = { paymentReceived: vi.fn() };

function makeInvoice() {
  return {
    id: 'inv-1', lotId: 'lot-1', winnerUserId: 'u1',
    amount: 1000, currency: 'aud',
    status: InvoiceStatus.PENDING,
    markPaid: vi.fn(),
    toProps: vi.fn().mockReturnValue({ id: 'inv-1', lotId: 'lot-1', winnerUserId: 'u1', amount: 1000, currency: 'aud', status: InvoiceStatus.PENDING }),
  };
}

describe('PaySavedCardUseCase', () => {
  let useCase: PaySavedCardUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new PaySavedCardUseCase(mockInvoices as any, mockProfiles as any, mockStripe as any, mockPublish as any);
  });

  it('charges the saved card and marks invoice paid', async () => {
    const invoice = makeInvoice();
    mockInvoices.findById.mockResolvedValue(invoice);
    mockProfiles.findByUserId.mockResolvedValue({ userId: 'u1', stripeCustomerId: 'cus_abc', stripePaymentMethodId: 'pm_xyz' });
    mockStripe.chargePaymentMethod.mockResolvedValue({ status: 'succeeded', paymentIntentId: 'pi_1' });
    mockInvoices.save.mockResolvedValue(undefined);
    mockPublish.paymentReceived.mockResolvedValue(undefined);

    const result = await useCase.execute({ invoiceId: 'inv-1', userId: 'u1' });

    expect(mockStripe.chargePaymentMethod).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cus_abc',
      paymentMethodId: 'pm_xyz',
      amount: 1000,
      currency: 'aud',
    }));
    expect(invoice.markPaid).toHaveBeenCalledOnce();
    expect(mockPublish.paymentReceived).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: 'paid' });
  });

  it('returns error when no saved payment method', async () => {
    mockInvoices.findById.mockResolvedValue(makeInvoice());
    mockProfiles.findByUserId.mockResolvedValue({ userId: 'u1', stripeCustomerId: 'cus_abc', stripePaymentMethodId: null });

    const result = await useCase.execute({ invoiceId: 'inv-1', userId: 'u1' });
    expect(result).toEqual({ error: 'No saved payment method' });
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
pnpm turbo test --filter=payment
```

- [ ] **Step 4: Implement the use case**

```typescript
// apps/payment/src/application/pay-saved-card.use-case.ts
import { InvoiceRepository } from '../domain/invoice-repository';
import { InvoiceStatus } from '../domain/invoice';
import { PaymentProfileRepository } from './payment-profile-repository';
import { StripeClient } from './stripe-client';

interface PaymentPublisher {
  paymentReceived(invoiceId: string): Promise<void>;
}

interface Input {
  invoiceId: string;
  userId: string;
}

type Output = { status: 'paid' } | { error: string };

export class PaySavedCardUseCase {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly profiles: PaymentProfileRepository,
    private readonly stripe: StripeClient,
    private readonly publish: PaymentPublisher,
  ) {}

  async execute(input: Input): Promise<Output> {
    const invoice = await this.invoices.findById(input.invoiceId);
    if (!invoice) return { error: 'Invoice not found' };
    if (invoice.winnerUserId !== input.userId) return { error: 'Forbidden' };
    if (invoice.status !== InvoiceStatus.PENDING) return { error: 'Invoice is not pending' };

    const profile = await this.profiles.findByUserId(input.userId);
    if (!profile?.stripePaymentMethodId) return { error: 'No saved payment method' };

    const { status } = await this.stripe.chargePaymentMethod({
      customerId: profile.stripeCustomerId,
      paymentMethodId: profile.stripePaymentMethodId,
      amount: invoice.amount,
      currency: invoice.currency,
      description: `Invoice ${invoice.id} — lot ${invoice.lotId}`,
    });

    if (status !== 'succeeded') return { error: 'Card declined' };

    invoice.markPaid();
    await this.invoices.save(invoice);
    await this.publish.paymentReceived(invoice.id);

    return { status: 'paid' };
  }
}
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
pnpm turbo test --filter=payment
```

- [ ] **Step 6: Add route and wire main.ts**

Add to `payment-router.ts` deps type:
```typescript
paySavedCard: PaySavedCardUseCase;
```

Add the route:
```typescript
router.post('/invoices/:id/pay-saved-card', async (c) => {
  const payload = c.get('jwtPayload');
  const invoiceId = c.req.param('id');
  const result = await deps.paySavedCard.execute({ invoiceId, userId: payload.userId });
  if ('error' in result) return c.json(result, 422);
  return c.json(result);
});
```

In `apps/payment/src/main.ts`, import and wire:
```typescript
import { PostgresPaymentProfileRepository } from './infrastructure/postgres-payment-profile-repository';
import { CreateSetupIntentUseCase } from './application/create-setup-intent.use-case';
import { ConfirmSetupIntentUseCase } from './application/confirm-setup-intent.use-case';
import { PaySavedCardUseCase } from './application/pay-saved-card.use-case';

// inside main():
const profileRepo = new PostgresPaymentProfileRepository(db);

const createSetupIntent = new CreateSetupIntentUseCase(profileRepo, stripeAdapter);
const confirmSetupIntent = new ConfirmSetupIntentUseCase(profileRepo, stripeAdapter);
const paySavedCard = new PaySavedCardUseCase(invoiceRepository, profileRepo, stripeAdapter, publish);

// auth middleware:
app.use('/api/payments/setup-intent*', authMiddleware(JWT_PUBLIC_KEY));
app.use('/api/payments/invoices/:id/pay-saved-card', authMiddleware(JWT_PUBLIC_KEY));

// add to buildPaymentRouter deps:
createSetupIntent,
confirmSetupIntent,
paySavedCard,
```

The `publish` object in main.ts already has `paymentReceived` if it was built in the prior payment plan. If it doesn't, add to `payment-event-publisher.ts`:
```typescript
paymentReceived: (invoiceId: string) => publisher.publish('payment.received', { invoiceId }),
```

- [ ] **Step 7: Run all payment tests**

```bash
pnpm turbo test --filter=payment
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/payment/src/
git commit -m "feat(payment): pay-saved-card endpoint for direct card charge"
```

---

### Task 8: admin — valuation enquiry endpoints

**Files:**
- Modify: `apps/admin/package.json` — add postgres, @aws-sdk/client-s3, @carat-room/shared-events
- Create: `apps/admin/src/infrastructure/db.ts`
- Create: `apps/admin/src/infrastructure/r2-upload-client.ts`
- Create: `apps/admin/src/infrastructure/r2-upload-client.test.ts`
- Create: `apps/admin/src/infrastructure/postgres-enquiry-repository.ts`
- Create: `apps/admin/src/infrastructure/postgres-enquiry-repository.test.ts`
- Create: `apps/admin/src/application/submit-valuation-enquiry.use-case.ts`
- Create: `apps/admin/src/application/submit-valuation-enquiry.use-case.test.ts`
- Create: `apps/admin/src/presentation/enquiries-router.ts`
- Create: `apps/admin/src/presentation/enquiries-router.test.ts`
- Modify: `apps/admin/src/main.ts` — wire enquiries router

**Interfaces:**
- Produces:
  - `POST /enquiries/valuation/upload` (public) → `{ key: string }`
  - `POST /enquiries/valuation` (public) → `{ ok: true }`

**Migration SQL** (run against admin service DB — create a new `admin_db` database or add to shared PostgreSQL instance):

```sql
CREATE TABLE IF NOT EXISTS valuation_enquiries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL,
  artist_maker TEXT,
  description TEXT NOT NULL,
  photo_keys  TEXT[] NOT NULL DEFAULT '{}',
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 1: Update `apps/admin/package.json`**

Add to `dependencies`:
```json
"postgres": "^3.4.4",
"@aws-sdk/client-s3": "^3.600.0",
"@carat-room/shared-events": "workspace:*"
```

Run in the monorepo root: `pnpm install`

- [ ] **Step 2: Create DB client**

```typescript
// apps/admin/src/infrastructure/db.ts
import postgres from 'postgres';

export type Db = ReturnType<typeof postgres>;

export function createDb(connectionUrl: string): Db {
  return postgres(connectionUrl);
}
```

- [ ] **Step 3: Create R2 upload client (same pattern as user-auth Task 2)**

```typescript
// apps/admin/src/infrastructure/r2-upload-client.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export class R2UploadClient {
  private readonly s3: S3Client;
  private readonly bucketName: string;

  constructor(config: R2Config) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucketName = config.bucketName;
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucketName, Key: key, Body: body, ContentType: contentType }));
  }
}
```

```typescript
// apps/admin/src/infrastructure/r2-upload-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { R2UploadClient } from './r2-upload-client';

vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn().mockResolvedValue({});
  return {
    S3Client: vi.fn(() => ({ send: mockSend })),
    PutObjectCommand: vi.fn((input) => ({ input })),
    __mockSend: mockSend,
  };
});

describe('R2UploadClient', () => {
  it('calls PutObjectCommand with correct parameters', async () => {
    const client = new R2UploadClient({ accountId: 'acc', accessKeyId: 'k', secretAccessKey: 's', bucketName: 'b' });
    const mod = vi.mocked(S3Client).mock.results[0].value as { send: ReturnType<typeof vi.fn> };
    await client.upload('valuation-enquiries/uploads/abc.jpg', Buffer.from('img'), 'image/jpeg');
    expect(PutObjectCommand).toHaveBeenCalledWith({ Bucket: 'b', Key: 'valuation-enquiries/uploads/abc.jpg', Body: expect.any(Buffer), ContentType: 'image/jpeg' });
    expect(mod.send).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 4: Write failing enquiry repository test**

```typescript
// apps/admin/src/infrastructure/postgres-enquiry-repository.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgresEnquiryRepository } from './postgres-enquiry-repository';

const mockDb = vi.fn().mockReturnValue([]);

describe('PostgresEnquiryRepository', () => {
  let repo: PostgresEnquiryRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.mockReturnValue([]);
    repo = new PostgresEnquiryRepository(mockDb as any);
  });

  it('inserts a valuation enquiry', async () => {
    await repo.save({
      category: 'Jewellery',
      artistMaker: null,
      description: 'Gold ring',
      photoKeys: ['valuation-enquiries/uploads/abc.jpg'],
      name: 'Jane Smith',
      email: 'jane@example.com',
    });
    expect(mockDb).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: Implement the repository**

```typescript
// apps/admin/src/infrastructure/postgres-enquiry-repository.ts
import { Db } from './db';

export interface ValuationEnquiry {
  category: string;
  artistMaker: string | null;
  description: string;
  photoKeys: string[];
  name: string;
  email: string;
}

export class PostgresEnquiryRepository {
  constructor(private readonly db: Db) {}

  async save(enquiry: ValuationEnquiry): Promise<void> {
    await this.db`
      INSERT INTO valuation_enquiries (category, artist_maker, description, photo_keys, name, email)
      VALUES (${enquiry.category}, ${enquiry.artistMaker}, ${enquiry.description}, ${enquiry.photoKeys}, ${enquiry.name}, ${enquiry.email})
    `;
  }
}
```

- [ ] **Step 6: Write failing use case test**

```typescript
// apps/admin/src/application/submit-valuation-enquiry.use-case.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubmitValuationEnquiryUseCase } from './submit-valuation-enquiry.use-case';

const mockRepo = { save: vi.fn() };
const mockPublish = vi.fn();

describe('SubmitValuationEnquiryUseCase', () => {
  let useCase: SubmitValuationEnquiryUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new SubmitValuationEnquiryUseCase(mockRepo as any, mockPublish);
  });

  it('saves enquiry and publishes event', async () => {
    mockRepo.save.mockResolvedValue(undefined);
    mockPublish.mockResolvedValue(undefined);

    const result = await useCase.execute({
      category: 'Jewellery',
      artistMaker: null,
      description: 'Diamond ring',
      photoKeys: [],
      name: 'Jane',
      email: 'jane@example.com',
    });

    expect(mockRepo.save).toHaveBeenCalledOnce();
    expect(mockPublish).toHaveBeenCalledWith('enquiry.valuation.received', expect.any(Object));
    expect(result).toEqual({ ok: true });
  });
});
```

- [ ] **Step 7: Implement the use case**

```typescript
// apps/admin/src/application/submit-valuation-enquiry.use-case.ts
import { PostgresEnquiryRepository, ValuationEnquiry } from '../infrastructure/postgres-enquiry-repository';

type PublishFn = (routingKey: string, payload: Record<string, unknown>) => Promise<void>;

export class SubmitValuationEnquiryUseCase {
  constructor(
    private readonly repo: PostgresEnquiryRepository,
    private readonly publish: PublishFn,
  ) {}

  async execute(input: ValuationEnquiry): Promise<{ ok: true }> {
    await this.repo.save(input);
    await this.publish('enquiry.valuation.received', {
      category: input.category,
      name: input.name,
      email: input.email,
    });
    return { ok: true };
  }
}
```

- [ ] **Step 8: Write failing router test**

```typescript
// apps/admin/src/presentation/enquiries-router.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { buildEnquiriesRouter } from './enquiries-router';

const mockSubmit = vi.fn().mockResolvedValue({ ok: true });
const mockR2 = { upload: vi.fn().mockResolvedValue(undefined) };

describe('enquiries-router', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/', buildEnquiriesRouter({ submitEnquiry: mockSubmit as any, r2: mockR2 as any }));
  });

  it('POST /enquiries/valuation returns ok', async () => {
    const res = await app.request('/enquiries/valuation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'Jewellery', description: 'Ring', photoKeys: [], name: 'Jane', email: 'j@x.com' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 9: Implement the enquiries router**

```typescript
// apps/admin/src/presentation/enquiries-router.ts
import { Hono } from 'hono';
import { SubmitValuationEnquiryUseCase } from '../application/submit-valuation-enquiry.use-case';
import { R2UploadClient } from '../infrastructure/r2-upload-client';
import { randomUUID } from 'crypto';

interface Deps {
  submitEnquiry: SubmitValuationEnquiryUseCase;
  r2: R2UploadClient;
}

const ALLOWED_UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function buildEnquiriesRouter(deps: Deps): Hono {
  const router = new Hono();

  router.post('/enquiries/valuation/upload', async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) return c.json({ error: 'Missing file' }, 400);
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) return c.json({ error: 'Unsupported file type' }, 422);

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_UPLOAD_BYTES) return c.json({ error: 'File exceeds 20 MB limit' }, 422);

    const ext = file.name.split('.').pop() ?? 'bin';
    const key = `valuation-enquiries/uploads/${randomUUID()}.${ext}`;
    await deps.r2.upload(key, buffer, file.type);

    return c.json({ key });
  });

  router.post('/enquiries/valuation', async (c) => {
    const input = await c.req.json<{
      category: string;
      artistMaker?: string;
      description: string;
      photoKeys: string[];
      name: string;
      email: string;
    }>();
    const result = await deps.submitEnquiry.execute({
      category: input.category,
      artistMaker: input.artistMaker ?? null,
      description: input.description,
      photoKeys: input.photoKeys,
      name: input.name,
      email: input.email,
    });
    return c.json(result);
  });

  return router;
}
```

- [ ] **Step 10: Run all admin tests**

```bash
pnpm turbo test --filter=@carat-room/admin
```

Expected: all tests PASS.

- [ ] **Step 11: Wire in `apps/admin/src/main.ts`**

```typescript
import { createAmqpConnection, EventPublisher } from '@carat-room/shared-events';
import { createDb } from './infrastructure/db';
import { R2UploadClient } from './infrastructure/r2-upload-client';
import { PostgresEnquiryRepository } from './infrastructure/postgres-enquiry-repository';
import { SubmitValuationEnquiryUseCase } from './application/submit-valuation-enquiry.use-case';
import { buildEnquiriesRouter } from './presentation/enquiries-router';

const PORT = Number(process.env['PORT'] ?? 3007);
const DATABASE_URL = process.env['ADMIN_DATABASE_URL']!;
const RABBITMQ_URL = process.env['RABBITMQ_URL']!;
const R2_ACCOUNT_ID = process.env['R2_ACCOUNT_ID']!;
const R2_ACCESS_KEY_ID = process.env['R2_ACCESS_KEY_ID']!;
const R2_SECRET_ACCESS_KEY = process.env['R2_SECRET_ACCESS_KEY']!;
const R2_BUCKET_NAME = process.env['R2_BUCKET_NAME']!;

// ... existing ServiceClient setup ...

const db = createDb(DATABASE_URL);
const r2 = new R2UploadClient({ accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucketName: R2_BUCKET_NAME });
const enquiryRepo = new PostgresEnquiryRepository(db);

const amqp = await createAmqpConnection(RABBITMQ_URL);
const publisher = new EventPublisher(amqp);
const publishEvent = (key: string, payload: Record<string, unknown>) => publisher.publish(key, payload);

const submitEnquiry = new SubmitValuationEnquiryUseCase(enquiryRepo, publishEvent);

app.route('/', buildEnquiriesRouter({ submitEnquiry, r2 }));
```

Note: The `main.ts` currently does not use `async`. Wrap the server setup in an `async main()` function (like user-auth's main.ts) since `createAmqpConnection` is async.

- [ ] **Step 12: Run all admin service tests**

```bash
pnpm turbo test --filter=@carat-room/admin
```

Expected: all tests PASS.

- [ ] **Step 13: Commit**

```bash
git add apps/admin/
git commit -m "feat(admin): valuation enquiry upload and submission endpoints"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `POST /users/identity-document` — Task 3
- ✅ `POST /payments/setup-intent` — Task 5
- ✅ `POST /payments/setup-intent/confirm` — Task 6
- ✅ `POST /payments/invoices/:id/pay-saved-card` — Task 7
- ✅ `POST /enquiries/valuation/upload` — Task 8
- ✅ `POST /enquiries/valuation` — Task 8
- ✅ PENDING_REVIEW status — Task 1
- ✅ identityDocumentKey on user record — Tasks 1–3

**Breaking change note:** `verifyPhone()` now sets `PHONE_VERIFIED` instead of `APPROVED_BIDDER`. Any existing test that asserts `APPROVED_BIDDER` after phone verification must be updated to `PHONE_VERIFIED`. The existing admin portal user-management routes that show/filter by status will still work — they pass status as a string.
