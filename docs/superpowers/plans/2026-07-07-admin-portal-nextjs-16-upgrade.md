# Admin Portal Next.js 16 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `apps/admin-portal` from Next.js 14.2.4 / React 18.3.1 to Next.js 16.2.x / React 19.2, on a dedicated branch, with all sync-API usages migrated to async and all existing tests passing.

**Architecture:** Bump dependencies, then migrate each file that uses a Next.js API affected by the v16 breaking changes: the `middleware` → `proxy` rename, and the removal of synchronous `cookies()`/`headers()`/`params` access. No new architecture — this is a like-for-like API migration within the existing CRUD admin app.

**Tech Stack:** Next.js 16 (App Router, Turbopack default), React 19.2, TypeScript 5.4, Vitest 1.6, `jose` for JWT decoding.

## Global Constraints

- Branch name: `upgrade/admin-portal-nextjs-16`, branched off `main`.
- Do not touch `apps/user-portal` in this plan — it is upgraded separately, after this branch merges.
- Node.js ≥20.9.0 required by Next.js 16 (per spec: `docs/superpowers/specs/2026-07-07-nextjs-16-upgrade-design.md`).
- British English in all comments and copy (existing repo convention).
- No `_` prefix on identifiers, no `Manager`/`Helper`/`Utils` class names, named exports only (existing repo convention — this plan does not introduce any of these, but do not introduce them while editing).
- Test file co-location: `<filename>.test.ts` next to the source file (existing repo convention, already followed in this app).
- `reactCompiler` and `cacheComponents` are explicitly out of scope — do not enable them.

---

### Task 1: Bump dependencies and scaffold the branch

**Files:**
- Modify: `apps/admin-portal/package.json`

**Interfaces:**
- Produces: `apps/admin-portal` running on `next@16.2.x`, `react@19.2.x`, `react-dom@19.2.x` — every later task in this plan assumes these versions are installed.

- [ ] **Step 1: Create the upgrade branch**

```bash
git checkout main
git pull
git checkout -b upgrade/admin-portal-nextjs-16
```

- [ ] **Step 2: Update `apps/admin-portal/package.json` dependency versions**

Change these three lines in the `dependencies` block:

```diff
-    "next": "14.2.4",
-    "react": "^18.3.1",
-    "react-dom": "^18.3.1",
+    "next": "16.2.7",
+    "react": "^19.2.0",
+    "react-dom": "^19.2.0",
```

Change these two lines in the `devDependencies` block:

```diff
-    "@types/react": "^18.3.3",
-    "@types/react-dom": "^18.3.0",
+    "@types/react": "^19.2.0",
+    "@types/react-dom": "^19.2.0",
```

- [ ] **Step 3: Install and verify the version landed**

```bash
pnpm install
```

Expected: lockfile updates with no `ERR_PNPM` peer-dependency errors. If pnpm reports a peer conflict from `@testing-library/react@^16.0.0` against React 19, check the installed version with `pnpm ls @testing-library/react --filter @carat-room/admin-portal` — 16.x already supports React 19, so no version bump is needed there.

```bash
cat apps/admin-portal/node_modules/next/package.json | grep '"version"'
```

Expected: `"version": "16.2.7"` (or newer 16.x — if a newer patch installed via the unpinned `^` on `react`/`react-dom`, that is fine, continue with it).

- [ ] **Step 4: Commit**

```bash
git add apps/admin-portal/package.json pnpm-lock.yaml
git commit -m "chore(admin-portal): bump next to 16, react to 19"
```

---

### Task 2: Rename `middleware.ts` to `proxy.ts`

