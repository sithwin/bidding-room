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

