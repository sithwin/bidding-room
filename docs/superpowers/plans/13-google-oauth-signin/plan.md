# Google OAuth Sign-In/Sign-Up Implementation Plan

> **EXECUTION PROMPT — if this file was tagged or attached, implement it as follows.**
> You are executing an already-approved plan. Do not re-plan or redesign — the design is approved in `docs/superpowers/specs/2026-07-17-google-oauth-signup-design.md`; read it first for context. Use the superpowers:subagent-driven-development skill (preferred) or superpowers:executing-plans.
>
> 1. Work on a dedicated branch (e.g. `feat/google-oauth-signin`) — never directly on `main`.
> 2. Execute Tasks 1 → 11 strictly in order; later tasks depend on earlier signatures (`GoogleAuthUseCase`, `findByGoogleId`, `User.createFromGoogle`, etc.) and compose env.
> 3. Follow every step exactly, including each TDD cycle: write the failing test, run it and see it fail, implement, see it pass, commit with the given message.
> 4. Tick each checkbox (`- [ ]` → `- [x]`) in this file immediately after completing its step.
> 5. Task 11 Step 2 (real-browser or Playwright-mocked verification) is a hard gate — do not declare the plan complete on unit tests alone.
> 6. When all tasks are done: run `pnpm lint` and `pnpm turbo test`, commit this updated plan file with `chore: mark all plan 13 tasks complete`, and report results honestly, including any failures.

**Goal:** Let users sign up and log in with Google, auto-linking to an existing password account by verified email, while leaving the phone-OTP/identity-document/payment pipeline unchanged.

**Architecture:** `user-portal` owns every browser-facing redirect (its origin is where the refresh-token cookie is scoped); `user-auth` owns the actual Google token exchange, `id_token` verification, and JWT issuance via the existing `TokenService` — reusing the same server-to-server `Set-Cookie`-forwarding pattern the password-login proxy already uses. Clean Architecture is preserved: a new `GoogleIdentityProvider` port in `application/` is implemented by `infrastructure/google/`.

**Tech Stack:** Hono, `jose` (JWKS/id_token verification — already used in `packages/shared-auth`), Next.js Route Handlers, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-17-google-oauth-signup-design.md`

## Prerequisite (manual, outside this plan)

Before Task 6's env vars can hold real values, provision an OAuth 2.0 Client ID in Google Cloud Console (APIs & Services → Credentials → OAuth client ID → Web application), with an **exact-match** authorized redirect URI of `<portal-origin>/api/auth/google/callback` (no wildcard — see the design spec's redirect-URI allow-list note). This produces the `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` values referenced throughout. Not required for Tasks 1–11 themselves (all automated tests use fakes/mocks), only for a real deployment and the manual browser check in Final Steps.

## Global Constraints

- British English in all copy and comments ("verification", "authorise").
- Named exports only — never `export default` (exception: Next.js page components, which the framework requires as default exports).
- Single quotes for string literals; TypeScript strict mode; no `@ts-ignore`.
- Test names follow `should_[expectedBehaviour]_when_[condition]`; tests co-located next to source (`x.ts` → `x.test.ts`).
- Clean Architecture: `domain/`/`application/` never import infrastructure/presentation; `presentation/` receives implementations by injection from `src/main.ts`. `pnpm lint` enforces layer boundaries.
- Error envelope: `{ error: { code: string, message: string } }`.
- Google provider only (v1) — no Facebook/Apple.
- Skip `EMAIL_VERIFIED` only; phone OTP, identity document, and payment steps are unchanged.
- Auto-link to an existing password account by verified email; reject sign-in if Google reports `email_verified: false`.
- `passwordHash` becomes nullable; Google-only accounts can add a password later.
- "Continue with Google" appears on both the login and register tabs.

## Spec Coverage Checklist

Domain/data (Tasks 1–2):
- [C1] `passwordHash` nullable on `User`/`UserProps`
- [C2] New `authProvider: 'PASSWORD' | 'GOOGLE' | 'BOTH'` and `googleId: string | null` fields
- [C3] `User.createFromGoogle()` factory — starts at `EMAIL_VERIFIED`, no password
- [C4] `User.linkGoogleAccount(googleId)` — flips `PASSWORD` → `BOTH`
- [C5] `User.setPassword(hash)` — flips `GOOGLE` → `BOTH`, rejects if already set
- [C6] `UserRepository.findByGoogleId()`
- [C7] Migration `003_add_google_auth.sql`, idempotent, mirrored into `tests/db-init/init.sql`

Google token exchange (Task 3):
- [C8] `application/google-identity-provider.ts` port: `exchangeCodeForProfile(code, codeVerifier): Promise<GoogleProfile>`
- [C9] `infrastructure/google/google-identity-provider.ts` exchanges code via Google's token endpoint with PKCE `code_verifier`
- [C10] `id_token` verified against Google's JWKS, `iss`/`aud` checked
- [C11] `email_verified !== true` ⇒ reject

Use cases (Tasks 4–5):
- [C12] `GoogleAuthUseCase`: match by `googleId` → login; else match by email → auto-link; else create new user
- [C13] `SetPasswordUseCase`: rejects if a password is already set
- [C14] `LoginUseCase` rejects password login with a clear error when `passwordHash` is null

Backend wiring (Task 6):
- [C15] `POST /api/users/auth/google` — issues the same JWT/cookie shape as `/login`; deliberately not gated by the merged Turnstile `humanCheck` middleware (Google's consent screen is itself the human check — see Task 6's note)
- [C16] `POST /api/users/me/password` — authenticated, sets a password for a Google-only account
- [C17] `main.ts` constructs `GoogleOAuthIdentityProvider` from `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`, boot fails fast if unset
- [C18] `docker-compose.yml` and `docker-compose.test.yml` updated with the new env vars

Frontend (Tasks 8–10):
- [C19] `GET /api/auth/google` — builds Google's authorize URL, stores state+PKCE in a `SameSite=Lax` cookie
- [C20] `GET /api/auth/google/callback` — validates state, exchanges code server-to-server, forwards `Set-Cookie`
- [C21] `/account/oauth-complete` — hydrates `AuthContext` via existing `refreshAccessToken()`, then redirects
- [C22] "Continue with Google" button on the login/register tab bar
- [C23] Cancelled/unverified/failed Google sign-in shows a message in the existing `serverError` slot
- [C24] Account settings page with a "Set password" form for `passwordHash === null` accounts

Testing (Tasks 1–11):
- [C25] Unit tests for all new domain methods, use cases, and the identity provider
- [C26] Router integration test for `/auth/google` and `/me/password`
- [C27] Playwright E2E driving the full redirect → callback → dashboard flow with Google's endpoints mocked, plus the set-password flow

---

## File Map

```
apps/user-auth/
  src/domain/
    user.ts                              — modify: nullable passwordHash, googleId, authProvider, createFromGoogle, linkGoogleAccount, setPassword
    user.test.ts                         — modify: new-method coverage
    user-repository.ts                   — modify: findByGoogleId
  src/application/
    google-identity-provider.ts          — create: port
    google-auth.use-case.ts              — create
    google-auth.use-case.test.ts         — create
    set-password.use-case.ts             — create
    set-password.use-case.test.ts        — create
    login.use-case.ts                    — modify: reject null passwordHash
    use-cases.test.ts                    — modify: new login-rejection case
  src/infrastructure/
    google/
      google-identity-provider.ts        — create: GoogleOAuthIdentityProvider + createGoogleIdTokenVerifier
      google-identity-provider.test.ts   — create
    db/postgres-user-repository.ts       — modify: google_id/auth_provider mapping, findByGoogleId, updatable password_hash
    db/postgres-user-repository.test.ts  — modify: new-column coverage
  src/presentation/
    user-router.ts                       — modify: POST /auth/google, POST /me/password, login error mapping
    user-router.google.test.ts           — create
  migrations/003_add_google_auth.sql     — create
  src/main.ts                            — modify: DI wiring, env vars, rate limits

tests/db-init/init.sql                   — modify: mirror migration 003

docker-compose.yml                       — modify: GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI
docker-compose.test.yml                  — modify: test values for the above

apps/user-portal/
  src/lib/service-config.ts              — modify: Google env constants, state cookie name
  src/app/api/auth/google/
    route.ts                             — create: redirect to Google
    callback/route.ts                    — create: exchange + cookie forward
  src/app/account/
    login/login-client.tsx               — modify: Google button + error messaging
    oauth-complete/page.tsx              — create
    oauth-complete/oauth-complete-client.tsx — create
    settings/page.tsx                    — create
    settings/settings-client.tsx         — create

packages/shared-types/
  src/api/user-auth.ts                   — modify: hasPassword on meSchema
  src/api/user-auth.test.ts              — modify

tests/e2e/
  support/mock-google-server.ts          — create
  global-setup.ts                        — modify: boot the mock Google server
  specs/google-oauth.spec.ts             — create
