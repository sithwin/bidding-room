# Sign-up/Login Human Verification (Turnstile) Implementation Plan

> **EXECUTION PROMPT — if this file was tagged or attached, implement it as follows.**
> You are executing an already-approved plan. Do not re-plan or redesign — the design is approved in `docs/superpowers/specs/2026-07-11-signup-human-check-design.md`; read it first for context. Use the superpowers:subagent-driven-development skill (preferred) or superpowers:executing-plans.
>
> 1. Work on a dedicated branch (e.g. `feat/signup-human-check`) — never directly on `main`.
> 2. Execute Tasks 1 → 5 strictly in order; later tasks depend on earlier signatures and compose env.
> 3. Follow every step exactly, including each TDD cycle: write the failing test, run it and see it fail, implement, see it pass, commit with the given message.
> 4. Tick each checkbox (`- [ ]` → `- [x]`) in this file immediately after completing its step.
> 5. Task 5 Step 4 (real-browser verification) is a hard gate — do not declare the plan complete on unit tests alone.
> 6. When all tasks are done: run `pnpm lint` and `pnpm turbo test`, commit this updated plan file with `chore: mark all plan 11 tasks complete`, and report results honestly, including any failures.

**Goal:** Add Cloudflare Turnstile human verification to the user-portal sign-up and login forms, enforced server-side in the user-auth service.

**Architecture:** The frontend renders a Turnstile widget and sends its token as `turnstileToken` in the register/login JSON body. The user-auth service verifies the token in a presentation-layer Hono middleware via a `HumanVerifier` application port implemented by a `TurnstileVerifier` in infrastructure (Clean Architecture — use cases untouched). Cloudflare outage fails open; invalid token rejects with 400.

**Tech Stack:** Hono middleware, `@marsidev/react-turnstile`, Cloudflare Turnstile siteverify API, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-11-signup-human-check-design.md`

## Global Constraints

- British English in all copy and comments ("verification", "authorise").
- Named exports only — never `export default`.
- Single quotes for string literals; TypeScript strict mode; no `@ts-ignore`.
- Test names follow `should_[expectedBehaviour]_when_[condition]`; tests co-located next to source (`x.ts` → `x.test.ts`).
- Clean Architecture: `domain/application` never import infrastructure/presentation; `presentation` receives implementations by injection from `src/main.ts`. `pnpm lint` enforces layer boundaries.
- Cloudflare official test keys (always pass): site key `1x00000000000000000000AA`, secret key `1x0000000000000000000000000000000AA`.
- Error envelope: `{ error: { code: string, message: string } }`, HTTP 400 for captcha failures.

## Spec Coverage Checklist

Frontend (Task 4):
- [C1] Turnstile widget on Sign In tab (managed mode)
- [C2] Turnstile widget on Create Account tab
- [C3] Use `@marsidev/react-turnstile`
- [C4] `turnstileToken` in JSON body of `handleLogin`
- [C5] `turnstileToken` in JSON body of `handleRegister`
- [C6] Submit buttons disabled until a token exists
- [C7] "Please complete the verification" hint when no token
- [C8] Server `CAPTCHA_FAILED`/`CAPTCHA_REQUIRED` messages render in the `serverError` slot
- [C9] Widget reset after each failed submit (tokens are single-use)
- [C10] Site key read from `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

Proxies (no task — verified during planning):
- [C11] Both `api/auth/register/route.ts` and `api/auth/login/route.ts` already forward the full JSON body unchanged. No code change.

Backend (Tasks 1–2):
- [C12] `application/human-verifier.ts` port: `verify(token, remoteIp?): Promise<boolean>`
- [C13] `infrastructure/turnstile/turnstile-verifier.ts` POSTs `secret`, `response`, `remoteip` to siteverify with 3 s timeout
- [C14] Cloudflare `success: false` ⇒ return `false`
- [C15] Network error / timeout / non-JSON ⇒ return `true` (fail open), log warning without the token value
- [C16] Middleware applied to `POST /register` and `POST /login` only
- [C17] Missing/empty `turnstileToken` ⇒ `400 CAPTCHA_REQUIRED`
- [C18] Verifier returns false ⇒ `400 CAPTCHA_FAILED`
- [C19] `turnstileToken` never reaches the use-case DTO (handlers destructure only their fields)