**Files:**
- Create: `apps/admin-portal/src/proxy.ts` (replaces `middleware.ts`)
- Create: `apps/admin-portal/src/proxy.test.ts` (replaces `middleware.test.ts`)
- Delete: `apps/admin-portal/src/middleware.ts`
- Delete: `apps/admin-portal/src/middleware.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `proxy` function that Next.js 16 invokes at the network boundary — no other task in this plan imports it, since it's wired up by Next.js's file-convention, not by application code.

- [ ] **Step 1: Write `apps/admin-portal/src/proxy.ts`**

Same logic as the current `middleware.ts`, with the function renamed:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { decodeJwt } from 'jose';
import { ADMIN_TOKEN_COOKIE } from '@/lib/auth-cookie';

function hasValidToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const { exp } = decodeJwt(token);
    return typeof exp === 'number' && exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ADMIN_TOKEN_COOKIE)?.value;
  const isTokenValid = hasValidToken(token);
  const isLoginPage = pathname === '/admin/login';

  if (!isTokenValid && !isLoginPage) {
    const response = NextResponse.redirect(new URL('/admin/login', request.url));
    if (token) response.cookies.delete(ADMIN_TOKEN_COOKIE);
    return response;
  }

  if (isTokenValid && isLoginPage) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
```

- [ ] **Step 2: Write `apps/admin-portal/src/proxy.test.ts`**

Same as the current `middleware.test.ts`, importing and calling `proxy` instead of `middleware`:

```typescript
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

function encodeSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function buildToken(exp: number): string {
  const header = encodeSegment({ alg: 'RS256', typ: 'JWT' });
  const payload = encodeSegment({ userId: 'u1', role: 'ADMIN', exp });
  return `${header}.${payload}.fake-signature`;
}

function buildRequest(path: string, token?: string): NextRequest {
  const request = new NextRequest(new URL(`http://localhost:3006${path}`));
  if (token) {
    request.cookies.set('admin_token', token);
  }
  return request;
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 900;
const PAST_EXP = Math.floor(Date.now() / 1000) - 60;

describe('proxy', () => {
  it('should_redirectToLogin_when_noTokenOnProtectedPath', () => {
    const res = proxy(buildRequest('/admin/dashboard'));

    expect(res.headers.get('location')).toBe('http://localhost:3006/admin/login');
  });

  it('should_allowRequest_when_tokenIsValidOnProtectedPath', () => {
    const res = proxy(buildRequest('/admin/dashboard', buildToken(FUTURE_EXP)));

    expect(res.headers.get('location')).toBeNull();
  });

  it('should_redirectToDashboard_when_tokenIsValidOnLoginPage', () => {
    const res = proxy(buildRequest('/admin/login', buildToken(FUTURE_EXP)));

    expect(res.headers.get('location')).toBe('http://localhost:3006/admin/dashboard');
  });

  it('should_redirectToLoginAndClearCookie_when_tokenIsExpiredOnProtectedPath', () => {
    const res = proxy(buildRequest('/admin/dashboard', buildToken(PAST_EXP)));

    expect(res.headers.get('location')).toBe('http://localhost:3006/admin/login');
    expect(res.headers.get('set-cookie')).toContain('admin_token=;');
  });

  it('should_allowLoginPage_when_tokenIsExpired', () => {
    const res = proxy(buildRequest('/admin/login', buildToken(PAST_EXP)));

    expect(res.headers.get('location')).toBeNull();
  });

  it('should_redirectToLoginAndClearCookie_when_tokenIsMalformed', () => {
    const res = proxy(buildRequest('/admin/dashboard', 'not-a-jwt'));

    expect(res.headers.get('location')).toBe('http://localhost:3006/admin/login');
    expect(res.headers.get('set-cookie')).toContain('admin_token=;');
  });
});
```

- [ ] **Step 3: Delete the old files**

```bash
git rm apps/admin-portal/src/middleware.ts apps/admin-portal/src/middleware.test.ts
```

- [ ] **Step 4: Run the test**

```bash
pnpm --filter @carat-room/admin-portal test -- proxy.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/proxy.ts apps/admin-portal/src/proxy.test.ts
git commit -m "refactor(admin-portal): rename middleware to proxy for Next.js 16"
```

---

### Task 3: Migrate async `params` in the four single-ID detail pages

**Files:**
- Modify: `apps/admin-portal/src/app/admin/invoices/[id]/page.tsx`
- Modify: `apps/admin-portal/src/app/admin/lots/[id]/page.tsx`
- Modify: `apps/admin-portal/src/app/admin/users/[id]/page.tsx`
- Modify: `apps/admin-portal/src/app/admin/fulfilments/[id]/page.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks — these four pages are leaves in the route tree.