```

**Total new/modified test files: 11**

---

### Task 1: Domain — nullable password, Google identity fields

Covers: C1, C2, C3, C4, C5, C25 (domain slice)

**Files:**
- Modify: `apps/user-auth/src/domain/user.ts`
- Modify: `apps/user-auth/src/domain/user.test.ts`

**Interfaces:**
- Consumes: nothing (leaf task).
- Produces: `export type AuthProvider = 'PASSWORD' | 'GOOGLE' | 'BOTH';` and on `User`: `static createFromGoogle(params: { id: string; email: string; googleId: string; role: UserRole; country?: string }): User`, `linkGoogleAccount(googleId: string): void`, `setPassword(passwordHash: string): void`, getters `googleId: string | null` and `authProvider: AuthProvider`. `UserProps.passwordHash` becomes `string | null`. Tasks 2–7 import all of these by these exact names.

- [ ] **Step 1: Write the failing tests**

Append to `apps/user-auth/src/domain/user.test.ts` (the file already has a `describe('User', ...)` block with `UserRole.BUYER` imported — add these `it` blocks inside it, importing `AuthProvider` alongside the existing `User`/`UserRole`/`UserStatus` imports):

```typescript
it('should_startAtEmailVerifiedWithNoPassword_when_createdFromGoogle', () => {
  const user = User.createFromGoogle({
    id: 'u-1',
    email: 'jane@example.com',
    googleId: 'google-sub-123',
    role: UserRole.BUYER,
  });

  expect(user.passwordHash).toBeNull();
  expect(user.googleId).toBe('google-sub-123');
  expect(user.authProvider).toBe('GOOGLE');
  expect(user.status).toBe(UserStatus.EMAIL_VERIFIED);
});

it('should_setAuthProviderToBoth_when_linkingGoogleToPasswordAccount', () => {
  const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });

  user.linkGoogleAccount('google-sub-123');

  expect(user.googleId).toBe('google-sub-123');
  expect(user.authProvider).toBe('BOTH');
});

it('should_throwError_when_linkingGoogleToAccountAlreadyLinked', () => {
  const user = User.createFromGoogle({ id: 'u-1', email: 'jane@example.com', googleId: 'google-sub-123', role: UserRole.BUYER });

  expect(() => user.linkGoogleAccount('google-sub-456')).toThrow('Google account already linked');
});

it('should_setAuthProviderToBoth_when_settingPasswordOnGoogleOnlyAccount', () => {
  const user = User.createFromGoogle({ id: 'u-1', email: 'jane@example.com', googleId: 'google-sub-123', role: UserRole.BUYER });

  user.setPassword('new-hash');

  expect(user.passwordHash).toBe('new-hash');
  expect(user.authProvider).toBe('BOTH');
});

it('should_throwError_when_settingPasswordOnAccountThatAlreadyHasOne', () => {
  const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });

  expect(() => user.setPassword('new-hash')).toThrow('Password already set');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @carat-room/user-auth test -- user.test.ts`
Expected: FAIL — `User.createFromGoogle is not a function`, `user.linkGoogleAccount is not a function`, `user.setPassword is not a function`.

- [ ] **Step 3: Implement the domain changes**

In `apps/user-auth/src/domain/user.ts`, add the `AuthProvider` type, widen `passwordHash`, add `googleId`/`authProvider` to `UserProps`, add the new factory and methods, and add the two new getters:

```typescript
export type AuthProvider = 'PASSWORD' | 'GOOGLE' | 'BOTH';

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  authProvider: AuthProvider;
  phone: string | null;
  status: UserStatus;
  role: UserRole;
  country: string | null;
  identityDocumentKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

Update `create()` to set the two new fields on the `PASSWORD` path:

```typescript
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
    googleId: null,
    authProvider: 'PASSWORD',
    phone: null,
    status: UserStatus.REGISTERED,
    role: params.role,
    country: params.country ?? null,
    identityDocumentKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

static createFromGoogle(params: {
  id: string;
  email: string;
  googleId: string;
  role: UserRole;
  country?: string;
}): User {
  return new User({
    id: params.id,
    email: params.email,
    passwordHash: null,
    googleId: params.googleId,
    authProvider: 'GOOGLE',
    phone: null,
    status: UserStatus.EMAIL_VERIFIED,
    role: params.role,
    country: params.country ?? null,
    identityDocumentKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
```

Add getters next to the existing ones:

```typescript
get passwordHash(): string | null { return this.props.passwordHash; }
get googleId(): string | null { return this.props.googleId; }
get authProvider(): AuthProvider { return this.props.authProvider; }
```

(This replaces the existing `get passwordHash(): string { return this.props.passwordHash; }` getter — the return type widens to `string | null`.)

Add the two new mutation methods, alongside `verifyEmail()`/`verifyPhone()`:

```typescript
linkGoogleAccount(googleId: string): void {
  if (this.props.googleId) {
    throw new Error('Google account already linked');
  }
  this.props.googleId = googleId;
  this.props.authProvider = this.props.authProvider === 'PASSWORD' ? 'BOTH' : this.props.authProvider;
  this.props.updatedAt = new Date();
}

setPassword(passwordHash: string): void {
  if (this.props.passwordHash) {
    throw new Error('Password already set');
  }
  this.props.passwordHash = passwordHash;
  this.props.authProvider = this.props.authProvider === 'GOOGLE' ? 'BOTH' : this.props.authProvider;
  this.props.updatedAt = new Date();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @carat-room/user-auth test -- user.test.ts`
Expected: PASS — all tests including the 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/user-auth/src/domain/user.ts apps/user-auth/src/domain/user.test.ts
git commit -m "feat(user-auth): add Google identity fields to User domain entity"
```

---

### Task 2: Repository, migration, and test-DB schema mirror

Covers: C6, C7, C25 (repository slice)

**Files:**
- Modify: `apps/user-auth/src/domain/user-repository.ts`
- Modify: `apps/user-auth/src/infrastructure/db/postgres-user-repository.ts`
- Modify: `apps/user-auth/src/infrastructure/db/postgres-user-repository.test.ts`
- Create: `apps/user-auth/migrations/003_add_google_auth.sql`
- Modify: `tests/db-init/init.sql`

**Interfaces:**
- Consumes: `User`, `UserProps`, `AuthProvider` from Task 1.
- Produces: `UserRepository.findByGoogleId(googleId: string): Promise<User | null>`. Task 4 (`GoogleAuthUseCase`) calls this exact method.

- [ ] **Step 1: Add the migration**

Create `apps/user-auth/migrations/003_add_google_auth.sql`:

```sql
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'PASSWORD';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
```

This follows the existing `002_add_identity_document_key.sql` style: no down-migration, every statement safe to re-run (`DROP NOT NULL` on an already-nullable column is a no-op; `ADD COLUMN IF NOT EXISTS` and `CREATE ... IF NOT EXISTS` are idempotent).

- [ ] **Step 2: Mirror the schema into the test-DB bootstrap**

In `tests/db-init/init.sql`, inside the `\c user_test` section, change:

```sql
  password_hash          TEXT NOT NULL,
```

to:

```sql
  password_hash          TEXT,
```

and add two new columns plus the partial unique index directly below the existing `identity_document_key` column and `idx_users_email` index:

```sql
  google_id              TEXT,
  auth_provider           TEXT NOT NULL DEFAULT 'PASSWORD',
```

```sql
CREATE UNIQUE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
```

- [ ] **Step 3: Add `findByGoogleId` to the repository interface**

In `apps/user-auth/src/domain/user-repository.ts`, add to `UserRepository`:

```typescript
findByGoogleId(googleId: string): Promise<User | null>;
```

- [ ] **Step 4: Write the failing repository test**

Append to `apps/user-auth/src/infrastructure/db/postgres-user-repository.test.ts`, inside the existing `describe('PostgresUserRepository', ...)` block (it already has `repo` built in `beforeEach` against `TEST_DATABASE_URL`, and truncates `users` before each test — follow that exact setup, do not re-declare it):

```typescript
it('should_findUser_when_googleIdMatches', async () => {
  const user = User.createFromGoogle({
    id: 'u-google-1',
    email: 'google.user@example.com',
    googleId: 'google-sub-abc',
    role: UserRole.BUYER,
  });
  await repo.save(user);

  const found = await repo.findByGoogleId('google-sub-abc');

  expect(found?.id).toBe('u-google-1');
  expect(found?.authProvider).toBe('GOOGLE');
  expect(found?.passwordHash).toBeNull();
});

it('should_returnNull_when_noUserHasThatGoogleId', async () => {
  const found = await repo.findByGoogleId('nonexistent-sub');

  expect(found).toBeNull();
});