Wiring & config (Task 3):
- [C20] `main.ts` constructs `TurnstileVerifier` from `TURNSTILE_SECRET_KEY`, injects into `buildUserRouter`
- [C21] `TURNSTILE_SECRET_KEY` required — boot fails fast if unset
- [C22] `NEXT_PUBLIC_TURNSTILE_SITE_KEY` added to user-portal compose env (test value)
- [C23] `TURNSTILE_SECRET_KEY` added to user-auth compose env (test value in test compose, `${TURNSTILE_SECRET_KEY}` in prod compose)
- [C24] Both `docker-compose.yml` and `docker-compose.test.yml` updated; env names match `process.env` reads exactly

Testing (Tasks 1, 2, 4, 5):
- [C25] Router tests with fake `HumanVerifier`: missing token, verifier rejects, verifier passes, admin routes unaffected
- [C26] `TurnstileVerifier` unit tests: success, `success: false`, network error (fail open), timeout (fail open)
- [C27] Frontend tests: `turnstileToken` sent in body; `CAPTCHA_FAILED` renders in error slot
- [C28] Drive the real form in the browser with the test site key before marking complete
- [C29] Integration: existing register/login flows updated to send a token; new test posting register without token expects `400 CAPTCHA_REQUIRED`

---

### Task 1: HumanVerifier port + TurnstileVerifier implementation

Covers: C12, C13, C14, C15, C26

**Files:**
- Create: `apps/user-auth/src/application/human-verifier.ts`
- Create: `apps/user-auth/src/infrastructure/turnstile/turnstile-verifier.ts`
- Test: `apps/user-auth/src/infrastructure/turnstile/turnstile-verifier.test.ts`

**Interfaces:**
- Consumes: nothing (leaf task).
- Produces: `interface HumanVerifier { verify(token: string, remoteIp?: string): Promise<boolean> }` (application port) and `class TurnstileVerifier implements HumanVerifier` with `constructor(secretKey: string)`. Tasks 2 and 3 import both by these exact names.

- [x] **Step 1: Create the port**

```typescript
// apps/user-auth/src/application/human-verifier.ts
export interface HumanVerifier {
  verify(token: string, remoteIp?: string): Promise<boolean>;
}
```

- [x] **Step 2: Write the failing tests**

```typescript
// apps/user-auth/src/infrastructure/turnstile/turnstile-verifier.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TurnstileVerifier } from './turnstile-verifier';

const SECRET = 'test-secret';

describe('TurnstileVerifier', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should_returnTrue_when_cloudflareReportsSuccess', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const sut = new TurnstileVerifier(SECRET);

    const result = await sut.verify('a-token', '203.0.113.7');

    expect(result).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const sent = (init.body as URLSearchParams).toString();
    expect(sent).toContain('secret=test-secret');
    expect(sent).toContain('response=a-token');
    expect(sent).toContain('remoteip=203.0.113.7');
  });

  it('should_returnFalse_when_cloudflareReportsFailure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 }),
    ));
    const sut = new TurnstileVerifier(SECRET);

    const result = await sut.verify('a-bad-token');

    expect(result).toBe(false);
  });

  it('should_failOpenReturningTrue_when_networkErrorOccurs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sut = new TurnstileVerifier(SECRET);

    const result = await sut.verify('a-token');

    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('a-token');
  });

  it('should_failOpenReturningTrue_when_requestTimesOut', async () => {
    const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sut = new TurnstileVerifier(SECRET);

    const result = await sut.verify('a-token');

    expect(result).toBe(true);
  });

  it('should_failOpenReturningTrue_when_responseIsNotJson', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sut = new TurnstileVerifier(SECRET);

    const result = await sut.verify('a-token');

    expect(result).toBe(true);
  });
});
```

- [x] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run apps/user-auth/src/infrastructure/turnstile/turnstile-verifier.test.ts` (from repo root; if the workspace runs tests per package, `cd apps/user-auth && pnpm vitest run src/infrastructure/turnstile/turnstile-verifier.test.ts`)
Expected: FAIL — `Cannot find module './turnstile-verifier'`

- [x] **Step 4: Implement TurnstileVerifier**

```typescript
// apps/user-auth/src/infrastructure/turnstile/turnstile-verifier.ts
import { HumanVerifier } from '../../application/human-verifier';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 3000;

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