These four files share the same shape: `{ params }: { params: { id: string } }` must become `{ params }: { params: Promise<{ id: string }> }`, and `params.id` must become a destructured, awaited `id`. No test files exist for these pages (they are Server Components with no unit tests in this app), so there is no test file to update — verification is the build step at the end of this task.

- [ ] **Step 1: Edit `apps/admin-portal/src/app/admin/invoices/[id]/page.tsx`**

```diff
-export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
-  const res = await adminApi.get<{ data: InvoiceDetail }>(`/admin/api/invoices/${params.id}`);
+export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
+  const { id } = await params;
+  const res = await adminApi.get<{ data: InvoiceDetail }>(`/admin/api/invoices/${id}`);
```

- [ ] **Step 2: Edit `apps/admin-portal/src/app/admin/lots/[id]/page.tsx`**

```diff
-export default async function EditLotPage({ params }: { params: { id: string } }) {
-  const res = await adminApi.get<{ data: Lot }>(`/admin/api/lots/${params.id}`);
+export default async function EditLotPage({ params }: { params: Promise<{ id: string }> }) {
+  const { id } = await params;
+  const res = await adminApi.get<{ data: Lot }>(`/admin/api/lots/${id}`);
```

- [ ] **Step 3: Edit `apps/admin-portal/src/app/admin/users/[id]/page.tsx`**

```diff
-export default async function UserDetailPage({ params }: { params: { id: string } }) {
-  const res = await adminApi.get<{ data: UserDetail }>(`/admin/api/users/${params.id}`);
+export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
+  const { id } = await params;
+  const res = await adminApi.get<{ data: UserDetail }>(`/admin/api/users/${id}`);
```

- [ ] **Step 4: Edit `apps/admin-portal/src/app/admin/fulfilments/[id]/page.tsx`**

```diff
-export default async function FulfilmentDetailPage({ params }: { params: { id: string } }) {
-  const res = await adminApi.get<{ data: FulfilmentDetail }>(`/admin/api/fulfilments/${params.id}`);
+export default async function FulfilmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
+  const { id } = await params;
+  const res = await adminApi.get<{ data: FulfilmentDetail }>(`/admin/api/fulfilments/${id}`);
```

- [ ] **Step 5: Type-check**

```bash
pnpm --filter @carat-room/admin-portal exec tsc --noEmit
```

Expected: no errors referencing `invoices/[id]/page.tsx`, `lots/[id]/page.tsx`, `users/[id]/page.tsx`, or `fulfilments/[id]/page.tsx`. (Other pre-existing errors, if any, are out of scope for this task — only confirm these four files are clean.)

- [ ] **Step 6: Commit**

```bash
git add apps/admin-portal/src/app/admin/invoices/[id]/page.tsx \
        apps/admin-portal/src/app/admin/lots/[id]/page.tsx \
        apps/admin-portal/src/app/admin/users/[id]/page.tsx \
        apps/admin-portal/src/app/admin/fulfilments/[id]/page.tsx
git commit -m "refactor(admin-portal): await async params in detail pages for Next.js 16"
```

---

### Task 4: Migrate async `params` in the auctions detail page