it('should_persistLinkedGoogleAccount_when_saved', async () => {
  const user = User.create({ id: 'u-pw-1', email: 'pw.user@example.com', passwordHash: 'h', role: UserRole.BUYER });
  await repo.save(user);

  user.linkGoogleAccount('google-sub-def');
  await repo.save(user);

  const found = await repo.findByGoogleId('google-sub-def');
  expect(found?.id).toBe('u-pw-1');
  expect(found?.authProvider).toBe('BOTH');
  expect(found?.passwordHash).toBe('h');
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `pnpm --filter @carat-room/user-auth test -- postgres-user-repository.test.ts`
Expected: FAIL — `repo.findByGoogleId is not a function`, and TypeScript errors on `User.createFromGoogle`/`linkGoogleAccount` if the repository/entity typing hasn't been updated yet (it has, from Task 1; the failure here is purely the missing repository method).

- [ ] **Step 6: Implement the repository changes**

In `apps/user-auth/src/infrastructure/db/postgres-user-repository.ts`, update `UserRow`:

```typescript
interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  auth_provider: string;
  phone: string | null;
  status: string;
  role: string;
  country: string | null;
  identity_document_key: string | null;
  created_at: Date;
  updated_at: Date;
}
```

Add `findByGoogleId`:

```typescript
async findByGoogleId(googleId: string): Promise<User | null> {
  const [row] = await this.db<UserRow[]>`SELECT * FROM users WHERE google_id = ${googleId}`;
  return row ? this.toEntity(row) : null;
}
```

Update `save()` — `google_id` and `auth_provider` are set at creation and mutable afterwards (linking/setting a password happens post-creation), so they belong in both the `INSERT` list and the `ON CONFLICT ... SET` clause. `password_hash` must also become updatable now that `setPassword()` can set it after creation — `email` remains the only immutable field:

```typescript
async save(user: User): Promise<void> {
  const props = user.toProps();
  await this.db`
    INSERT INTO users (id, email, password_hash, google_id, auth_provider, phone, status, role, country, identity_document_key, created_at, updated_at)
    VALUES (${props.id}, ${props.email}, ${props.passwordHash}, ${props.googleId}, ${props.authProvider}, ${props.phone}, ${props.status}, ${props.role}, ${props.country}, ${props.identityDocumentKey}, ${props.createdAt}, ${props.updatedAt})
    -- email is intentionally immutable after creation — every other field is updated
    ON CONFLICT (id) DO UPDATE
      SET password_hash          = EXCLUDED.password_hash,
          google_id              = EXCLUDED.google_id,
          auth_provider          = EXCLUDED.auth_provider,
          phone                  = EXCLUDED.phone,
          status                 = EXCLUDED.status,
          country                = EXCLUDED.country,
          identity_document_key  = EXCLUDED.identity_document_key,
          updated_at             = EXCLUDED.updated_at
  `;
}
```

Update `toEntity`:

```typescript
private toEntity(row: UserRow): User {
  const props: UserProps = {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    googleId: row.google_id,
    authProvider: row.auth_provider as AuthProvider,
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
```

Add `AuthProvider` to the import from `../../domain/user`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @carat-room/user-auth test -- postgres-user-repository.test.ts`
Expected: PASS — requires `TEST_DATABASE_URL` pointed at a Postgres with migrations applied; run `docker compose -f docker-compose.test.yml up -d --build` first if not already running, per the repo's integration-test convention.

- [ ] **Step 8: Commit**

```bash
git add apps/user-auth/src/domain/user-repository.ts apps/user-auth/src/infrastructure/db/postgres-user-repository.ts apps/user-auth/src/infrastructure/db/postgres-user-repository.test.ts apps/user-auth/migrations/003_add_google_auth.sql tests/db-init/init.sql
git commit -m "feat(user-auth): add findByGoogleId and Google auth columns"
```

---

### Task 3: GoogleIdentityProvider port + implementation

Covers: C8, C9, C10, C11, C25 (provider slice)

**Files:**
- Create: `apps/user-auth/src/application/google-identity-provider.ts`
- Create: `apps/user-auth/src/infrastructure/google/google-identity-provider.ts`
- Create: `apps/user-auth/src/infrastructure/google/google-identity-provider.test.ts`
- Modify: `apps/user-auth/package.json` (add `jose` dependency)

**Interfaces:**
- Consumes: nothing (leaf task).
- Produces: `interface GoogleProfile { providerId: string; email: string; emailVerified: boolean }`, `interface GoogleIdentityProvider { exchangeCodeForProfile(code: string, codeVerifier: string): Promise<GoogleProfile> }` (application port), and `class GoogleOAuthIdentityProvider implements GoogleIdentityProvider` with `constructor(clientId: string, clientSecret: string, redirectUri: string, verifyIdToken: IdTokenVerifier)` plus `createGoogleIdTokenVerifier(clientId: string): IdTokenVerifier`. Task 4 imports `GoogleIdentityProvider`/`GoogleProfile`; Task 6 (`main.ts`) imports `GoogleOAuthIdentityProvider` and `createGoogleIdTokenVerifier`.

- [ ] **Step 1: Add the `jose` dependency**

`jose@^5.3.0` is already used in `packages/shared-auth` for JWKS verification — add the same version directly to `apps/user-auth/package.json`'s `dependencies`:

```json
    "jose": "^5.3.0",
```

Run: `pnpm install`

- [ ] **Step 2: Create the port**

```typescript
// apps/user-auth/src/application/google-identity-provider.ts
export interface GoogleProfile {
  providerId: string;
  email: string;
  emailVerified: boolean;
}

export interface GoogleIdentityProvider {
  exchangeCodeForProfile(code: string, codeVerifier: string): Promise<GoogleProfile>;
}
```

- [ ] **Step 3: Write the failing tests**

```typescript
// apps/user-auth/src/infrastructure/google/google-identity-provider.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleOAuthIdentityProvider } from './google-identity-provider';

const CLIENT_ID = 'test-client-id';
const CLIENT_SECRET = 'test-client-secret';
const REDIRECT_URI = 'https://portal.example.com/api/auth/google/callback';

describe('GoogleOAuthIdentityProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should_returnProfile_when_tokenExchangeAndVerificationSucceed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id_token: 'fake-id-token' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const verifyIdToken = vi.fn().mockResolvedValue({
      sub: 'google-sub-123',
      email: 'jane@example.com',
      email_verified: true,
    });

    const sut = new GoogleOAuthIdentityProvider(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, verifyIdToken);
    const profile = await sut.exchangeCodeForProfile('auth-code', 'code-verifier');

    expect(profile).toEqual({ providerId: 'google-sub-123', email: 'jane@example.com', emailVerified: true });
    expect(verifyIdToken).toHaveBeenCalledWith('fake-id-token');
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = requestInit.body as URLSearchParams;
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('code_verifier')).toBe('code-verifier');
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('should_reportEmailNotVerified_when_googleClaimIsFalse', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id_token: 'fake-id-token' }), { status: 200 }),
    ));
    const verifyIdToken = vi.fn().mockResolvedValue({
      sub: 'google-sub-123',
      email: 'jane@example.com',
      email_verified: false,
    });

    const sut = new GoogleOAuthIdentityProvider(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, verifyIdToken);
    const profile = await sut.exchangeCodeForProfile('auth-code', 'code-verifier');

    expect(profile.emailVerified).toBe(false);
  });

  it('should_throwError_when_tokenExchangeFails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad request', { status: 400 })));
    const verifyIdToken = vi.fn();

    const sut = new GoogleOAuthIdentityProvider(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, verifyIdToken);

    await expect(sut.exchangeCodeForProfile('bad-code', 'code-verifier')).rejects.toThrow(
      'Google token exchange failed',
    );
  });

  it('should_throwError_when_idTokenMissingEmailClaim', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id_token: 'fake-id-token' }), { status: 200 }),
    ));
    const verifyIdToken = vi.fn().mockResolvedValue({ sub: 'google-sub-123' });

    const sut = new GoogleOAuthIdentityProvider(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, verifyIdToken);

    await expect(sut.exchangeCodeForProfile('auth-code', 'code-verifier')).rejects.toThrow(
      'Google id_token is missing required claims',
    );
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @carat-room/user-auth test -- google-identity-provider.test.ts`
Expected: FAIL — `Cannot find module './google-identity-provider'`.

- [ ] **Step 5: Implement**

```typescript
// apps/user-auth/src/infrastructure/google/google-identity-provider.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { GoogleIdentityProvider, GoogleProfile } from '../../application/google-identity-provider';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUER = 'https://accounts.google.com';

interface GoogleTokenResponse {
  id_token: string;
}

interface GoogleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
}

export type IdTokenVerifier = (idToken: string) => Promise<GoogleIdTokenClaims>;

export function createGoogleIdTokenVerifier(clientId: string): IdTokenVerifier {
  const jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  return async (idToken: string) => {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: GOOGLE_ISSUER,
      audience: clientId,
    });
    return payload as GoogleIdTokenClaims;
  };
}