export class TurnstileVerifier implements HumanVerifier {
  constructor(private readonly secretKey: string) {}

  async verify(token: string, remoteIp?: string): Promise<boolean> {
    const body = new URLSearchParams({ secret: this.secretKey, response: token });
    if (remoteIp) {
      body.set('remoteip', remoteIp);
    }
    try {
      const res = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
      const result = (await res.json()) as SiteverifyResponse;
      return result.success;
    } catch (err: unknown) {
      // Fail open by design: a Cloudflare outage must not block sign-ups or logins.
      const reason = err instanceof Error ? err.message : 'unknown error';
      console.error(`Turnstile verification unavailable, allowing request: ${reason}`);
      return true;
    }
  }
}
```

Note: a `success: false` JSON reply returns `false` from inside the `try` — only transport/parse failures reach the `catch` (C14 vs C15).

- [x] **Step 5: Run tests to verify they pass**

Run: same command as Step 3.
Expected: 5 tests PASS.

- [x] **Step 6: Lint and commit**

```bash
pnpm lint
git add apps/user-auth/src/application/human-verifier.ts apps/user-auth/src/infrastructure/turnstile/
git commit -m "feat(user-auth): add HumanVerifier port and Turnstile implementation"
```

---

### Task 2: Human-verification middleware on /register and /login

Covers: C16, C17, C18, C19, C25

**Files:**
- Create: `apps/user-auth/src/presentation/human-verification-middleware.ts`
- Create: `apps/user-auth/src/presentation/human-verification-middleware.test.ts`
- Modify: `apps/user-auth/src/presentation/user-router.ts` (signature at line 32; routes at lines 44 and 89)
- Modify: `apps/user-auth/src/presentation/user-router.test.ts` (all `buildUserRouter(useCases)` calls and register/login request bodies)

**Interfaces:**
- Consumes: `HumanVerifier` from `../application/human-verifier` (Task 1).
- Produces: `buildUserRouter(useCases: UseCases, humanVerifier: HumanVerifier): Hono<AppEnv>` — Task 3's `main.ts` passes the verifier as the new second argument. Also `requireHumanVerification(verifier: HumanVerifier)` returning a Hono middleware.

- [x] **Step 1: Write the failing middleware tests**

```typescript
// apps/user-auth/src/presentation/human-verification-middleware.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { requireHumanVerification } from './human-verification-middleware';
import { HumanVerifier } from '../application/human-verifier';

const makeApp = (verifier: HumanVerifier) => {
  const app = new Hono();
  app.post('/guarded', requireHumanVerification(verifier), (c) => c.json({ data: { ok: true } }, 200));
  return app;
};