**Files:**
- Modify: `apps/admin-portal/src/app/admin/auctions/[lotId]/page.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks.

This page is separated from Task 3 because `params.lotId` is read twice — once to fetch data, once to pass into the `<AuctionLiveStats>` component prop — so both call sites need updating to the destructured `lotId`.

- [ ] **Step 1: Edit `apps/admin-portal/src/app/admin/auctions/[lotId]/page.tsx`**

```diff
-export default async function AuctionDetailPage({ params }: { params: { lotId: string } }) {
-  const res = await adminApi.get<{ data: AuctionDetail }>(`/admin/api/auctions/${params.lotId}`);
+export default async function AuctionDetailPage({ params }: { params: Promise<{ lotId: string }> }) {
+  const { lotId } = await params;
+  const res = await adminApi.get<{ data: AuctionDetail }>(`/admin/api/auctions/${lotId}`);
   const auction = res.data;

   return (
     <div className='space-y-6'>
       <h1 className='text-2xl font-semibold'>{auction.lotTitle}</h1>
-      <AuctionLiveStats lotId={params.lotId} />
+      <AuctionLiveStats lotId={lotId} />
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @carat-room/admin-portal exec tsc --noEmit
```

Expected: no errors referencing `auctions/[lotId]/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/app/admin/auctions/\[lotId\]/page.tsx
git commit -m "refactor(admin-portal): await async params in auction detail page for Next.js 16"
```

---

### Task 5: Migrate async `params` and `cookies()` in the admin API proxy route

**Files:**
- Modify: `apps/admin-portal/src/app/api/admin/[...path]/route.ts`

**Interfaces:**
- Consumes: `ADMIN_TOKEN_COOKIE` from `apps/admin-portal/src/lib/auth-cookie.ts` (unchanged).
- Produces: nothing consumed by later tasks. No test file exists for this route today, so verification is the type-check step.

This file has two separate v16 breaking changes to fix: the route's `params` (now a `Promise`), and the synchronous `cookies()` call.

- [ ] **Step 1: Edit `apps/admin-portal/src/app/api/admin/[...path]/route.ts`**

```diff
-type RouteContext = { params: { path: string[] } };
+type RouteContext = { params: Promise<{ path: string[] }> };

 async function proxyToAdminService(req: NextRequest, context: RouteContext): Promise<NextResponse> {
-  const token = cookies().get(ADMIN_TOKEN_COOKIE)?.value;
+  const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value;

   if (!token) {
     return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
   }

   const adminServiceUrl = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3007';
-  const targetPath = context.params.path.join('/');
+  const { path } = await context.params;
+  const targetPath = path.join('/');
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @carat-room/admin-portal exec tsc --noEmit
```

Expected: no errors referencing `api/admin/[...path]/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/app/api/admin/\[...path\]/route.ts
git commit -m "refactor(admin-portal): await async params and cookies in admin API proxy route for Next.js 16"
```

---

### Task 6: Migrate async `cookies()` in `lib/auth.ts`

**Files:**
- Modify: `apps/admin-portal/src/lib/auth.ts`
- Modify: `apps/admin-portal/src/lib/auth.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `getAdminToken(): Promise<string | undefined>` — note the return type changes from a bare `string | undefined` to a `Promise<string | undefined>`. `getAdminToken` has no production callers in this app today (only its own test), so no other file in this codebase needs updating for this signature change.

- [ ] **Step 1: Write the failing test — update `apps/admin-portal/src/lib/auth.test.ts`**

```diff
   it('should_returnToken_when_cookieIsPresent', async () => {
-    vi.mocked(cookies).mockReturnValue({
+    vi.mocked(cookies).mockResolvedValue({
       get: vi.fn().mockReturnValue({ value: 'admin-jwt-abc' }),
-    } as unknown as ReturnType<typeof cookies>);
+    } as unknown as Awaited<ReturnType<typeof cookies>>);

-    const token = getAdminToken();
+    const token = await getAdminToken();

     expect(token).toBe('admin-jwt-abc');
   });

   it('should_returnUndefined_when_cookieIsAbsent', async () => {
-    vi.mocked(cookies).mockReturnValue({
+    vi.mocked(cookies).mockResolvedValue({
       get: vi.fn().mockReturnValue(undefined),
-    } as unknown as ReturnType<typeof cookies>);
+    } as unknown as Awaited<ReturnType<typeof cookies>>);

-    const token = getAdminToken();
+    const token = await getAdminToken();

     expect(token).toBeUndefined();
   });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @carat-room/admin-portal test -- auth.test.ts
```

Expected: FAIL — `getAdminToken()` still returns a bare value, so `mockResolvedValue` on the mocked `cookies` produces a `Promise` where the test's synchronous `.get()` chain expects a plain object, causing a `TypeError` or an assertion mismatch on `token`.

- [ ] **Step 3: Update `apps/admin-portal/src/lib/auth.ts`**

```diff
-export function getAdminToken(): string | undefined {
-  return cookies().get(ADMIN_TOKEN_COOKIE)?.value;
+export async function getAdminToken(): Promise<string | undefined> {
+  return (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value;
 }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @carat-room/admin-portal test -- auth.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/lib/auth.ts apps/admin-portal/src/lib/auth.test.ts
git commit -m "refactor(admin-portal): await async cookies in getAdminToken for Next.js 16"
```

---

### Task 7: Migrate async `cookies()` in `lib/admin-api.ts`

**Files:**
- Modify: `apps/admin-portal/src/lib/admin-api.ts`
- Modify: `apps/admin-portal/src/lib/admin-api.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `adminApi.get/post/patch/delete` — signatures unchanged (already `async`/`Promise`-returning), so no caller elsewhere in the app needs updating.

- [ ] **Step 1: Write the failing test — update the mock in `apps/admin-portal/src/lib/admin-api.test.ts`**

```diff
 vi.mock('next/headers', () => ({
-  cookies: vi.fn(() => ({ get: vi.fn(() => ({ value: 'test-admin-jwt' })) })),
+  cookies: vi.fn(() => Promise.resolve({ get: vi.fn(() => ({ value: 'test-admin-jwt' })) })),
 }));
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @carat-room/admin-portal test -- admin-api.test.ts
```

Expected: FAIL — `request()` still calls `cookies().get(...)` synchronously on what is now a `Promise`, so `.get` is `undefined` and the call throws a `TypeError`.

- [ ] **Step 3: Update `apps/admin-portal/src/lib/admin-api.ts`**

```diff
 async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
-  const token = cookies().get(ADMIN_TOKEN_COOKIE)?.value ?? '';
+  const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? '';
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @carat-room/admin-portal test -- admin-api.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/lib/admin-api.ts apps/admin-portal/src/lib/admin-api.test.ts
git commit -m "refactor(admin-portal): await async cookies in adminApi request for Next.js 16"
```

---

### Task 8: Migrate async `cookies()` in the auth API route

**Files:**
- Modify: `apps/admin-portal/src/app/api/auth/route.ts`
- Modify: `apps/admin-portal/src/app/api/auth/route.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks — `POST`/`DELETE` are the route's exported handlers, called only by the Next.js router.

- [ ] **Step 1: Write the failing test — update the mock in `apps/admin-portal/src/app/api/auth/route.test.ts`**

```diff
 vi.mock('next/headers', () => ({
-  cookies: vi.fn(() => ({ set: mockCookiesSet, delete: mockCookiesDelete })),
+  cookies: vi.fn(() => Promise.resolve({ set: mockCookiesSet, delete: mockCookiesDelete })),
 }));
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @carat-room/admin-portal test -- route.test.ts
```

Expected: FAIL — `POST`/`DELETE` still call `cookies().set(...)`/`cookies().delete(...)` synchronously on what is now a `Promise`, so the calls throw a `TypeError` and every assertion on `mockCookiesSet`/`mockCookiesDelete` fails.

- [ ] **Step 3: Update `apps/admin-portal/src/app/api/auth/route.ts`**

```diff
-  cookies().set(ADMIN_TOKEN_COOKIE, body.data.accessToken, {
+  (await cookies()).set(ADMIN_TOKEN_COOKIE, body.data.accessToken, {
     httpOnly: true,
     secure: process.env.NODE_ENV === 'production',
     sameSite: 'lax',
     maxAge,
     path: '/',
   });

   return NextResponse.json({ ok: true });
 }

 export async function DELETE(): Promise<NextResponse> {
-  cookies().delete(ADMIN_TOKEN_COOKIE);
+  (await cookies()).delete(ADMIN_TOKEN_COOKIE);
   return NextResponse.json({ ok: true });
 }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @carat-room/admin-portal test -- route.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/app/api/auth/route.ts apps/admin-portal/src/app/api/auth/route.test.ts
git commit -m "refactor(admin-portal): await async cookies in auth route for Next.js 16"
```

---

### Task 9: Bump CI Node.js version

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/integration-tests.yml`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks. This is a monorepo-wide CI config shared with `user-portal` and every other app — bumping it now is safe because Next.js 14 (still running in `user-portal` until its own upgrade) supports Node ≥18.17, so Node 20.9 satisfies both.

- [ ] **Step 1: Edit `.github/workflows/ci.yml`**

```diff
       - uses: actions/setup-node@v4
         with:
-          node-version: 20
+          node-version: '20.9'
           cache: pnpm
```

- [ ] **Step 2: Edit `.github/workflows/integration-tests.yml`**

```diff
       - uses: actions/setup-node@v4
         with:
-          node-version: 20
+          node-version: '20.9'
           cache: pnpm
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/integration-tests.yml
git commit -m "ci: bump Node.js to 20.9 minimum for Next.js 16 compatibility"
```

---

### Task 10: Full verification and manual smoke test

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: the fully migrated `apps/admin-portal` from Tasks 1–9.
- Produces: a verified branch ready to open as a PR into `main`.

- [ ] **Step 1: Run the full admin-portal test suite**

```bash
pnpm --filter @carat-room/admin-portal test
```

Expected: PASS, all test files (including `proxy.test.ts`, `auth.test.ts`, `admin-api.test.ts`, `route.test.ts`, plus every other pre-existing test file untouched by this plan).

- [ ] **Step 2: Build with Turbopack (the new v16 default)**

```bash
pnpm --filter @carat-room/admin-portal build
```

Expected: build succeeds. Since `apps/admin-portal/next.config.mjs` has no custom `webpack()` block, Turbopack should build without the "webpack config found" failure documented in the Next.js 16 upgrade guide. If the build fails with an image-config-related error, check `next.config.mjs` — admin-portal has no `images.domains` config, so no `remotePatterns` migration is needed here (that fix belongs to the separate `user-portal` upgrade plan).

- [ ] **Step 3: Type-check the whole app one more time**

```bash
pnpm --filter @carat-room/admin-portal exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Start the app locally and manually smoke-test the auth-gated routes**

```bash
pnpm --filter @carat-room/admin-portal dev
```

With the app running on `http://localhost:3008`:
1. Visit `http://localhost:3008/admin/dashboard` while logged out — expect a redirect to `/admin/login` (exercises `proxy.ts`).
2. Log in with valid admin credentials at `/admin/login` — expect a redirect to `/admin/dashboard` (exercises `app/api/auth/route.ts`'s `POST`, which sets the cookie via the now-awaited `cookies()`).
3. Visit `/admin/login` again while still logged in — expect a redirect to `/admin/dashboard` (exercises `proxy.ts`'s already-authenticated branch).
4. Open an existing invoice, lot, user, and fulfilment detail page by ID (e.g. `/admin/invoices/<id>`, `/admin/lots/<id>`, `/admin/users/<id>`, `/admin/fulfilments/<id>`) — expect each to render its data correctly (exercises the awaited `params` in Task 3).
5. Open an auction detail page (e.g. `/admin/auctions/<lotId>`) — expect the page and its live stats component to both receive the correct ID (exercises the two awaited `params.lotId` reads fixed in Task 4).
6. Log out (whichever UI action calls `DELETE /api/auth`) — expect the cookie to clear and a redirect back to `/admin/login`.

- [ ] **Step 5: Push the branch and open a draft PR for review**

```bash
git push -u origin upgrade/admin-portal-nextjs-16
gh pr create --draft --title "Upgrade admin-portal to Next.js 16 / React 19" --body "$(cat <<'EOF'
## Summary
- Bumps admin-portal to Next.js 16.2.x and React 19.2
- Renames middleware.ts to proxy.ts per the v16 convention change
- Migrates all synchronous params/cookies() usages to the required async form
- Bumps CI Node.js version to 20.9 (monorepo-wide, safe for the not-yet-upgraded user-portal)

## Test plan
- [x] `pnpm --filter @carat-room/admin-portal test` passes
- [x] `pnpm --filter @carat-room/admin-portal build` passes with Turbopack
- [x] Manually verified login/logout/redirect flows and all detail pages locally

Ref: docs/superpowers/specs/2026-07-07-nextjs-16-upgrade-design.md
Ref: docs/superpowers/plans/2026-07-07-admin-portal-nextjs-16-upgrade.md
EOF
)"
```

Do not merge yet — this PR must be reviewed and verified before the `upgrade/user-portal-nextjs-16` branch is started, per the design spec's sequencing requirement.

- [ ] **Step 6: Record lessons learned for the user-portal upgrade**

Before starting the user-portal plan, note in the PR description or a follow-up comment anything that surprised you during this migration (e.g. codemod edge cases you had to hand-fix, peer-dependency versions that needed manual bumping, Turbopack build quirks). The user-portal plan explicitly expects this input — see `docs/superpowers/plans/2026-07-07-user-portal-nextjs-16-upgrade.md`.

