# User Portal Next.js 16 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `apps/user-portal` from Next.js 14.2.4 / React 18.3.1 to Next.js 16.2.x / React 19.2, on a dedicated branch, with all sync-API usages migrated to async and the app building and running correctly.

**Architecture:** Same migration shape as the already-merged admin-portal upgrade (see `docs/superpowers/plans/2026-07-07-admin-portal-nextjs-16-upgrade.md` for the pattern and any lessons-learned notes left on that PR): bump dependencies, rename `middleware` → `proxy`, migrate every synchronous `params`/`cookies()` usage to async. This app additionally has **Client Component pages** that receive `params` — those cannot be migrated with `await` (a Client Component can't be an `async function`) and instead need React's `use()` hook, which the admin-portal app did not require since none of its dynamic pages are Client Components.

**Tech Stack:** Next.js 16 (App Router, Turbopack default), React 19.2, TypeScript 5.4, Vitest 1.6, SWR, `next-intl`, Stripe Elements.

## Global Constraints

- Branch name: `upgrade/user-portal-nextjs-16`, branched off `main` (not off the admin-portal branch).
- Do not start this branch until `upgrade/admin-portal-nextjs-16` has merged into `main` and its lessons learned have been reviewed, per the design spec's sequencing requirement.
- Node.js ≥20.9.0 required by Next.js 16 (per spec: `docs/superpowers/specs/2026-07-07-nextjs-16-upgrade-design.md`). The admin-portal upgrade already bumped the shared CI workflows to `20.9` — Task 9 below only needs to act if that change is somehow not yet on `main`.
- British English in all comments and copy (existing repo convention).
- No `_` prefix on identifiers, no `Manager`/`Helper`/`Utils` class names, named exports only (existing repo convention).
- Test file co-location: `<filename>.test.ts`/`.test.tsx` next to the source file (existing repo convention).
- `reactCompiler` and `cacheComponents` are explicitly out of scope — do not enable them.

---

### Task 1: Bump dependencies and scaffold the branch

**Files:**
- Modify: `apps/user-portal/package.json`

**Interfaces:**
- Produces: `apps/user-portal` running on `next@16.2.x`, `react@19.2.x`, `react-dom@19.2.x` — every later task in this plan assumes these versions are installed.

- [x] **Step 1: Create the upgrade branch**

```bash
git checkout main
git pull
git checkout -b upgrade/user-portal-nextjs-16
```

- [x] **Step 2: Update `apps/user-portal/package.json` dependency versions**

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

- [x] **Step 3: Install and verify the version landed**

```bash
pnpm install
```

Expected: lockfile updates with no `ERR_PNPM` peer-dependency errors. If pnpm reports a peer conflict from `@stripe/react-stripe-js` or `next-intl` against React 19, check their installed versions with `pnpm ls @stripe/react-stripe-js next-intl --filter @carat-room/user-portal` — both already support React 19 as peers by this point, so no version bump should be needed. If one genuinely doesn't, bump it to its latest published version before continuing, and note this in the PR description as a deviation from this plan.

```bash
cat apps/user-portal/node_modules/next/package.json | grep '"version"'
```

Expected: `"version": "16.2.7"` (or newer 16.x).

- [x] **Step 4: Commit**

```bash
git add apps/user-portal/package.json pnpm-lock.yaml
git commit -m "chore(user-portal): bump next to 16, react to 19"
```

---

### Task 2: Rename `middleware.ts` to `proxy.ts`

**Files:**
- Create: `apps/user-portal/src/proxy.ts` (replaces `middleware.ts`)
- Delete: `apps/user-portal/src/middleware.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `proxy` function that Next.js 16 invokes at the network boundary — no other task in this plan imports it. Unlike admin-portal, there is no `middleware.test.ts` for this file, so there is no test to rename.

- [x] **Step 1: Write `apps/user-portal/src/proxy.ts`**

Same logic as the current `middleware.ts`, with the function renamed:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  if (!refreshToken) {
    const loginUrl = new URL('/account/login', request.url);
    loginUrl.searchParams.set('returnUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/account/dashboard', '/account/bids', '/account/watchlist', '/account/won', '/account/invoices/:path*', '/account/fulfilments/:path*', '/account/register-to-bid'],
};
```

- [x] **Step 2: Delete the old file**

```bash
git rm apps/user-portal/src/middleware.ts
```

- [x] **Step 3: Verify with a type-check (no unit test exists for this file)**

```bash
pnpm --filter @carat-room/user-portal exec tsc --noEmit
```

Expected: no errors referencing `proxy.ts`.

- [x] **Step 4: Commit**

```bash
git add apps/user-portal/src/proxy.ts
git commit -m "refactor(user-portal): rename middleware to proxy for Next.js 16"
```

---

### Task 3: Fix deprecated `images.domains` config

**Files:**
- Modify: `apps/user-portal/next.config.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `next/image` configuration consumed by every page using `<Image>` from `next/image` (e.g. `app/account/invoices/[id]/page.tsx` in Task 5) — the remote host allowlist must stay correct or those images will 400 at request time.

- [x] **Step 1: Edit `apps/user-portal/next.config.mjs`**

```diff
-  images: { domains: ['pub-placeholder.r2.dev'] },
+  images: {
+    remotePatterns: [
+      {
+        protocol: 'https',
+        hostname: 'pub-placeholder.r2.dev',
+      },
+    ],
+  },
```

- [x] **Step 2: Verify the config loads**

```bash
pnpm --filter @carat-room/user-portal exec node -e "import('./next.config.mjs').then(m => console.log(JSON.stringify(m.default.images)))"
```

Expected output: `{"remotePatterns":[{"protocol":"https","hostname":"pub-placeholder.r2.dev"}]}`

- [x] **Step 3: Commit**

```bash
git add apps/user-portal/next.config.mjs
git commit -m "fix(user-portal): migrate images.domains to remotePatterns for Next.js 16"
```

---

### Task 4: Migrate async `params` in Server Component pages

**Files:**
- Modify: `apps/user-portal/src/app/auctions/[auctionId]/page.tsx`
- Modify: `apps/user-portal/src/app/auctions/[auctionId]/lots/[lotId]/page.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks. Both pages are already `async function` Server Components, so the fix is the same `await params` pattern used throughout the admin-portal plan.

- [x] **Step 1: Edit `apps/user-portal/src/app/auctions/[auctionId]/page.tsx`**

`params.auctionId` is read twice here — once for the fetch URL, once as a prop to `<CatalogueLots>` — so both call sites need updating:

```diff
-export default async function SaleCataloguePage({ params }: { params: { auctionId: string } }) {
-  const auctionRes = await fetch(`${CATALOGUE_URL}/api/auctions/${params.auctionId}`, {
+export default async function SaleCataloguePage({ params }: { params: Promise<{ auctionId: string }> }) {
+  const { auctionId } = await params;
+  const auctionRes = await fetch(`${CATALOGUE_URL}/api/auctions/${auctionId}`, {
     next: { revalidate: 30 },
   });
```

And further down in the same file:

```diff
-      <CatalogueLots auctionId={params.auctionId} />
+      <CatalogueLots auctionId={auctionId} />
```

- [x] **Step 2: Edit `apps/user-portal/src/app/auctions/[auctionId]/lots/[lotId]/page.tsx`**

```diff
-export default async function LotDetailPage({ params }: { params: { auctionId: string; lotId: string } }) {
-  const res = await fetch(`${CATALOGUE_URL}/api/lots/${params.lotId}`, { cache: 'no-store' });
+export default async function LotDetailPage({ params }: { params: Promise<{ auctionId: string; lotId: string }> }) {
+  const { lotId } = await params;
+  const res = await fetch(`${CATALOGUE_URL}/api/lots/${lotId}`, { cache: 'no-store' });
```

- [x] **Step 3: Type-check**

```bash
pnpm --filter @carat-room/user-portal exec tsc --noEmit
```

Expected: no errors referencing either of these two files.

- [x] **Step 4: Commit**

```bash
git add apps/user-portal/src/app/auctions/\[auctionId\]/page.tsx \
        apps/user-portal/src/app/auctions/\[auctionId\]/lots/\[lotId\]/page.tsx
git commit -m "refactor(user-portal): await async params in catalogue and lot detail pages for Next.js 16"
```

---

### Task 5: Migrate async `params` in Client Component pages using React's `use()`

**Files:**
- Modify: `apps/user-portal/src/app/account/invoices/[id]/page.tsx`
- Modify: `apps/user-portal/src/app/account/fulfilments/[id]/page.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks.

Both files start with `'use client'`, so they cannot become `async function` components — `await` is not valid syntax for unwrapping `params` here. Next.js still passes `params` as a `Promise` to Client Component pages, and the supported way to read it synchronously inside a Client Component's render is React's `use()` hook, which suspends the component until the promise resolves.

- [x] **Step 1: Edit `apps/user-portal/src/app/account/invoices/[id]/page.tsx`**

Add the `use` import and unwrap `params` once at the top of the component, then replace every `params.id` reference:

```diff
 'use client';
-import { useState } from 'react';
+import { use, useState } from 'react';
 import Image from 'next/image';
 import useSWR from 'swr';
 import { Header } from '@/components/layout/header';
 import { AccountShell } from '@/components/layout/account-shell';
 import { Toast } from '@/components/primitives/toast';
 import { useAuth } from '@/lib/auth-context';
```

```diff
-export default function InvoicePage({ params }: { params: { id: string } }) {
+export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
+  const { id } = use(params);
   const { accessToken } = useAuth();
   const [isPaying, setIsPaying] = useState(false);
   const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

   const { data: invoice, mutate } = useSWR<Invoice>(
-    accessToken ? `/api/account/invoices/${params.id}` : null,
+    accessToken ? `/api/account/invoices/${id}` : null,
     (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
   );

   async function paySavedCard() {
     setIsPaying(true);
-    const res = await fetch(`/api/payments/invoices/${params.id}/pay-saved-card`, {
+    const res = await fetch(`/api/payments/invoices/${id}/pay-saved-card`, {
       method: 'POST',
       headers: { Authorization: `Bearer ${accessToken}` },
     });
```

- [x] **Step 2: Edit `apps/user-portal/src/app/account/fulfilments/[id]/page.tsx`**

Add the `use` import and unwrap `params` once at the top of the component, then replace both `params.id` references:

```diff
 'use client';
-import { useState } from 'react';
+import { use, useState } from 'react';
 import { useForm } from 'react-hook-form';
```

```diff
-export default function FulfilmentPage({ params }: { params: { id: string } }) {
+export default function FulfilmentPage({ params }: { params: Promise<{ id: string }> }) {
+  const { id } = use(params);
   const { accessToken } = useAuth();
   const [option, setOption] = useState<'ship' | 'collect'>('ship');
   const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

   const form = useForm<AddressForm>({ resolver: zodResolver(addressSchema) });
   const collectForm = useForm<CollectForm>({ resolver: zodResolver(collectSchema) });

   async function submitAddress(data: AddressForm) {
-    const res = await fetch(`/api/shipping/fulfilments/${params.id}/address`, {
+    const res = await fetch(`/api/shipping/fulfilments/${id}/address`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
       body: JSON.stringify(data),
     });
     if (res.ok) setToast({ message: "Address saved. We'll be in touch with tracking details.", type: 'success' });
     else setToast({ message: 'Failed to save address.', type: 'error' });
   }

   async function submitCollect(data: CollectForm) {
-    const res = await fetch(`/api/shipping/fulfilments/${params.id}/collection-slot`, {
+    const res = await fetch(`/api/shipping/fulfilments/${id}/collection-slot`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
       body: JSON.stringify(data),
     });
```

- [x] **Step 3: Type-check**

```bash
pnpm --filter @carat-room/user-portal exec tsc --noEmit
```

Expected: no errors referencing either of these two files.

- [x] **Step 4: Commit**

```bash
git add apps/user-portal/src/app/account/invoices/\[id\]/page.tsx \
        apps/user-portal/src/app/account/fulfilments/\[id\]/page.tsx
git commit -m "refactor(user-portal): unwrap async params with React use() in client detail pages for Next.js 16"
```

---

### Task 6: Migrate async `params` in the payments and account-invoice route handlers

**Files:**
- Modify: `apps/user-portal/src/app/api/payments/invoices/[id]/pay-saved-card/route.ts`
- Modify: `apps/user-portal/src/app/api/account/invoices/[id]/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks. Both are already `async function` route handlers, so this is the standard `await params` fix.

- [x] **Step 1: Edit `apps/user-portal/src/app/api/payments/invoices/[id]/pay-saved-card/route.ts`**

```diff
-export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
+export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
+  const { id } = await params;
   const auth = request.headers.get('authorization') ?? '';
-  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/invoices/${params.id}/pay-saved-card`, { method: 'POST', headers: { Authorization: auth } });
+  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/invoices/${id}/pay-saved-card`, { method: 'POST', headers: { Authorization: auth } });
   return NextResponse.json(await res.json(), { status: res.status });
 }
```

- [x] **Step 2: Edit `apps/user-portal/src/app/api/account/invoices/[id]/route.ts`**

```diff
-export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
+export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
+  const { id } = await params;
   const auth = request.headers.get('authorization') ?? '';
-  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/invoices/${params.id}`, {
+  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/invoices/${id}`, {
     headers: { Authorization: auth },
   });
   return NextResponse.json(await res.json(), { status: res.status });
 }
```

- [x] **Step 3: Type-check**

```bash
pnpm --filter @carat-room/user-portal exec tsc --noEmit
```

Expected: no errors referencing either of these two files.

- [x] **Step 4: Commit**

```bash
git add apps/user-portal/src/app/api/payments/invoices/\[id\]/pay-saved-card/route.ts \
        apps/user-portal/src/app/api/account/invoices/\[id\]/route.ts
git commit -m "refactor(user-portal): await async params in payment and invoice API routes for Next.js 16"
```

---

### Task 7: Migrate async `params` in the shipping and auction-stream route handlers

**Files:**
- Modify: `apps/user-portal/src/app/api/shipping/fulfilments/[id]/collection-slot/route.ts`
- Modify: `apps/user-portal/src/app/api/shipping/fulfilments/[id]/address/route.ts`
- Modify: `apps/user-portal/src/app/api/auctions/[lotId]/stream/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks. All three are already `async function` route handlers.

- [x] **Step 1: Edit `apps/user-portal/src/app/api/shipping/fulfilments/[id]/collection-slot/route.ts`**

```diff
-export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
+export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
+  const { id } = await params;
   const auth = request.headers.get('authorization') ?? '';
   const body = await request.json();
-  const res = await fetch(`${SHIPPING_SERVICE_URL}/api/shipping/fulfilments/${params.id}/collection-slot`, {
+  const res = await fetch(`${SHIPPING_SERVICE_URL}/api/shipping/fulfilments/${id}/collection-slot`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', Authorization: auth },
     body: JSON.stringify(body),
   });
   return NextResponse.json(await res.json(), { status: res.status });
 }
```

- [x] **Step 2: Edit `apps/user-portal/src/app/api/shipping/fulfilments/[id]/address/route.ts`**

```diff
-export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
+export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
+  const { id } = await params;
   const auth = request.headers.get('authorization') ?? '';
   const body = await request.json();
-  const res = await fetch(`${SHIPPING_SERVICE_URL}/api/shipping/fulfilments/${params.id}/address`, {
+  const res = await fetch(`${SHIPPING_SERVICE_URL}/api/shipping/fulfilments/${id}/address`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', Authorization: auth },
     body: JSON.stringify(body),
   });
   return NextResponse.json(await res.json(), { status: res.status });
 }
```

- [x] **Step 3: Edit `apps/user-portal/src/app/api/auctions/[lotId]/stream/route.ts`**

```diff
 export async function GET(
   request: NextRequest,
-  { params }: { params: { lotId: string } },
+  { params }: { params: Promise<{ lotId: string }> },
 ) {
-  const upstream = await fetch(`${AUCTION_SERVICE_URL}/api/auctions/${params.lotId}/stream`, {
+  const { lotId } = await params;
+  const upstream = await fetch(`${AUCTION_SERVICE_URL}/api/auctions/${lotId}/stream`, {
     headers: { Accept: 'text/event-stream' },
     signal: request.signal,
   });
```

- [x] **Step 4: Type-check**

```bash
pnpm --filter @carat-room/user-portal exec tsc --noEmit
```

Expected: no errors referencing any of these three files.

- [x] **Step 5: Commit**

```bash
git add apps/user-portal/src/app/api/shipping/fulfilments/\[id\]/collection-slot/route.ts \
        apps/user-portal/src/app/api/shipping/fulfilments/\[id\]/address/route.ts \
        apps/user-portal/src/app/api/auctions/\[lotId\]/stream/route.ts
git commit -m "refactor(user-portal): await async params in shipping and auction stream API routes for Next.js 16"
```

---

### Task 8: Migrate async `cookies()` in the refresh-token route

**Files:**
- Modify: `apps/user-portal/src/app/api/auth/refresh/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks. `GET` and `DELETE` are already `async function`s, so this is the standard `await cookies()` fix.

- [x] **Step 1: Edit `apps/user-portal/src/app/api/auth/refresh/route.ts`**

```diff
 export async function GET() {
-  const cookieStore = cookies();
+  const cookieStore = await cookies();
   const refreshToken = cookieStore.get('refresh_token')?.value;
   if (!refreshToken) return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
```

```diff
 export async function DELETE() {
-  const cookieStore = cookies();
+  const cookieStore = await cookies();
   const refreshToken = cookieStore.get('refresh_token')?.value;
```

- [x] **Step 2: Type-check**

```bash
pnpm --filter @carat-room/user-portal exec tsc --noEmit
```

Expected: no errors referencing `api/auth/refresh/route.ts`.

- [x] **Step 3: Commit**

```bash
git add apps/user-portal/src/app/api/auth/refresh/route.ts
git commit -m "refactor(user-portal): await async cookies in refresh route for Next.js 16"
```

---

### Task 9: Verify CI Node.js version is already ≥20.9

**Files:**
- Modify (only if needed): `.github/workflows/ci.yml`
- Modify (only if needed): `.github/workflows/integration-tests.yml`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks.

The admin-portal upgrade plan already bumped these monorepo-wide workflow files to `node-version: '20.9'`. Since this branch is created off `main` after that plan's PR merges, the change should already be present. This task exists only as a safety check in case the merge order slipped.

- [x] **Step 1: Check the current CI Node.js version**

```bash
grep -A1 "setup-node@v4" .github/workflows/ci.yml .github/workflows/integration-tests.yml
```

Expected: both files show `node-version: '20.9'`.

- [x] **Step 2: If either file still shows `node-version: 20` (unbumped), fix it** — not needed, both already `'20.9'`

```diff
       - uses: actions/setup-node@v4
         with:
-          node-version: 20
+          node-version: '20.9'
           cache: pnpm
```

Apply this to whichever of `.github/workflows/ci.yml` / `.github/workflows/integration-tests.yml` still needs it.

- [x] **Step 3: Commit only if Step 2 made a change** — skipped, no change was needed

```bash
git add .github/workflows/ci.yml .github/workflows/integration-tests.yml
git commit -m "ci: bump Node.js to 20.9 minimum for Next.js 16 compatibility"
```

If Step 1 already showed `'20.9'` in both files, skip this commit — there is nothing to change.

---

### Task 10: Full verification and manual smoke test

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: the fully migrated `apps/user-portal` from Tasks 1–9.
- Produces: a verified branch ready to open as a PR into `main`.

- [x] **Step 1: Run the full user-portal test suite**

```bash
pnpm --filter @carat-room/user-portal test
```

Expected: PASS, all existing test files (e.g. `catalogue-lots.test.tsx`) untouched by this plan continue to pass.

- [x] **Step 2: Build with Turbopack (the new v16 default)**

```bash
pnpm --filter @carat-room/user-portal build
```

Expected: build succeeds. Since `apps/user-portal/next.config.mjs` has no custom `webpack()` block, Turbopack should build without the "webpack config found" failure documented in the Next.js 16 upgrade guide.

- [x] **Step 3: Type-check the whole app one more time**

```bash
pnpm --filter @carat-room/user-portal exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Start the app locally and manually smoke-test the affected flows**

```bash
pnpm --filter @carat-room/user-portal dev
```

With the app running on `http://localhost:3000`:
1. Visit `http://localhost:3000/account/dashboard` while logged out — expect a redirect to `/account/login?returnUrl=%2Faccount%2Fdashboard` (exercises `proxy.ts`).
2. Log in, then revisit `/account/dashboard`, `/account/bids`, `/account/watchlist`, `/account/won` — expect each to load without redirecting (exercises `proxy.ts`'s refresh-token check and, on first load, `api/auth/refresh/route.ts`'s now-awaited `cookies()`).
3. Visit a sale catalogue page (e.g. `/auctions/<auctionId>`) — expect the auction title, date, and lot grid to render (exercises the awaited `params.auctionId` in Task 4, read twice).
4. Open a lot detail page from that catalogue (e.g. `/auctions/<auctionId>/lots/<lotId>`) — expect the lot to render (exercises the awaited `params.lotId` in Task 4).
5. Visit `/account/invoices/<id>` for an existing invoice — expect the invoice, its thumbnail image (served via the `remotePatterns` fix in Task 3), and the price breakdown to render, then click "Pay with saved card" — expect a request to `/api/payments/invoices/<id>/pay-saved-card` to fire with the correct ID (exercises the `use(params)` unwrap in Task 5 and the awaited route params in Task 6).
6. Visit `/account/fulfilments/<id>` for an existing fulfilment — expect the page to render, then submit both the "Ship to me" address form and the "Collect in person" form (on two separate fulfilments, or by re-visiting) — expect both `POST` requests to fire with the correct ID (exercises the `use(params)` unwrap in Task 5 and the awaited route params in Task 7).
7. Open a live lot page and confirm the bid stream still updates in real time (exercises the awaited `params.lotId` in the SSE route from Task 7).
8. Log out — expect the refresh-token cookie to clear and a subsequent visit to `/account/dashboard` to redirect to login again (exercises `DELETE` in `api/auth/refresh/route.ts`).

- [ ] **Step 5: Push the branch and open a draft PR for review**

```bash
git push -u origin upgrade/user-portal-nextjs-16
gh pr create --draft --title "Upgrade user-portal to Next.js 16 / React 19" --body "$(cat <<'EOF'
## Summary
- Bumps user-portal to Next.js 16.2.x and React 19.2
- Renames middleware.ts to proxy.ts per the v16 convention change
- Migrates all synchronous params/cookies() usages to the required async form, including two Client Component pages that needed React's use() hook instead of await
- Migrates images.domains to images.remotePatterns in next.config.mjs

## Test plan
- [x] `pnpm --filter @carat-room/user-portal test` passes
- [x] `pnpm --filter @carat-room/user-portal build` passes with Turbopack
- [x] Manually verified auth redirect, catalogue/lot pages, invoice payment, fulfilment forms, live bid stream, and logout locally

Ref: docs/superpowers/specs/2026-07-07-nextjs-16-upgrade-design.md
Ref: docs/superpowers/plans/2026-07-07-user-portal-nextjs-16-upgrade.md
EOF
)"
```