const post = (app: Hono, body: unknown) =>
  app.request('/guarded', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('requireHumanVerification', () => {
  it('should_return400CaptchaRequired_when_tokenMissing', async () => {
    const verifier: HumanVerifier = { verify: vi.fn() };

    const res = await post(makeApp(verifier), { email: 'a@b.c' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('CAPTCHA_REQUIRED');
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('should_return400CaptchaFailed_when_verifierRejectsToken', async () => {
    const verifier: HumanVerifier = { verify: vi.fn().mockResolvedValue(false) };

    const res = await post(makeApp(verifier), { turnstileToken: 'bad-token' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('CAPTCHA_FAILED');
  });

  it('should_callNextHandler_when_verifierAcceptsToken', async () => {
    const verifier: HumanVerifier = { verify: vi.fn().mockResolvedValue(true) };

    const res = await post(makeApp(verifier), { turnstileToken: 'good-token' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.ok).toBe(true);
    expect(verifier.verify).toHaveBeenCalledWith('good-token', undefined);
  });

  it('should_forwardClientIp_when_forwardedHeaderPresent', async () => {
    const verifier: HumanVerifier = { verify: vi.fn().mockResolvedValue(true) };
    const app = makeApp(verifier);

    await app.request('/guarded', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
      body: JSON.stringify({ turnstileToken: 't' }),
    });

    expect(verifier.verify).toHaveBeenCalledWith('t', '203.0.113.7');
  });

  it('should_return400CaptchaRequired_when_bodyIsNotJson', async () => {
    const verifier: HumanVerifier = { verify: vi.fn() };
    const app = makeApp(verifier);

    const res = await app.request('/guarded', { method: 'POST', body: 'not json' });

    expect(res.status).toBe(400);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/user-auth/src/presentation/human-verification-middleware.test.ts`
Expected: FAIL — `Cannot find module './human-verification-middleware'`

- [x] **Step 3: Implement the middleware**

```typescript
// apps/user-auth/src/presentation/human-verification-middleware.ts
import { Context, Next } from 'hono';
import { HumanVerifier } from '../application/human-verifier';

export const requireHumanVerification = (verifier: HumanVerifier) =>
  async (c: Context, next: Next): Promise<Response | void> => {
    const body = await c.req.json().catch(() => ({}));
    const token = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
    if (!token) {
      return c.json(
        { error: { code: 'CAPTCHA_REQUIRED', message: 'Human verification is required.' } },
        400,
      );
    }
    const remoteIp = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for');
    const isHuman = await verifier.verify(token, remoteIp);
    if (!isHuman) {
      return c.json(
        { error: { code: 'CAPTCHA_FAILED', message: 'Human verification failed. Please try again.' } },
        400,
      );
    }
    await next();
  };
```

Hono caches the parsed JSON body, so the route handler's own `c.req.json()` call still works after the middleware reads it.

- [x] **Step 4: Run middleware tests to verify they pass**

Run: `pnpm vitest run apps/user-auth/src/presentation/human-verification-middleware.test.ts`
Expected: 5 tests PASS.

- [x] **Step 5: Wire the middleware into the router**

In `apps/user-auth/src/presentation/user-router.ts`:

Add imports at the top:

```typescript
import { HumanVerifier } from '../application/human-verifier';
import { requireHumanVerification } from './human-verification-middleware';
```

Change the factory signature (line 32) and guard the two routes:

```typescript
export function buildUserRouter(useCases: UseCases, humanVerifier: HumanVerifier): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const humanCheck = requireHumanVerification(humanVerifier);
```

Change `router.post('/register', async (c) => {` to `router.post('/register', humanCheck, async (c) => {` (line 44) and `router.post('/login', async (c) => {` to `router.post('/login', humanCheck, async (c) => {` (line 89). No other route changes — C16. The handlers already destructure only `{ email, password, country }` / `{ email, password }`, so `turnstileToken` never reaches the use-case DTOs — C19.

- [x] **Step 6: Update the existing router tests**

In `apps/user-auth/src/presentation/user-router.test.ts`:

Add below `makeUseCases`:

```typescript
import { HumanVerifier } from '../application/human-verifier';

const alwaysHumanVerifier = (): HumanVerifier => ({ verify: vi.fn().mockResolvedValue(true) });
```

Replace every `buildUserRouter(useCases)` with `buildUserRouter(useCases, alwaysHumanVerifier())`, and add `turnstileToken: 'test-token'` to the register/login request bodies (the register 400-validation test keeps its missing-email body but now also needs the token so it exercises the email check, not the captcha check):

```typescript
// register success body
body: JSON.stringify({ email: 'jane@example.com', password: 'secret123', turnstileToken: 'test-token' }),
// register validation-error body
body: JSON.stringify({ password: 'secret123', turnstileToken: 'test-token' }),
// login success body
body: JSON.stringify({ email: 'jane@example.com', password: 'secret', turnstileToken: 'test-token' }),
```

Add two new router-level tests (same file, new describe block):

```typescript
describe('human verification on register and login', () => {
  it('should_return400CaptchaRequired_when_registerHasNoToken', async () => {
    const useCases = makeUseCases();
    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, alwaysHumanVerifier()));

    const res = await app.request('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com', password: 'secret123' }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('CAPTCHA_REQUIRED');
    expect(useCases.register.execute).not.toHaveBeenCalled();
  });

  it('should_return400CaptchaFailed_when_loginTokenRejected', async () => {
    const useCases = makeUseCases();
    const rejectingVerifier: HumanVerifier = { verify: vi.fn().mockResolvedValue(false) };
    const app = new Hono();
    app.route('/api/users', buildUserRouter(useCases, rejectingVerifier));

    const res = await app.request('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jane@example.com', password: 'secret', turnstileToken: 'bad' }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('CAPTCHA_FAILED');
    expect(useCases.login.execute).not.toHaveBeenCalled();
  });
});
```

Admin routes live in `admin-users-router.ts`, which this task does not touch — run its test file to confirm it is unaffected (C25).

- [x] **Step 7: Run the full user-auth test suite**

Run: `pnpm turbo test --filter=user-auth`
Expected: all tests PASS, including `admin-users-router.test.ts` untouched and green. Note `main.ts` will not compile against the new signature until Task 3 — if the build fails on `main.ts`, proceed to Task 3 Step 1 before committing, then commit both together with this task's message.

- [x] **Step 8: Commit**

```bash
git add apps/user-auth/src/presentation/
git commit -m "feat(user-auth): require human verification on register and login"
```

---

### Task 3: Composition-root wiring and environment configuration

Covers: C20, C21, C22, C23, C24

**Files:**
- Modify: `apps/user-auth/src/main.ts` (env reads ~line 36-51, router wiring line 80)
- Modify: `docker-compose.yml` (`user-service` env block ~line 80; `user-portal` env block ~line 63)
- Modify: `docker-compose.test.yml` (`user-auth` env block ~line 93; portal-equivalent block if one exists — check with `grep -n 'user-portal' docker-compose.test.yml`)

**Interfaces:**
- Consumes: `TurnstileVerifier` from `./infrastructure/turnstile/turnstile-verifier` (Task 1); `buildUserRouter(useCases, humanVerifier)` (Task 2).
- Produces: env contract `TURNSTILE_SECRET_KEY` (user-auth, required) and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (user-portal) that Task 4 and deployment rely on.

- [x] **Step 1: Wire the verifier in main.ts**

In `apps/user-auth/src/main.ts`, add the import:

```typescript
import { TurnstileVerifier } from './infrastructure/turnstile/turnstile-verifier';
```

Read the env var next to the others (after line 40's `port`):

```typescript
const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY;
```

Extend the fail-fast guard (C21) — replace the existing check:

```typescript
if (!databaseUrl || !amqpUrl || !jwtPrivateKey || !jwtPublicKey || !turnstileSecretKey) {
  throw new Error(
    'Missing required environment variables: DATABASE_URL, RABBITMQ_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, TURNSTILE_SECRET_KEY',
  );
}
```

Construct and inject (the second argument added to the existing `buildUserRouter` call at line 80):

```typescript
const humanVerifier = new TurnstileVerifier(turnstileSecretKey);

app.route('/api/users', buildUserRouter({
  register:                new RegisterUseCase(userRepo, tokenRepo, passwordService, publisher),
  // ...existing use-case wiring unchanged...
  uploadIdentityDocument:  new UploadIdentityDocumentUseCase(userRepo, r2),
}, humanVerifier));
```

- [x] **Step 2: Verify the service builds**

Run: `pnpm turbo build --filter=user-auth`
Expected: build succeeds (this also clears the Task 2 note about `main.ts`).

- [x] **Step 3: Add env vars to docker-compose.yml**

In the `user-service` environment block (after `R2_BUCKET_NAME`):

```yaml
      TURNSTILE_SECRET_KEY: ${TURNSTILE_SECRET_KEY}
```

In the `user-portal` environment block (after `ADMIN_SERVICE_URL`):

```yaml
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: ${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
```

Note for the deploy `.env`: real keys come from the Cloudflare dashboard. `NEXT_PUBLIC_*` vars are inlined at Next.js build time — the production image build must also receive it (add as a build arg in the portal's CI build when deploying; flag this in the PR description rather than changing CI in this plan).

- [x] **Step 4: Add env vars to docker-compose.test.yml**

In the `user-auth` environment block (after `NODE_ENV: test`), the always-pass test secret:

```yaml
      TURNSTILE_SECRET_KEY: 1x0000000000000000000000000000000AA
```

Run `grep -n 'user-portal' docker-compose.test.yml` — if a user-portal service exists there, add `NEXT_PUBLIC_TURNSTILE_SITE_KEY: 1x00000000000000000000AA` to its environment block; if not, skip (integration tests hit user-auth directly).

- [x] **Step 5: Boot check**

Run: `docker compose -f docker-compose.test.yml up -d --build user-auth && sleep 5 && curl -s http://localhost:3001/health`
Expected: `{"status":"ok","service":"user-auth"}`. Then `docker compose -f docker-compose.test.yml down`.

- [x] **Step 6: Commit**

```bash
git add apps/user-auth/src/main.ts docker-compose.yml docker-compose.test.yml
git commit -m "feat(user-auth): wire Turnstile verifier and env configuration"
```

---

### Task 4: Turnstile widget on the login/register forms

Covers: C1–C10, C27

**Files:**
- Modify: `apps/user-portal/src/app/account/login/login-client.tsx`
- Create: `apps/user-portal/src/app/account/login/login-client.test.tsx`
- Modify: `apps/user-portal/package.json` (new dependency)

**Interfaces:**
- Consumes: backend contract from Task 2 — `turnstileToken` field in POST bodies; error codes `CAPTCHA_REQUIRED` / `CAPTCHA_FAILED` in `{ error: { code, message } }`.
- Produces: nothing consumed by later tasks.

- [x] **Step 1: Install the widget library**

```bash
pnpm add @marsidev/react-turnstile --filter user-portal
```

- [x] **Step 2: Write the failing component tests**

The component reads `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; the widget library is mocked so tests control token issuance. Follow the mocking conventions used in `apps/user-portal/src/lib/auth-context.test.tsx`.

```tsx
// apps/user-portal/src/app/account/login/login-client.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginClient } from './login-client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ login: vi.fn(), user: null, accessToken: null }),
}));

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
    <button type='button' onClick={() => onSuccess('mock-turnstile-token')}>solve-captcha</button>
  ),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

async function fillRegisterForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
  fireEvent.change(screen.getAllByLabelText('Email')[0], { target: { value: 'jane@example.com' } });
  fireEvent.change(screen.getAllByLabelText('Password')[0], { target: { value: 'secret123' } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'secret123' } });
}

describe('LoginClient human verification', () => {
  it('should_disableSubmit_when_noTurnstileToken', () => {
    render(<LoginClient />);

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(screen.getByRole('button', { name: 'Create Account', hidden: false })).toBeDefined();
    const submit = screen.getAllByRole('button').find(b => b.textContent === 'Create Account' && b.getAttribute('type') === 'submit');
    expect(submit?.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Please complete the verification')).toBeDefined();
  });

  it('should_sendTurnstileToken_when_registerSubmitted', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 201 }));
    render(<LoginClient />);
    await fillRegisterForm();

    fireEvent.click(screen.getByRole('button', { name: 'solve-captcha' }));
    const submit = screen.getAllByRole('button').find(b => b.textContent === 'Create Account' && b.getAttribute('type') === 'submit')!;
    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toMatchObject({
      email: 'jane@example.com',
      password: 'secret123',
      turnstileToken: 'mock-turnstile-token',
    });
  });

  it('should_renderServerError_when_captchaFailedReturned', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'CAPTCHA_FAILED', message: 'Human verification failed. Please try again.' } }),
      { status: 400 },
    ));
    render(<LoginClient />);
    await fillRegisterForm();

    fireEvent.click(screen.getByRole('button', { name: 'solve-captcha' }));
    const submit = screen.getAllByRole('button').find(b => b.textContent === 'Create Account' && b.getAttribute('type') === 'submit')!;
    fireEvent.click(submit);

    await waitFor(() =>
      expect(screen.getByText('Human verification failed. Please try again.')).toBeDefined(),
    );
  });
});
```

If `getByLabelText` fails because the existing markup does not associate labels with inputs (`<label>` lacks `htmlFor`), fix the markup by adding `htmlFor`/`id` pairs — accessibility fix consistent with the Boy Scout Rule — rather than weakening the test to placeholder queries.

- [x] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run apps/user-portal/src/app/account/login/login-client.test.tsx`
Expected: FAIL — no Turnstile in component, submit not disabled, token not sent.

- [x] **Step 4: Implement the widget in login-client.tsx**

Changes to `apps/user-portal/src/app/account/login/login-client.tsx`:

Imports and state:

```tsx
import { useRef, useState } from 'react';
import { Turnstile, TurnstileInstance } from '@marsidev/react-turnstile';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
```

Inside `LoginClient`:

```tsx
const [turnstileToken, setTurnstileToken] = useState('');
const turnstileRef = useRef<TurnstileInstance | null>(null);

function resetTurnstile() {
  setTurnstileToken('');
  turnstileRef.current?.reset();
}
```

Clear the token when switching tabs (the widget remounts per form) — in the tab `onClick`:

```tsx
<button key={t} onClick={() => { setTab(t); setTurnstileToken(''); }}
```

`handleLogin` — send the token and reset on failure (C4, C9):

```tsx
async function handleLogin(data: LoginForm) {
  setServerError('');
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, turnstileToken }),
    });
    const json = await res.json() as { data?: { accessToken: string }; error?: { code: string; message: string } };
    if (!res.ok) { setServerError(json.error?.message ?? 'Sign in failed'); resetTurnstile(); return; }
    const accessToken = json.data!.accessToken;
    const payload = JSON.parse(atob(accessToken.split('.')[1])) as { userId: string; email: string; verificationStatus: string; role: string };
    login(accessToken, { userId: payload.userId, email: payload.email, verificationStatus: payload.verificationStatus, role: payload.role });
    router.push(returnUrl);
  } catch {
    setServerError('Unable to connect. Please try again.');
    resetTurnstile();
  }
}
```

`handleRegister` — same pattern (C5, C9):

```tsx
async function handleRegister(data: RegisterForm) {
  setServerError('');
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email, password: data.password, turnstileToken }),
    });
    const json = await res.json() as { error?: { code: string; message: string } };
    if (!res.ok) { setServerError(json.error?.message ?? 'Registration failed'); resetTurnstile(); return; }
    setRegistered(true);
  } catch {
    setServerError('Unable to connect. Please try again.');
    resetTurnstile();
  }
}
```

Widget block — add inside BOTH forms, between the `serverError` line and the submit button (C1, C2, C7, C10):

```tsx
<div>
  <Turnstile
    ref={turnstileRef}
    siteKey={TURNSTILE_SITE_KEY}
    onSuccess={setTurnstileToken}
    onExpire={() => setTurnstileToken('')}
  />
  {!turnstileToken && <p className='font-sans text-xs text-mut mt-1'>Please complete the verification</p>}
</div>
```

Submit buttons — add the token to the disabled condition (C6):

```tsx
// sign-in form
disabled={loginForm.formState.isSubmitting || !turnstileToken}
// register form
disabled={registerForm.formState.isSubmitting || !turnstileToken}
```

- [x] **Step 5: Add the site key for local dev**

Append to `apps/user-portal/.env.local` (create the file if absent — it is gitignored):

```
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

If the repo has an `apps/user-portal/.env.example`, add the same line there so the variable is documented in git.

- [x] **Step 6: Run the frontend tests**

Run: `pnpm vitest run apps/user-portal/src/app/account/login/login-client.test.tsx`
Expected: 3 tests PASS.

Run: `pnpm turbo test --filter=user-portal`
Expected: full portal suite PASS.

- [x] **Step 7: Commit**

```bash
git add apps/user-portal/src/app/account/login/ apps/user-portal/package.json pnpm-lock.yaml
git commit -m "feat(user-portal): add Turnstile human verification to sign-up and login"
```

---

### Task 5: Integration tests and browser verification

Covers: C28, C29

**Files:**
- Modify: `tests/integration/flow-1-buyer-onboarding.test.ts` (register body line ~28, login body line ~84; new test case)
- Modify: `tests/integration/flow-2-full-auction-lifecycle.test.ts` (login body line ~71)
- Modify: `tests/integration/flow-3-reserve-not-met.test.ts` (login body line ~48)
- Modify: `tests/helpers/seed.ts` (admin login body line ~37)

**Interfaces:**
- Consumes: user-auth running under `docker-compose.test.yml` with the always-pass `TURNSTILE_SECRET_KEY` (Task 3) — the test secret accepts ANY non-empty `turnstileToken`, but a MISSING token is still rejected by the middleware before the verifier runs.
- Produces: nothing (final task).

- [x] **Step 1: Add tokens to existing integration register/login calls**

Every direct POST to `/api/users/register` or `/api/users/login` must add `turnstileToken: 'integration-test-token'` to its body. Exact edits:

`tests/integration/flow-1-buyer-onboarding.test.ts` (~line 28):

```typescript
const registerRes = await api(USER_PORT).post<{ data: { message: string } }>(
  '/api/users/register',
  { email, password, turnstileToken: 'integration-test-token' },
);
```

`tests/integration/flow-1-buyer-onboarding.test.ts` (~line 84):

```typescript
const loginRes = await api(USER_PORT).post<{ data: { accessToken: string } }>(
  '/api/users/login',
  { email, password, turnstileToken: 'integration-test-token' },
);
```

`tests/integration/flow-2-full-auction-lifecycle.test.ts` (~line 71) and `tests/integration/flow-3-reserve-not-met.test.ts` (~line 48):

```typescript
const loginRes = await api(USER_PORT).post<{ data: { accessToken: string } }>(
  '/api/users/login',
  { email: buyer.email, password: buyer.password, turnstileToken: 'integration-test-token' },
);
```

`tests/helpers/seed.ts` (~line 37):

```typescript
const { status, body } = await api(PORTS.user).post<{
  data: { accessToken: string };
}>('/api/users/login', { email, password, turnstileToken: 'integration-test-token' });
```

Then sweep for stragglers — this must return only the lines edited above:

```bash
grep -rn "users/register\|users/login" tests/
```

- [x] **Step 2: Add the missing-token integration test**

In `tests/integration/flow-1-buyer-onboarding.test.ts`, add a new `it` block inside the existing describe (after the main flow test):

```typescript
it('rejects registration with 400 CAPTCHA_REQUIRED when no turnstile token is sent', async () => {
  const email = `buyer-no-captcha-${Date.now()}@test.carat-room.internal`;

  const res = await api(USER_PORT).post<{ error: { code: string; message: string } }>(
    '/api/users/register',
    { email, password: 'BuyerPass1!' },
  );

  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('CAPTCHA_REQUIRED');
});
```

- [x] **Step 3: Run the integration suite**

```bash
pnpm turbo build
docker compose -f docker-compose.test.yml up -d --build
pnpm run test:integration
docker compose -f docker-compose.test.yml down -v
```

Expected: all flows PASS including the new CAPTCHA_REQUIRED test.

- [x] **Step 4: Drive the real form in the browser (C28)**

With local infra up (`docker compose up -d`) and the services running (`pnpm turbo dev`), and `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` in `apps/user-portal/.env.local` and `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` exported for user-auth:

1. Open `http://localhost:3000/account/login`, switch to **Create Account**.
2. Confirm the Turnstile widget renders and auto-passes (test key), the submit button enables only after it does, and the "Please complete the verification" hint disappears.
3. Submit a registration with a fresh email — expect the "Check your email" confirmation.
4. Switch to **Sign In** and log in with a seeded/verified account — expect redirect to the dashboard.

This step is a hard gate: do not mark the plan complete on unit tests alone.

- [x] **Step 5: Commit and mark the plan complete**

```bash
git add tests/
git commit -m "test(integration): send turnstile token in auth flows and cover CAPTCHA_REQUIRED"
```

Then tick all checkboxes in this plan and commit:

```bash
git add docs/superpowers/plans/11-signup-human-check/plan.md
git commit -m "chore: mark all plan 11 tasks complete"
```

---

## Execution Notes

- Tasks must run in order 1 → 5: Task 2 changes `buildUserRouter`'s signature (compile error in `main.ts` until Task 3), Task 5 depends on Task 3's compose env.
- The Cloudflare test secret key accepts any token value; only a missing/empty `turnstileToken` exercises the rejection path in test environments. Real rejection is covered by unit tests with a fake verifier.
- Production rollout needs real keys from the Cloudflare dashboard set in the deploy `.env` (`TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) and the site key passed as a build arg to the user-portal image build (Next.js inlines `NEXT_PUBLIC_*` at build time).