export class GoogleOAuthIdentityProvider implements GoogleIdentityProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    private readonly verifyIdToken: IdTokenVerifier,
  ) {}

  async exchangeCodeForProfile(code: string, codeVerifier: string): Promise<GoogleProfile> {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      throw new Error('Google token exchange failed');
    }

    const body = (await response.json()) as GoogleTokenResponse;
    const claims = await this.verifyIdToken(body.id_token);

    if (typeof claims.email !== 'string') {
      throw new Error('Google id_token is missing required claims');
    }

    return {
      providerId: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true,
    };
  }
}
```

`createGoogleIdTokenVerifier` is a thin wrapper around `jose`'s remote-JWKS verification, used only from `main.ts` (Task 6) — it is intentionally not unit tested directly since it requires a live network call to Google's JWKS endpoint; `GoogleOAuthIdentityProvider`'s tests inject a fake `verifyIdToken` instead, matching the `TurnstileVerifier` stubbed-`fetch` pattern already used elsewhere in this service.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @carat-room/user-auth test -- google-identity-provider.test.ts`
Expected: PASS — all 4 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/user-auth/package.json pnpm-lock.yaml apps/user-auth/src/application/google-identity-provider.ts apps/user-auth/src/infrastructure/google/
git commit -m "feat(user-auth): add Google OAuth token exchange and id_token verification"
```

---

### Task 4: GoogleAuthUseCase

Covers: C12, C25 (use-case slice)

**Files:**
- Create: `apps/user-auth/src/application/google-auth.use-case.ts`
- Create: `apps/user-auth/src/application/google-auth.use-case.test.ts`

**Interfaces:**
- Consumes: `UserRepository.findByGoogleId`/`findByEmail`/`save` (Task 2), `User.createFromGoogle`/`linkGoogleAccount` (Task 1), `TokenService.issueAccessToken`/`issueRefreshToken`/`hashRefreshToken` (existing), `TokenRepository.saveRefreshToken` (existing), `GoogleIdentityProvider.exchangeCodeForProfile` (Task 3).
- Produces: `class GoogleAuthUseCase { constructor(userRepo: UserRepository, tokenRepo: TokenRepository, tokenService: TokenService, googleIdentityProvider: GoogleIdentityProvider); execute(dto: { code: string; codeVerifier: string }): Promise<{ accessToken: string; refreshToken: string }> }`. Task 6 (`user-router.ts`, `main.ts`) uses this exact shape — mirrors `LoginUseCase`'s result type.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/user-auth/src/application/google-auth.use-case.test.ts
import { describe, it, expect, vi } from 'vitest';
import { GoogleAuthUseCase } from './google-auth.use-case';
import { User, UserRole } from '../domain/user';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../domain/token-repository';
import { TokenService } from './token-service';
import { GoogleIdentityProvider } from './google-identity-provider';

const makeUserRepo = (): UserRepository => ({
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findByGoogleId: vi.fn(),
  findAll: vi.fn(),
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

const makeTokenService = () =>
  ({
    issueAccessToken: vi.fn().mockReturnValue('access-token'),
    issueRefreshToken: vi.fn().mockReturnValue('refresh-token'),
    hashRefreshToken: vi.fn().mockReturnValue('hashed-refresh'),
    verifyAccessToken: vi.fn(),
  } as unknown as TokenService);

const makeGoogleIdentityProvider = (): GoogleIdentityProvider => ({
  exchangeCodeForProfile: vi.fn(),
});

describe('GoogleAuthUseCase', () => {
  it('should_createNewUser_when_noAccountMatchesGoogleIdOrEmail', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const tokenService = makeTokenService();
    const googleIdentityProvider = makeGoogleIdentityProvider();
    (googleIdentityProvider.exchangeCodeForProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      providerId: 'google-sub-123',
      email: 'new.user@example.com',
      emailVerified: true,
    });
    (userRepo.findByGoogleId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const sut = new GoogleAuthUseCase(userRepo, tokenRepo, tokenService, googleIdentityProvider);
    const result = await sut.execute({ code: 'auth-code', codeVerifier: 'verifier' });

    expect(userRepo.save).toHaveBeenCalledOnce();
    const savedUser = (userRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as User;
    expect(savedUser.email).toBe('new.user@example.com');
    expect(savedUser.googleId).toBe('google-sub-123');
    expect(savedUser.authProvider).toBe('GOOGLE');
    expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
  });

  it('should_linkGoogleAccount_when_emailMatchesExistingPasswordAccount', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const tokenService = makeTokenService();
    const googleIdentityProvider = makeGoogleIdentityProvider();
    (googleIdentityProvider.exchangeCodeForProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      providerId: 'google-sub-123',
      email: 'existing@example.com',
      emailVerified: true,
    });
    const existing = User.create({ id: 'u-1', email: 'existing@example.com', passwordHash: 'h', role: UserRole.BUYER });
    (userRepo.findByGoogleId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    const sut = new GoogleAuthUseCase(userRepo, tokenRepo, tokenService, googleIdentityProvider);
    await sut.execute({ code: 'auth-code', codeVerifier: 'verifier' });

    expect(userRepo.save).toHaveBeenCalledWith(existing);
    expect(existing.googleId).toBe('google-sub-123');
    expect(existing.authProvider).toBe('BOTH');
  });

  it('should_logInWithoutSaving_when_googleIdAlreadyLinked', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const tokenService = makeTokenService();
    const googleIdentityProvider = makeGoogleIdentityProvider();
    (googleIdentityProvider.exchangeCodeForProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      providerId: 'google-sub-123',
      email: 'returning@example.com',
      emailVerified: true,
    });
    const existing = User.createFromGoogle({ id: 'u-1', email: 'returning@example.com', googleId: 'google-sub-123', role: UserRole.BUYER });
    (userRepo.findByGoogleId as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    const sut = new GoogleAuthUseCase(userRepo, tokenRepo, tokenService, googleIdentityProvider);
    const result = await sut.execute({ code: 'auth-code', codeVerifier: 'verifier' });

    expect(userRepo.save).not.toHaveBeenCalled();
    expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
  });

  it('should_throwError_when_googleReportsEmailNotVerified', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const tokenService = makeTokenService();
    const googleIdentityProvider = makeGoogleIdentityProvider();
    (googleIdentityProvider.exchangeCodeForProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      providerId: 'google-sub-123',
      email: 'unverified@example.com',
      emailVerified: false,
    });

    const sut = new GoogleAuthUseCase(userRepo, tokenRepo, tokenService, googleIdentityProvider);

    await expect(sut.execute({ code: 'auth-code', codeVerifier: 'verifier' })).rejects.toThrow(
      'Google email not verified',
    );
    expect(userRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @carat-room/user-auth test -- google-auth.use-case.test.ts`
Expected: FAIL — `Cannot find module './google-auth.use-case'`.

- [ ] **Step 3: Implement**

```typescript
// apps/user-auth/src/application/google-auth.use-case.ts
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole } from '../domain/user';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../domain/token-repository';
import { TokenService } from './token-service';
import { GoogleIdentityProvider } from './google-identity-provider';

interface GoogleAuthDto {
  code: string;
  codeVerifier: string;
}

interface GoogleAuthResult {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class GoogleAuthUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly tokenService: TokenService,
    private readonly googleIdentityProvider: GoogleIdentityProvider,
  ) {}

  async execute(dto: GoogleAuthDto): Promise<GoogleAuthResult> {
    const profile = await this.googleIdentityProvider.exchangeCodeForProfile(dto.code, dto.codeVerifier);

    if (!profile.emailVerified) {
      throw new Error('Google email not verified');
    }

    let user = await this.userRepo.findByGoogleId(profile.providerId);

    if (!user) {
      const existingByEmail = await this.userRepo.findByEmail(profile.email);
      if (existingByEmail) {
        existingByEmail.linkGoogleAccount(profile.providerId);
        await this.userRepo.save(existingByEmail);
        user = existingByEmail;
      } else {
        user = User.createFromGoogle({
          id: uuidv4(),
          email: profile.email,
          googleId: profile.providerId,
          role: UserRole.BUYER,
        });
        await this.userRepo.save(user);
      }
    }

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @carat-room/user-auth test -- google-auth.use-case.test.ts`
Expected: PASS — all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/user-auth/src/application/google-auth.use-case.ts apps/user-auth/src/application/google-auth.use-case.test.ts
git commit -m "feat(user-auth): add GoogleAuthUseCase with create/link/login logic"
```

---

### Task 5: SetPasswordUseCase and LoginUseCase null-password rejection

Covers: C13, C14, C25 (use-case slice)

**Files:**
- Create: `apps/user-auth/src/application/set-password.use-case.ts`
- Create: `apps/user-auth/src/application/set-password.use-case.test.ts`
- Modify: `apps/user-auth/src/application/login.use-case.ts`
- Modify: `apps/user-auth/src/application/use-cases.test.ts`

**Interfaces:**
- Consumes: `UserRepository.findById`/`save` (existing/Task 2), `User.setPassword` (Task 1), `PasswordService.hash` (existing).
- Produces: `class SetPasswordUseCase { constructor(userRepo: UserRepository, passwordService: PasswordService); execute(dto: { userId: string; password: string }): Promise<void> }`. Task 6 (`user-router.ts`, `main.ts`) uses this exact shape.

- [ ] **Step 1: Write the failing `SetPasswordUseCase` tests**

```typescript
// apps/user-auth/src/application/set-password.use-case.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SetPasswordUseCase } from './set-password.use-case';
import { User, UserRole } from '../domain/user';
import { UserRepository } from '../domain/user-repository';
import { PasswordService } from './password-service';

const makeUserRepo = (): UserRepository => ({
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findByGoogleId: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
});

const makePasswordService = () =>
  ({ hash: vi.fn(), verify: vi.fn() } as unknown as PasswordService);

describe('SetPasswordUseCase', () => {
  it('should_setPasswordAndSave_when_userHasNoPasswordYet', async () => {
    const userRepo = makeUserRepo();
    const passwordService = makePasswordService();
    const user = User.createFromGoogle({ id: 'u-1', email: 'jane@example.com', googleId: 'google-sub-123', role: UserRole.BUYER });
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (passwordService.hash as ReturnType<typeof vi.fn>).mockResolvedValue('new-hash');

    const sut = new SetPasswordUseCase(userRepo, passwordService);
    await sut.execute({ userId: 'u-1', password: 'new-secret-123' });

    expect(user.passwordHash).toBe('new-hash');
    expect(userRepo.save).toHaveBeenCalledWith(user);
  });

  it('should_throwError_when_userNotFound', async () => {
    const userRepo = makeUserRepo();
    const passwordService = makePasswordService();
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const sut = new SetPasswordUseCase(userRepo, passwordService);

    await expect(sut.execute({ userId: 'missing', password: 'new-secret-123' })).rejects.toThrow('User not found');
  });

  it('should_throwError_when_passwordAlreadySet', async () => {
    const userRepo = makeUserRepo();
    const passwordService = makePasswordService();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'existing-hash', role: UserRole.BUYER });
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (passwordService.hash as ReturnType<typeof vi.fn>).mockResolvedValue('new-hash');

    const sut = new SetPasswordUseCase(userRepo, passwordService);

    await expect(sut.execute({ userId: 'u-1', password: 'new-secret-123' })).rejects.toThrow('Password already set');
    expect(userRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @carat-room/user-auth test -- set-password.use-case.test.ts`
Expected: FAIL — `Cannot find module './set-password.use-case'`.

- [ ] **Step 3: Implement `SetPasswordUseCase`**

```typescript
// apps/user-auth/src/application/set-password.use-case.ts
import { UserRepository } from '../domain/user-repository';
import { PasswordService } from './password-service';

interface SetPasswordDto {
  userId: string;
  password: string;
}

export class SetPasswordUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(dto: SetPasswordDto): Promise<void> {
    const user = await this.userRepo.findById(dto.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    user.setPassword(passwordHash);
    await this.userRepo.save(user);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @carat-room/user-auth test -- set-password.use-case.test.ts`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Write the failing `LoginUseCase` rejection test**

Append to `apps/user-auth/src/application/use-cases.test.ts`, inside the existing `describe('LoginUseCase', ...)` block:

```typescript
it('should_throwError_when_accountHasNoPasswordSet', async () => {
  const userRepo = makeUserRepo();
  const tokenRepo = makeTokenRepo();
  const passwordService = makePasswordService();
  const tokenService = makeTokenService();
  const googleUser = User.createFromGoogle({ id: 'u-1', email: 'jane@example.com', googleId: 'google-sub-123', role: UserRole.BUYER });
  (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(googleUser);

  const sut = new LoginUseCase(userRepo, tokenRepo, passwordService, tokenService);

  await expect(sut.execute({ email: 'jane@example.com', password: 'anything' })).rejects.toThrow(
    'Password not set',
  );
  expect(passwordService.verify).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @carat-room/user-auth test -- use-cases.test.ts`
Expected: FAIL — `passwordService.verify` is called with `null` and rejects with a different (bcrypt) error, not `'Password not set'`.

- [ ] **Step 7: Implement the `LoginUseCase` guard**

In `apps/user-auth/src/application/login.use-case.ts`, add the null check immediately after `findByEmail`:

```typescript
async execute(dto: LoginDto): Promise<LoginResult> {
  const user = await this.userRepo.findByEmail(dto.email);
  if (!user) throw new Error('Invalid credentials');

  if (!user.passwordHash) {
    throw new Error('Password not set');
  }

  const valid = await this.passwordService.verify(dto.password, user.passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  // ...rest unchanged
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @carat-room/user-auth test -- use-cases.test.ts`
Expected: PASS — including the new case.

- [ ] **Step 9: Commit**

```bash
git add apps/user-auth/src/application/set-password.use-case.ts apps/user-auth/src/application/set-password.use-case.test.ts apps/user-auth/src/application/login.use-case.ts apps/user-auth/src/application/use-cases.test.ts
git commit -m "feat(user-auth): add SetPasswordUseCase and reject login for password-less accounts"
```

---

### Task 6: Router endpoints, `main.ts` wiring, compose env vars

Covers: C15, C16, C17, C18

**Files:**
- Modify: `apps/user-auth/src/presentation/user-router.ts`
- Modify: `apps/user-auth/src/main.ts`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.test.yml`

**Interfaces:**
- Consumes: `GoogleAuthUseCase.execute` (Task 4), `SetPasswordUseCase.execute` (Task 5), `GoogleOAuthIdentityProvider`/`createGoogleIdTokenVerifier` (Task 3).
- Produces: `POST /api/users/auth/google` and `POST /api/users/me/password` routes. Task 9 (`user-portal` proxy routes) calls the former by this exact path and body shape (`{ code, codeVerifier }` → `{ data: { accessToken } }` + `Set-Cookie`).

- [ ] **Step 1: Add the two new routes to `user-router.ts`**

Add `GoogleAuthUseCase` and `SetPasswordUseCase` to the `UseCases` interface:

```typescript
import { GoogleAuthUseCase } from '../application/google-auth.use-case';
import { SetPasswordUseCase } from '../application/set-password.use-case';

interface UseCases {
  // ...existing entries unchanged
  googleAuth: GoogleAuthUseCase;
  setPassword: SetPasswordUseCase;
}
```

Add the Google callback route, placed after `/refresh` (uses the exact same cookie config as `/login`):

```typescript
router.post('/auth/google', async (c) => {
  const body = await c.req.json();
  const { code, codeVerifier } = body;
  if (!code || !codeVerifier) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'code and codeVerifier are required' } },
      400,
    );
  }
  try {
    const { accessToken, refreshToken } = await useCases.googleAuth.execute({ code, codeVerifier });
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
    if (message === 'Google email not verified') {
      return c.json({ error: { code: 'EMAIL_NOT_VERIFIED', message } }, 400);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
  }
});
```

Add the set-password route, placed after `/me` (authenticated, mirrors `/phone/verify`'s `jwtPayload` usage):

```typescript
router.post('/me/password', async (c) => {
  const { userId } = c.get('jwtPayload');
  const body = await c.req.json();
  const { password } = body;
  if (!password || password.length < 8) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'password must be at least 8 characters' } },
      400,
    );
  }
  try {
    await useCases.setPassword.execute({ userId, password });
    return c.json({ data: { message: 'Password set.' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'Password already set') {
      return c.json({ error: { code: 'CONFLICT', message } }, 409);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
  }
});
```

Update the existing `/login` route's `catch` block to map the new `LoginUseCase` error:

```typescript
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  if (message === 'Invalid credentials') {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }, 401);
  }
  if (message === 'Password not set') {
    return c.json(
      { error: { code: 'PASSWORD_NOT_SET', message: 'This account uses Google sign-in — no password is set.' } },
      400,
    );
  }
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
}
```

- [ ] **Step 2: Wire `main.ts`**

Add required env vars alongside the existing JWT-key check:

```typescript
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;

if (!databaseUrl || !amqpUrl || !jwtPrivateKey || !jwtPublicKey || !googleClientId || !googleClientSecret || !googleRedirectUri) {
  throw new Error(
    'Missing required environment variables: DATABASE_URL, RABBITMQ_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI',
  );
}
```

Construct the provider and the two new use cases, and add imports (`GoogleOAuthIdentityProvider`, `createGoogleIdTokenVerifier` from `./infrastructure/google/google-identity-provider`, `GoogleAuthUseCase`, `SetPasswordUseCase`):

```typescript
const googleIdentityProvider = new GoogleOAuthIdentityProvider(
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
  createGoogleIdTokenVerifier(googleClientId),
);
```

Add rate limiting for the new public route, alongside the existing `strict` registrations:

```typescript
app.use('/api/users/auth/google', rateLimits.strict);
```

Add auth middleware for the new authenticated route, alongside the existing `/api/users/me` registration:

```typescript
app.use('/api/users/me/password', authMiddleware(jwtPublicKey));
```

Add both new use cases to the `buildUserRouter` call. **`main.ts` already passes a second `humanVerifier` argument** (added by the merged Turnstile feature, PR #26) — preserve it, do not drop it:

```typescript
app.route('/api/users', buildUserRouter({
  // ...existing entries unchanged
  googleAuth: new GoogleAuthUseCase(userRepo, tokenRepo, tokenService, googleIdentityProvider),
  setPassword: new SetPasswordUseCase(userRepo, passwordService),
}, humanVerifier));
```

**Note on Turnstile interaction (post-merge check):** `/register` and `/login` are now gated by `requireHumanVerification(humanVerifier)` middleware (`apps/user-auth/src/presentation/human-verification-middleware.ts`), requiring a `turnstileToken` in the body. `POST /auth/google` and `POST /me/password` deliberately do **not** get this middleware: Google's own consent screen is itself a human-verification step for the former (stacking Turnstile on top would add back the friction this feature exists to remove), and the latter is already gated by `authMiddleware` (a bot cannot reach it without a valid session). Do not add `humanCheck` to either new route.

- [ ] **Step 3: Add env vars to `docker-compose.yml`**

In the `user-service` block's `environment` section, alongside the existing `JWT_PRIVATE_KEY`/`R2_*` entries:

```yaml
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      GOOGLE_REDIRECT_URI: ${GOOGLE_REDIRECT_URI}
```

- [ ] **Step 4: Add test values to `docker-compose.test.yml`**

Find the `user-service` (or equivalently-named) block in `docker-compose.test.yml` and add fixed test values, matching how other test-only secrets are supplied there (literal values, not `${VAR}` interpolation):

```yaml
      GOOGLE_CLIENT_ID: test-google-client-id
      GOOGLE_CLIENT_SECRET: test-google-client-secret
      GOOGLE_REDIRECT_URI: http://localhost:3000/api/auth/google/callback
```

- [ ] **Step 5: Type-check and build**

Run: `pnpm turbo build --filter=@carat-room/user-auth`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/user-auth/src/presentation/user-router.ts apps/user-auth/src/main.ts docker-compose.yml docker-compose.test.yml
git commit -m "feat(user-auth): wire Google auth and set-password routes"
```

---

### Task 7: Router integration test

Covers: C26

**Files:**
- Create: `apps/user-auth/src/presentation/user-router.google.test.ts`

**Interfaces:**
- Consumes: `buildUserRouter` (existing, extended by Task 6).
- Produces: nothing consumed by later tasks — this is a leaf verification task.

- [ ] **Step 1: Write the tests**

This is a self-contained Hono-router test using `app.request()` directly (does not depend on any pre-existing router test file's internal fixtures). Since the merged Turnstile feature (PR #26), `buildUserRouter` takes a second `humanVerifier: HumanVerifier` argument, and `/login` (unlike `/auth/google`) runs `requireHumanVerification` first — a fake verifier that always resolves `true` is passed here, and the `/login` test below must still include a `turnstileToken` in its body (the middleware rejects with `CAPTCHA_REQUIRED` before the verifier even runs if the field is missing or empty):

```typescript
// apps/user-auth/src/presentation/user-router.google.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildUserRouter } from './user-router';
import { HumanVerifier } from '../application/human-verifier';

function makeUseCases(overrides: Record<string, unknown> = {}) {
  return {
    register: { execute: vi.fn() },
    verifyEmail: { execute: vi.fn() },
    login: { execute: vi.fn() },
    refresh: { execute: vi.fn() },
    logout: { execute: vi.fn() },
    requestPhoneOtp: { execute: vi.fn() },
    verifyPhoneOtp: { execute: vi.fn() },
    getMe: { execute: vi.fn() },
    updateMe: { execute: vi.fn() },
    uploadIdentityDocument: { execute: vi.fn() },
    googleAuth: { execute: vi.fn() },
    setPassword: { execute: vi.fn() },
    ...overrides,
  };
}

const alwaysHumanVerifier: HumanVerifier = { verify: vi.fn().mockResolvedValue(true) };

describe('POST /auth/google', () => {
  it('should_return400_when_codeMissing', async () => {
    const router = buildUserRouter(makeUseCases() as never, alwaysHumanVerifier);
    const res = await router.request('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('should_setRefreshCookieAndReturnAccessToken_when_exchangeSucceeds', async () => {
    const googleAuth = { execute: vi.fn().mockResolvedValue({ accessToken: 'access-tok', refreshToken: 'refresh-tok' }) };
    const router = buildUserRouter(makeUseCases({ googleAuth }) as never, alwaysHumanVerifier);
    const res = await router.request('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'auth-code', codeVerifier: 'verifier' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.accessToken).toBe('access-tok');
    expect(res.headers.get('set-cookie')).toContain('carat_refresh=refresh-tok');
  });

  it('should_return400WithEmailNotVerifiedCode_when_googleEmailUnverified', async () => {
    const googleAuth = { execute: vi.fn().mockRejectedValue(new Error('Google email not verified')) };
    const router = buildUserRouter(makeUseCases({ googleAuth }) as never, alwaysHumanVerifier);
    const res = await router.request('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'auth-code', codeVerifier: 'verifier' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('should_notRequireTurnstileToken_unlikeLoginAndRegister', async () => {
    // No turnstileToken in the body at all, and /auth/google still reaches the use case rather than
    // short-circuiting with CAPTCHA_REQUIRED — confirms humanCheck middleware is not mounted on this route.
    const googleAuth = { execute: vi.fn().mockResolvedValue({ accessToken: 'access-tok', refreshToken: 'refresh-tok' }) };
    const router = buildUserRouter(makeUseCases({ googleAuth }) as never, alwaysHumanVerifier);
    const res = await router.request('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'auth-code', codeVerifier: 'verifier' }),
    });
    expect(res.status).toBe(200);
    expect(googleAuth.execute).toHaveBeenCalledOnce();
  });
});

describe('POST /login with a Google-only account', () => {
  it('should_return400WithPasswordNotSetCode_when_accountHasNoPassword', async () => {
    const login = { execute: vi.fn().mockRejectedValue(new Error('Password not set')) };
    const router = buildUserRouter(makeUseCases({ login }) as never, alwaysHumanVerifier);
    const res = await router.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com', password: 'anything', turnstileToken: 'test-token' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('PASSWORD_NOT_SET');
  });
});
```

Note: `POST /me/password` requires `c.get('jwtPayload')`, which is only populated by `authMiddleware` mounted in `main.ts` — not by `buildUserRouter` in isolation. It is covered instead by the E2E test in Task 11, which runs against the full running service.

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter @carat-room/user-auth test -- user-router.google.test.ts`
Expected: PASS — all 5 tests.

- [ ] **Step 3: Commit**

```bash
git add apps/user-auth/src/presentation/user-router.google.test.ts
git commit -m "test(user-auth): cover /auth/google and password-not-set login rejection"
```

---

### Task 8: `user-portal` — Google redirect and callback proxy routes

Covers: C19, C20

**Files:**
- Modify: `apps/user-portal/src/lib/service-config.ts`
- Create: `apps/user-portal/src/app/api/auth/google/route.ts`
- Create: `apps/user-portal/src/app/api/auth/google/callback/route.ts`

**Interfaces:**
- Consumes: `USER_SERVICE_URL`, `forwardedForHeader` (existing, from `service-config.ts`); `POST /api/users/auth/google` (Task 6).
- Produces: `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI`, `GOOGLE_OAUTH_STATE_COOKIE` exported from `service-config.ts`. `GET /api/auth/google` and `GET /api/auth/google/callback` routes. Task 9's login-client button links to `/api/auth/google`; the callback redirects to `/account/oauth-complete` (Task 10).

This task has no unit tests of its own — Next.js Route Handlers doing full-page redirects are covered end-to-end by the Task 11 Playwright test, consistent with how the existing `login`/`refresh` proxy routes have no dedicated unit tests in this codebase either.

- [ ] **Step 1: Add Google constants to `service-config.ts`**

Add alongside the existing exported constants:

```typescript
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
export const GOOGLE_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI ?? 'http://localhost:3000/api/auth/google/callback';

/** Short-lived cookie holding the OAuth `state`/PKCE `code_verifier`/`returnUrl` between the redirect to Google and its callback. */
export const GOOGLE_OAUTH_STATE_COOKIE = 'carat_google_oauth_state';
```

- [ ] **Step 2: Create the redirect route**

```typescript
// apps/user-portal/src/app/api/auth/google/route.ts
import { randomBytes, createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI, GOOGLE_OAUTH_STATE_COOKIE } from '@/lib/service-config';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const STATE_COOKIE_MAX_AGE_SECONDS = 600;

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function GET(request: NextRequest) {
  const state = base64UrlEncode(randomBytes(32));
  const codeVerifier = base64UrlEncode(randomBytes(32));
  const codeChallenge = base64UrlEncode(createHash('sha256').update(codeVerifier).digest());
  const returnUrl = request.nextUrl.searchParams.get('returnUrl') ?? '/account/dashboard';

  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const response = NextResponse.redirect(authUrl);
  // SameSite=Lax (not Strict): this cookie must survive the top-level cross-site
  // navigation Google performs when redirecting back to our callback URL.
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, JSON.stringify({ state, codeVerifier, returnUrl }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
    path: '/',
  });
  return response;
}
```

- [ ] **Step 3: Create the callback route**

```typescript
// apps/user-portal/src/app/api/auth/google/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { forwardedForHeader, GOOGLE_OAUTH_STATE_COOKIE, USER_SERVICE_URL } from '@/lib/service-config';

interface StateCookiePayload {
  state: string;
  codeVerifier: string;
  returnUrl: string;
}

function redirectToLoginWithError(request: NextRequest, reason: string): NextResponse {
  const url = new URL('/account/login', request.url);
  url.searchParams.set('googleError', reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const stateCookieValue = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !stateCookieValue) {
    return redirectToLoginWithError(request, 'cancelled');
  }

  let stateCookie: StateCookiePayload;
  try {
    stateCookie = JSON.parse(stateCookieValue) as StateCookiePayload;
  } catch {
    return redirectToLoginWithError(request, 'cancelled');
  }

  if (stateCookie.state !== state) {
    return redirectToLoginWithError(request, 'cancelled');
  }

  let res: Response;
  try {
    res = await fetch(`${USER_SERVICE_URL}/api/users/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardedForHeader(request) },
      body: JSON.stringify({ code, codeVerifier: stateCookie.codeVerifier }),
    });
  } catch {
    return redirectToLoginWithError(request, 'failed');
  }

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    const reason = errorBody?.error?.code === 'EMAIL_NOT_VERIFIED' ? 'email_not_verified' : 'failed';
    return redirectToLoginWithError(request, reason);
  }

  const completeUrl = new URL('/account/oauth-complete', request.url);
  completeUrl.searchParams.set('returnUrl', stateCookie.returnUrl);
  const response = NextResponse.redirect(completeUrl);
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  const setCookie = res.headers.get('set-cookie');
  // append, not set: cookies.delete() above already queued a Set-Cookie header
  // for the state cookie's removal — .set() would overwrite it instead of adding to it.
  if (setCookie) response.headers.append('set-cookie', setCookie);
  return response;
}
```

- [ ] **Step 4: Build the portal**

Run: `pnpm turbo build --filter=user-portal`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/user-portal/src/lib/service-config.ts apps/user-portal/src/app/api/auth/google/
git commit -m "feat(user-portal): add Google OAuth redirect and callback proxy routes"
```

---

### Task 9: `user-portal` — oauth-complete page and login button

Covers: C21, C22, C23

**Files:**
- Create: `apps/user-portal/src/app/account/oauth-complete/page.tsx`
- Create: `apps/user-portal/src/app/account/oauth-complete/oauth-complete-client.tsx`
- Modify: `apps/user-portal/src/app/account/login/login-client.tsx`

**Interfaces:**
- Consumes: `useAuth().refreshAccessToken` (existing, `apps/user-portal/src/lib/auth-context.tsx` — already reads the `carat_refresh` cookie via `GET /api/auth/refresh` and hydrates `AuthContext`, no changes needed there since Task 8's callback route already sets that same cookie).
- Produces: nothing consumed by later tasks — this completes the browser-facing flow.

No new unit tests: `oauth-complete-client.tsx` is a thin effect wrapper around the already-tested `refreshAccessToken()`, and `login-client.tsx`'s new button is a static link with no branching logic to unit test — both are covered by the Task 11 E2E test, consistent with how `login-client.tsx`'s existing form submission has no dedicated unit test in this codebase (only E2E coverage).

- [ ] **Step 1: Create the oauth-complete page**

```tsx
// apps/user-portal/src/app/account/oauth-complete/page.tsx
import { Suspense } from 'react';
import { OAuthCompleteClient } from './oauth-complete-client';

export default function OAuthCompletePage() {
  return (
    <Suspense fallback={<div className='min-h-screen bg-paper' />}>
      <OAuthCompleteClient />
    </Suspense>
  );
}
```

```tsx
// apps/user-portal/src/app/account/oauth-complete/oauth-complete-client.tsx
'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export function OAuthCompleteClient() {
  const { refreshAccessToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') ?? '/account/dashboard';

  useEffect(() => {
    refreshAccessToken().then(() => router.replace(returnUrl));
  }, [refreshAccessToken, router, returnUrl]);

  return (
    <div className='min-h-screen bg-paper flex items-center justify-center'>
      <p className='font-sans text-sm text-mut'>Signing you in…</p>
    </div>
  );
}
```

- [ ] **Step 2: Add the Google button and error messaging to `login-client.tsx`**

Add a helper above the `LoginClient` component:

```tsx
function googleErrorMessage(code: string | null): string {
  switch (code) {
    case 'cancelled':
      return 'Google sign-in was cancelled.';
    case 'email_not_verified':
      return "We couldn't verify this Google account's email — please sign up with email and password instead.";
    default:
      return code ? 'Something went wrong signing in with Google, please try again.' : '';
  }
}
```

Change the `serverError` initial state to pick up a `googleError` query param:

```tsx
const [serverError, setServerError] = useState('');
```

becomes:

```tsx
const [serverError, setServerError] = useState(() => googleErrorMessage(searchParams.get('googleError')));
```

(`searchParams` is already read above this line for `returnUrl` — no new import needed.)

Add the Google button inside the `!registered` branch, immediately after the tab bar `<div className='flex border-b ...'>...</div>` and before the `{tab === 'signin' ? ... : ...}` ternary, so it is shared between both tabs:

```tsx
<a
  href={`/api/auth/google?returnUrl=${encodeURIComponent(returnUrl)}`}
  className='w-full flex items-center justify-center gap-2 border border-[var(--line)] font-sans text-sm font-medium py-3 hover:bg-black/5 transition-colors mb-6'
>
  <svg width='18' height='18' viewBox='0 0 18 18' aria-hidden='true'>
    <path fill='#4285F4' d='M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z' />
    <path fill='#34A853' d='M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z' />
    <path fill='#FBBC05' d='M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33z' />
    <path fill='#EA4335' d='M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58z' />
  </svg>
  Continue with Google
</a>
```

- [ ] **Step 3: Build the portal**

Run: `pnpm turbo build --filter=user-portal`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/user-portal/src/app/account/oauth-complete/ apps/user-portal/src/app/account/login/login-client.tsx
git commit -m "feat(user-portal): add Continue with Google button and oauth-complete page"
```

---

### Task 10: `hasPassword` on `/me` and the account settings "Set password" form

Covers: C24

**Files:**
- Modify: `packages/shared-types/src/api/user-auth.ts`
- Modify: `packages/shared-types/src/api/user-auth.test.ts`
- Modify: `apps/user-auth/src/presentation/user-router.ts`
- Create: `apps/user-portal/src/app/api/auth/set-password/route.ts`
- Create: `apps/user-portal/src/app/account/settings/page.tsx`
- Create: `apps/user-portal/src/app/account/settings/settings-client.tsx`

**Interfaces:**
- Consumes: `meSchema` (existing, extended here), `POST /api/users/me/password` (Task 6), `useAuth().accessToken` (existing).
- Produces: `Me.hasPassword: boolean`. Nothing consumed by later tasks — this completes the "set password later" requirement.

- [ ] **Step 1: Write the failing shared-types test**

Add to `packages/shared-types/src/api/user-auth.test.ts`, in the existing test that parses a `meResponseSchema` fixture, add `hasPassword: true` to the fixture object and assert it round-trips:

```typescript
it('should_includeHasPassword_when_parsingMeResponse', () => {
  const body = meResponseSchema.parse({
    data: {
      id: 'u-1',
      email: 'jane@example.com',
      phone: null,
      status: 'EMAIL_VERIFIED',
      role: 'BUYER',
      country: null,
      hasPassword: false,
    },
  });
  expect(body.data.hasPassword).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @carat-room/shared-types test -- user-auth.test.ts`
Expected: FAIL — Zod strips or rejects the unknown `hasPassword` field depending on schema strictness; either way `body.data.hasPassword` is `undefined`, not `false`.

- [ ] **Step 3: Add `hasPassword` to `meSchema`**

In `packages/shared-types/src/api/user-auth.ts`:

```typescript
export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  role: userRoleSchema,
  country: z.string().nullable(),
  hasPassword: z.boolean(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @carat-room/shared-types test -- user-auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Return `hasPassword` from `GET /me`**

In `apps/user-auth/src/presentation/user-router.ts`, update the `/me` handler:

```typescript
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
      hasPassword: p.passwordHash !== null,
    },
  });
});
```

- [ ] **Step 6: Create the set-password proxy route**

```typescript
// apps/user-portal/src/app/api/auth/set-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { forwardedForHeader, USER_SERVICE_URL } from '@/lib/service-config';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  try {
    const body = await request.json();
    const res = await fetch(`${USER_SERVICE_URL}/api/users/me/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth, ...forwardedForHeader(request) },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'Unable to set password. Please try again.' } },
      { status: 503 },
    );
  }
}
```

(Mirrors `apps/user-portal/src/app/api/auth/me/route.ts`'s pattern of forwarding the incoming `authorization` header straight through — note `service-config.ts` exports `USER_SERVICE_URL`, unlike `me/route.ts` which redeclares it locally; import it here rather than repeating that inconsistency.)

- [ ] **Step 7: Create the settings page**

```tsx
// apps/user-portal/src/app/account/settings/page.tsx
import { Suspense } from 'react';
import { SettingsClient } from './settings-client';

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className='min-h-screen bg-paper' />}>
      <SettingsClient />
    </Suspense>
  );
}
```

```tsx
// apps/user-portal/src/app/account/settings/settings-client.tsx
'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/lib/auth-context';
import { parseMe, errorMessage } from '@/lib/user-auth';

const setPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

type SetPasswordForm = z.infer<typeof setPasswordSchema>;

export function SettingsClient() {
  const { accessToken } = useAuth();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);
  const form = useForm<SetPasswordForm>({ resolver: zodResolver(setPasswordSchema) });

  useEffect(() => {
    if (!accessToken) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(res => res.json())
      .then(json => setHasPassword(parseMe(json)?.hasPassword ?? null));
  }, [accessToken]);

  async function handleSetPassword(data: SetPasswordForm) {
    setServerError('');
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ password: data.password }),
      });
      const json = await res.json();
      if (!res.ok) { setServerError(errorMessage(json, 'Unable to set password')); return; }
      setSuccess(true);
    } catch {
      setServerError('Unable to connect. Please try again.');
    }
  }

  return (
    <div className='min-h-screen bg-paper px-8 py-12'>
      <div className='w-full max-w-md mx-auto'>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>Account settings</h1>

        {hasPassword === false && !success && (
          <form onSubmit={form.handleSubmit(handleSetPassword)} className='space-y-4'>
            <h2 className='font-sans text-sm font-medium text-ink'>Set a password</h2>
            <p className='font-sans text-xs text-mut'>Add a password so you can sign in even without Google.</p>
            <div>
              <label className='block font-sans text-sm font-medium text-ink mb-1'>Password</label>
              <input {...form.register('password')} type='password' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
              {form.formState.errors.password && <p className='font-sans text-xs text-red-600 mt-1'>{form.formState.errors.password.message}</p>}
            </div>
            <div>
              <label className='block font-sans text-sm font-medium text-ink mb-1'>Confirm password</label>
              <input {...form.register('confirmPassword')} type='password' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
              {form.formState.errors.confirmPassword && <p className='font-sans text-xs text-red-600 mt-1'>{form.formState.errors.confirmPassword.message}</p>}
            </div>
            {serverError && <p className='font-sans text-xs text-red-600'>{serverError}</p>}
            <button type='submit' disabled={form.formState.isSubmitting}
              className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 transition-colors disabled:opacity-60'>
              {form.formState.isSubmitting ? 'Saving…' : 'Set password'}
            </button>
          </form>
        )}

        {success && <p className='font-sans text-sm text-ink'>Password set. You can now sign in with either Google or your password.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Build all affected packages**

Run: `pnpm turbo build --filter=@carat-room/shared-types --filter=@carat-room/user-auth --filter=user-portal`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add packages/shared-types/src/api/user-auth.ts packages/shared-types/src/api/user-auth.test.ts apps/user-auth/src/presentation/user-router.ts apps/user-portal/src/app/api/auth/set-password/ apps/user-portal/src/app/account/settings/
git commit -m "feat: add hasPassword to /me and a settings page to set a password later"
```

---

### Task 11: E2E test with Google endpoints mocked

Covers: C27

**Files:**
- Modify: `apps/user-auth/src/infrastructure/google/google-identity-provider.ts`
- Modify: `apps/user-auth/src/main.ts`
- Modify: `docker-compose.test.yml`
- Create: `tests/e2e/support/mock-google-server.ts`
- Modify: `tests/e2e/global-setup.ts`
- Create: `tests/e2e/specs/google-oauth.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–10.
- Produces: nothing consumed elsewhere — this is the final verification task.

Real Google consent cannot be automated in CI. Two hops need mocking: (1) the browser's navigation to `accounts.google.com`, which Playwright's `page.route()` can intercept directly since it originates in the browser context; (2) `user-auth`'s server-to-server token exchange and JWKS fetch, which happen inside the Docker container and are **not** visible to `page.route()` — these need `GoogleOAuthIdentityProvider` pointed at a local stub server instead.

- [ ] **Step 1: Make the Google endpoints overridable**

In `apps/user-auth/src/infrastructure/google/google-identity-provider.ts`, add two optional constructor parameters with the real URLs as defaults, and use them instead of the module-level constants:

```typescript
export function createGoogleIdTokenVerifier(clientId: string, jwksUrl: string = GOOGLE_JWKS_URL): IdTokenVerifier {
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  return async (idToken: string) => {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: GOOGLE_ISSUER,
      audience: clientId,
    });
    return payload as GoogleIdTokenClaims;
  };
}

export class GoogleOAuthIdentityProvider implements GoogleIdentityProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    private readonly verifyIdToken: IdTokenVerifier,
    private readonly tokenEndpoint: string = GOOGLE_TOKEN_ENDPOINT,
  ) {}

  async exchangeCodeForProfile(code: string, codeVerifier: string): Promise<GoogleProfile> {
    const response = await fetch(this.tokenEndpoint, {
      // ...unchanged
```

(Only the `fetch(GOOGLE_TOKEN_ENDPOINT, ...)` call site changes to `fetch(this.tokenEndpoint, ...)` — everything else in the class is unchanged from Task 3.)

- [ ] **Step 2: Wire the overrides in `main.ts`**

```typescript
const googleTokenEndpointOverride = process.env.GOOGLE_TOKEN_ENDPOINT_OVERRIDE;
const googleJwksUrlOverride = process.env.GOOGLE_JWKS_URL_OVERRIDE;

const googleIdentityProvider = new GoogleOAuthIdentityProvider(
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
  createGoogleIdTokenVerifier(googleClientId, googleJwksUrlOverride),
  googleTokenEndpointOverride,
);
```

Both overrides are `undefined` in production, which falls through to the real Google URLs (the same behaviour as before this task).

- [ ] **Step 3: Create the mock Google server**

```typescript
// tests/e2e/support/mock-google-server.ts
import { createServer, Server } from 'node:http';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';

export interface MockGoogleServer {
  port: number;
  issueIdTokenFor(email: string, emailVerified: boolean): void;
  close(): Promise<void>;
}

const CLIENT_ID = 'test-google-client-id';
const ISSUER = 'https://accounts.google.com';

export async function startMockGoogleServer(): Promise<MockGoogleServer> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  let nextEmail = 'e2e-google-user@carat-test.internal';
  let nextEmailVerified = true;

  const server: Server = createServer(async (req, res) => {
    if (req.url === '/token' && req.method === 'POST') {
      const idToken = await new SignJWT({ email: nextEmail, email_verified: nextEmailVerified })
        .setProtectedHeader({ alg: 'RS256', kid: 'e2e-key' })
        .setIssuer(ISSUER)
        .setAudience(CLIENT_ID)
        .setSubject(`google-sub-${nextEmail}`)
        .setExpirationTime('5m')
        .sign(privateKey);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id_token: idToken }));
      return;
    }
    if (req.url === '/jwks' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: [{ ...jwk, kid: 'e2e-key', alg: 'RS256', use: 'sig' }] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    port,
    issueIdTokenFor(email: string, emailVerified: boolean) {
      nextEmail = email;
      nextEmailVerified = emailVerified;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
```

- [ ] **Step 4: Start the mock server in `global-setup.ts` and point the test stack at it**

Add to `tests/e2e/global-setup.ts` (alongside whatever it already boots — start the mock server before the portal/backend health checks and export its port for the compose stack):

```typescript
import { startMockGoogleServer } from './support/mock-google-server';

// ...inside the existing setup function, before starting docker compose / the portal:
const mockGoogle = await startMockGoogleServer();
process.env.MOCK_GOOGLE_PORT = String(mockGoogle.port);
```

In `docker-compose.test.yml`'s `user-service` block, add (Docker Desktop resolves `host.docker.internal` to the host machine on Windows/Mac, which this environment uses):

```yaml
      GOOGLE_TOKEN_ENDPOINT_OVERRIDE: http://host.docker.internal:${MOCK_GOOGLE_PORT}/token
      GOOGLE_JWKS_URL_OVERRIDE: http://host.docker.internal:${MOCK_GOOGLE_PORT}/jwks
```

- [ ] **Step 5: Write the E2E test**

```typescript
// tests/e2e/specs/google-oauth.spec.ts
import { test, expect } from '../support/fixtures';
import { uniqueSuffix } from '../support/env';

// The browser's navigation to accounts.google.com is intercepted directly (page.route runs in the
// browser context); user-auth's server-to-server token exchange and JWKS fetch go to the mock Google
// server started in global-setup.ts (see docker-compose.test.yml's GOOGLE_*_OVERRIDE env vars) since
// those calls originate from the user-auth container, not the browser, and page.route cannot see them.
test('sign up with Google, then set a password from account settings', async ({ page }) => {
  const suffix = uniqueSuffix();
  const email = `e2e-google-${suffix}@carat-test.internal`;

  await page.route('https://accounts.google.com/**', async (route) => {
    const url = new URL(route.request().url());
    const state = url.searchParams.get('state');
    const callbackUrl = new URL('/api/auth/google/callback', page.url());
    callbackUrl.searchParams.set('code', 'fake-auth-code');
    if (state) callbackUrl.searchParams.set('state', state);
    await route.fulfill({ status: 302, headers: { Location: callbackUrl.toString() } });
  });

  // The mock Google server issues an id_token for whatever email/verified flag was last set on it;
  // seed.ts's registerAndVerifyUser pattern isn't used here since there is no password to seed —
  // the account is created entirely through the OAuth flow itself.
  await page.goto('/account/login');
  await page.getByRole('link', { name: 'Continue with Google' }).click();

  await expect(page).toHaveURL(/\/account\/dashboard/);

  // --- Set a password from account settings (Task 10) ---
  await page.goto('/account/settings');
  await expect(page.getByRole('heading', { name: 'Set a password' })).toBeVisible();
  const passwordFields = page.locator('input[type="password"]');
  await passwordFields.nth(0).fill('Passw0rd!e2e');
  await passwordFields.nth(1).fill('Passw0rd!e2e');
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText('Password set.')).toBeVisible();

  // --- Confirm password login now works too ---
  await page.request.get('/api/auth/refresh').then((r) => r.request().headers()); // ensure session cookie present
  await page.goto('/account/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('Passw0rd!e2e');
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/account\/dashboard/);
});
```

Note: this test asserts against real markup names (`'Continue with Google'`, `'Set a password'`) that must match Tasks 9–10's implementation exactly; if any copy changes during implementation, update the selectors here in the same commit, following the existing `auth.spec.ts` convention of documenting any selector mismatches found against real markup in a comment at the top of the file.

- [ ] **Step 6: Run the E2E suite**

Run:
```bash
docker compose -f docker-compose.test.yml up -d --build
pnpm --filter @carat-room/e2e test:e2e -- google-oauth.spec.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/user-auth/src/infrastructure/google/google-identity-provider.ts apps/user-auth/src/main.ts docker-compose.test.yml tests/e2e/support/mock-google-server.ts tests/e2e/global-setup.ts tests/e2e/specs/google-oauth.spec.ts
git commit -m "test(e2e): cover Google sign-up and set-password flow with mocked Google endpoints"
```

---

## Final Steps

- [ ] Run `pnpm lint` — must pass with zero new Clean Architecture layer-boundary violations.
- [ ] Run `pnpm turbo test` — all unit/integration suites across `user-auth`, `user-portal`, and `shared-types` must pass.
- [ ] Re-read `docs/superpowers/specs/2026-07-17-google-oauth-signup-design.md` section by section and confirm every checklist item [C1]–[C27] above is ticked.
- [ ] Manually drive the flow in a browser against `docker compose up -d` with real Google OAuth credentials in `.env` (not the E2E mock) at least once, per this repo's UI-verification convention — confirm the consent screen shows the correct app name and redirect URI.
- [ ] Commit this file with `chore: mark all plan 13 tasks complete`.

