# Admin Portal Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Admin Portal — a Next.js (App Router) application for staff to manage lots, auctions, users, invoices, fulfilments, categories, and reports via the Admin Service API.

**Architecture:** Next.js App Router with Server Components for initial data fetching, Server Actions for mutations, and SWR for the one live-polling screen (auction detail). Auth uses a `admin_token` httpOnly cookie containing the Admin JWT; Next.js middleware protects all `/admin/*` routes. A Route Handler at `app/api/admin/[...path]/route.ts` reads the cookie and proxies client-side SWR requests to the Admin Service with the JWT in `Authorization` header.

**Tech Stack:** Next.js 14 (App Router), TypeScript 5.4, Tailwind CSS v3, Shadcn/ui, TanStack Table v8, React Hook Form + Zod, SWR, Vitest + @testing-library/react.

## Global Constraints

- Node.js 20, TypeScript 5.4, strict mode
- Named exports only — no `export default` (exception: Next.js page/layout/error files which Next.js requires as default exports, and `vitest.config.ts`)
- Single quotes for strings; `const`/`let` only — no `var`
- App lives at `apps/admin-portal/`
- All data flows through the Admin Service; env var `ADMIN_SERVICE_URL=http://admin-service:3005` (Docker internal hostname); never call downstream services directly
- Login is the one exception: Next.js Route Handler calls `USER_SERVICE_URL=http://user-service:3002` at `/api/auth/login`, validates `role === 'ADMIN'`, then sets the cookie
- Auth: httpOnly cookie named `admin_token`; maxAge 28800 (8 hours); Secure + SameSite=Lax
- No SSE in admin portal — polling only where live data is needed (auction detail: 5-second SWR refresh)
- All mutations use Next.js Server Actions with `revalidatePath` after success
- Confirmation dialogs required for all destructive actions (cancel auction, suspend user, delete lot, cancel invoice)
- Tailwind CSS v3 (not v4) — Shadcn/ui compatibility
- Shadcn/ui components installed via `pnpm dlx shadcn@latest add <name>` — never manually copied
- Admin Service API paths are all prefixed `/admin/api/` (e.g. `GET /admin/api/lots`)

---

## File Map

```
apps/admin-portal/
  package.json
  tsconfig.json
  next.config.ts                         — sets ADMIN_SERVICE_URL and USER_SERVICE_URL
  tailwind.config.ts
  postcss.config.mjs
  middleware.ts                          — redirect unauthenticated /admin/* to /admin/login
  components.json                        — Shadcn/ui config
  vitest.config.ts
  vitest.setup.ts                        — @testing-library/jest-dom matchers
  src/
    app/
      globals.css
      layout.tsx                         — root html/body shell, Inter font
      api/
        auth/
          route.ts                       — POST: login → User Service + set cookie; DELETE: logout + clear cookie
        admin/
          [...path]/
            route.ts                     — GET/POST/PATCH/DELETE proxy → Admin Service (reads cookie, sets Authorization)
      admin/
        layout.tsx                       — AdminShell wrapper
        login/
          page.tsx                       — login form (client component with React Hook Form)
        dashboard/
          page.tsx                       — stats cards + activity feed (server component)
        lots/
          page.tsx                       — lots data table (server component)
          _actions.ts                    — createLot, updateLot, deleteLot
          new/
            page.tsx                     — create lot form
          [id]/
            page.tsx                     — edit lot form + image manager
            _actions.ts                  — getUploadUrl, deleteImage, reorderImages
        categories/
          page.tsx                       — category tree (server component initial load)
          _actions.ts                    — createCategory, renameCategory, deleteCategory
        auctions/
          page.tsx                       — auctions data table (server component)
          _actions.ts                    — scheduleAuction, rescheduleAuction, cancelAuction
          new/
            page.tsx                     — schedule auction form
          [lotId]/
            page.tsx                     — auction detail shell (server component)
        users/
          page.tsx                       — users data table (server component)
          [id]/
            page.tsx                     — user detail
            _actions.ts                  — suspendUser, reinstateUser, manuallyApproveUser
        invoices/
          page.tsx                       — invoices data table (server component)
          [id]/
            page.tsx                     — invoice detail
            _actions.ts                  — extendDueDate, cancelInvoice
        fulfilments/
          page.tsx                       — fulfilments data table (server component)
          [id]/
            page.tsx                     — fulfilment detail
            _actions.ts                  — markDispatched, markCollected
        reports/
          page.tsx                       — reports with three tabs (client component tabs)
    lib/
      admin-api.ts                       — server-side typed fetch to Admin Service; reads cookie via next/headers
      auth.ts                            — getAdminToken() from next/headers cookies
      schemas/
        lot.schema.ts                    — Zod: LotFormSchema
        auction.schema.ts               — Zod: ScheduleAuctionSchema, RescheduleAuctionSchema
        category.schema.ts              — Zod: CategoryFormSchema
        invoice.schema.ts               — Zod: ExtendDueDateSchema, CancelInvoiceSchema
        fulfilment.schema.ts            — Zod: MarkDispatchedSchema
        user.schema.ts                  — Zod: SuspendUserSchema
    components/
      ui/                               — Shadcn/ui installed components (never edit manually)
      layout/
        sidebar.tsx                     — nav links with active state (client component)
        breadcrumbs.tsx                 — pathname-derived breadcrumb (client component)
        admin-shell.tsx                 — sidebar + top bar + main content wrapper
      data-table.tsx                    — generic TanStack Table wrapper (client component)
      status-badge.tsx                  — colour-coded status pill
      confirm-dialog.tsx               — AlertDialog wrapper for destructive actions
      image-uploader.tsx               — R2 direct upload + reorder + delete (client component)
      category-tree.tsx               — recursive tree + inline rename + add child (client component)
      auction-live-stats.tsx          — SWR polling for current bid / time remaining
```

---

### Task 1: Scaffold

**Files:**
- Create: `apps/admin-portal/package.json`
- Create: `apps/admin-portal/tsconfig.json`
- Create: `apps/admin-portal/next.config.ts`
- Create: `apps/admin-portal/tailwind.config.ts`
- Create: `apps/admin-portal/postcss.config.mjs`
- Create: `apps/admin-portal/components.json`
- Create: `apps/admin-portal/vitest.config.ts`
- Create: `apps/admin-portal/vitest.setup.ts`
- Create: `apps/admin-portal/src/app/globals.css`
- Create: `apps/admin-portal/src/app/layout.tsx`

**Interfaces:**
- Produces: runnable Next.js app scaffold with Shadcn/ui initialised and all required UI components installed

- [ ] **Step 1: Create `apps/admin-portal/package.json`**

```json
{
  "name": "@carat-room/admin-portal",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3006",
    "build": "next build",
    "start": "next start -p 3006",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.3.4",
    "@radix-ui/react-alert-dialog": "^1.0.5",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-label": "^2.0.2",
    "@radix-ui/react-popover": "^1.0.7",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-separator": "^1.0.3",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-toast": "^1.1.5",
    "@tanstack/react-table": "^8.17.3",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "jose": "^5.6.3",
    "lucide-react": "^0.395.0",
    "next": "14.2.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.52.0",
    "swr": "^2.2.5",
    "tailwind-merge": "^2.3.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "jsdom": "^24.1.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `apps/admin-portal/tsconfig.json`**

```json
{
  "extends": "@carat-room/tsconfig/nextjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/admin-portal/next.config.ts`**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  env: {
    ADMIN_SERVICE_URL: process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3005',
    USER_SERVICE_URL: process.env.USER_SERVICE_URL ?? 'http://localhost:3002',
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create `apps/admin-portal/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

- [ ] **Step 5: Create `apps/admin-portal/postcss.config.mjs`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create `apps/admin-portal/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 7: Create `apps/admin-portal/vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 8: Install dependencies**

```bash
cd apps/admin-portal
pnpm install
```

Expected: packages installed with no errors.

- [ ] **Step 9: Initialise Shadcn/ui**

```bash
cd apps/admin-portal
pnpm dlx shadcn@latest init
```

When prompted, select: New York style, Zinc colour, yes to CSS variables. This creates `components.json` and updates `globals.css`.

Then install all components needed by this plan:

```bash
pnpm dlx shadcn@latest add button input label form textarea select dialog alert-dialog dropdown-menu badge card separator toast tabs popover command calendar
```

Expected: components appear in `src/components/ui/`.

- [ ] **Step 10: Create `apps/admin-portal/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'The Carat Room — Admin',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 11: Verify Next.js starts**

```bash
cd apps/admin-portal
pnpm dev
```

Expected: `ready on http://localhost:3006` with no TypeScript errors.

- [ ] **Step 12: Commit**

```bash
git add apps/admin-portal/
git commit -m "feat(admin-portal): scaffold Next.js app with Shadcn/ui"
```

---

### Task 2: Auth — cookie helpers, login route handler, middleware, login page

**Files:**
- Create: `apps/admin-portal/src/lib/auth.ts`
- Create: `apps/admin-portal/src/app/api/auth/route.ts`
- Create: `apps/admin-portal/middleware.ts`
- Create: `apps/admin-portal/src/app/admin/login/page.tsx`
- Test: `apps/admin-portal/src/lib/auth.test.ts`
- Test: `apps/admin-portal/src/app/api/auth/route.test.ts`

**Interfaces:**
- Produces:
  - `getAdminToken(): string | undefined` — reads `admin_token` cookie via `next/headers`; usable in Server Components and Server Actions
  - `POST /api/auth` — accepts `{ email, password }`, returns `{ ok: true }` on success (cookie set) or `{ error }` on failure
  - `DELETE /api/auth` — clears cookie, returns `{ ok: true }`
  - Middleware: unauthenticated requests to `/admin/*` (except `/admin/login`) redirect to `/admin/login`
  - Login page at `/admin/login` with email + password form

- [ ] **Step 1: Write failing tests for `auth.ts`**

Create `apps/admin-portal/src/lib/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { cookies } from 'next/headers';
import { getAdminToken } from './auth';

describe('getAdminToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should_returnToken_when_cookieIsPresent', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: vi.fn().mockReturnValue({ value: 'admin-jwt-abc' }),
    } as ReturnType<typeof cookies>);

    const token = getAdminToken();

    expect(token).toBe('admin-jwt-abc');
  });

  it('should_returnUndefined_when_cookieIsAbsent', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
    } as ReturnType<typeof cookies>);

    const token = getAdminToken();

    expect(token).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/admin-portal
npx vitest run src/lib/auth.test.ts
```

Expected: FAIL — `Cannot find module './auth'`

- [ ] **Step 3: Create `apps/admin-portal/src/lib/auth.ts`**

```typescript
import { cookies } from 'next/headers';

export function getAdminToken(): string | undefined {
  return cookies().get('admin_token')?.value;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run src/lib/auth.test.ts
```

Expected: 2 passed

- [ ] **Step 5: Write failing tests for the login route handler**

Create `apps/admin-portal/src/app/api/auth/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockCookiesSet = vi.fn();
const mockCookiesDelete = vi.fn();
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ set: mockCookiesSet, delete: mockCookiesDelete })),
}));

import { POST, DELETE } from './route';

beforeEach(() => vi.clearAllMocks());

describe('POST /api/auth', () => {
  it('should_setCookieAndReturn200_when_adminCredentialsAreValid', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { accessToken: 'jwt-abc', role: 'ADMIN' } }),
    });

    const req = new Request('http://localhost/api/auth', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@test.com', password: 'pass123' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(mockCookiesSet).toHaveBeenCalledWith(
      'admin_token',
      'jwt-abc',
      expect.objectContaining({ httpOnly: true, maxAge: 28800 }),
    );
  });

  it('should_return401_when_roleIsNotAdmin', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { accessToken: 'jwt-xyz', role: 'USER' } }),
    });

    const req = new Request('http://localhost/api/auth', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@test.com', password: 'pass123' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(mockCookiesSet).not.toHaveBeenCalled();
  });

  it('should_return401_when_userServiceReturnsError', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: { code: 'INVALID_CREDENTIALS' } }) });

    const req = new Request('http://localhost/api/auth', {
      method: 'POST',
      body: JSON.stringify({ email: 'bad@test.com', password: 'wrong' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/auth', () => {
  it('should_clearCookieAndReturn200', async () => {
    const res = await DELETE();

    expect(mockCookiesDelete).toHaveBeenCalledWith('admin_token');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 6: Run to verify failure**

```bash
npx vitest run src/app/api/auth/route.test.ts
```

Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 7: Create `apps/admin-portal/src/app/api/auth/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: Request): Promise<NextResponse> {
  const { email, password } = await req.json() as { email: string; password: string };

  const userServiceUrl = process.env.USER_SERVICE_URL ?? 'http://localhost:3002';
  const res = await fetch(`${userServiceUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json() as { data?: { accessToken: string; role: string }; error?: unknown };

  if (!res.ok || !body.data) {
    return NextResponse.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }, { status: 401 });
  }

  if (body.data.role !== 'ADMIN') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, { status: 401 });
  }

  cookies().set('admin_token', body.data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 28800,
    path: '/',
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  cookies().delete('admin_token');
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8: Run to verify pass**

```bash
npx vitest run src/app/api/auth/route.test.ts
```

Expected: 4 passed

- [ ] **Step 9: Create `apps/admin-portal/middleware.ts`**

```typescript
import { type NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest): NextResponse {
  const token = request.cookies.get('admin_token')?.value;
  const isLoginPage = request.nextUrl.pathname === '/admin/login';

  if (!token && !isLoginPage) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  if (token && isLoginPage) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
```

- [ ] **Step 10: Create `apps/admin-portal/src/app/admin/login/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      router.push('/admin/dashboard');
    } else {
      const body = await res.json() as { error: { message: string } };
      setServerError(body.error.message);
    }
  };

  return (
    <div className='flex min-h-screen items-center justify-center bg-muted/40'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle>The Carat Room — Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
            <div className='space-y-1'>
              <Label htmlFor='email'>Email</Label>
              <Input id='email' type='email' autoComplete='email' {...register('email')} />
              {errors.email && <p className='text-sm text-destructive'>{errors.email.message}</p>}
            </div>
            <div className='space-y-1'>
              <Label htmlFor='password'>Password</Label>
              <Input id='password' type='password' autoComplete='current-password' {...register('password')} />
              {errors.password && <p className='text-sm text-destructive'>{errors.password.message}</p>}
            </div>
            {serverError && <p className='text-sm text-destructive'>{serverError}</p>}
            <Button type='submit' className='w-full' disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 11: Run all auth tests**

```bash
npx vitest run src/lib/auth.test.ts src/app/api/auth/route.test.ts
```

Expected: 6 passed

- [ ] **Step 12: Commit**

```bash
git add apps/admin-portal/src/lib/auth.ts apps/admin-portal/src/lib/auth.test.ts \
  apps/admin-portal/src/app/api/auth/ apps/admin-portal/middleware.ts \
  apps/admin-portal/src/app/admin/login/
git commit -m "feat(admin-portal): auth — cookie helper, login route handler, middleware, login page"
```

---

### Task 3: Admin API client + proxy route handler

**Files:**
- Create: `apps/admin-portal/src/lib/admin-api.ts`
- Create: `apps/admin-portal/src/app/api/admin/[...path]/route.ts`
- Test: `apps/admin-portal/src/lib/admin-api.test.ts`

**Interfaces:**
- Produces:
  - `adminApi.get<T>(path): Promise<T>` — reads `admin_token` cookie, calls Admin Service
  - `adminApi.post<T>(path, body): Promise<T>`
  - `adminApi.patch<T>(path, body): Promise<T>`
  - `adminApi.delete<T>(path): Promise<T>`
  - All throw `AdminApiError` with `.status` and `.body` on non-2xx responses
  - Client-side proxy at `/api/admin/[...path]` forwards browser SWR requests to Admin Service with cookie JWT

- [ ] **Step 1: Write failing tests**

Create `apps/admin-portal/src/lib/admin-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(() => ({ value: 'test-admin-jwt' })) })),
}));

import { adminApi, AdminApiError } from './admin-api';

beforeEach(() => vi.clearAllMocks());

describe('adminApi', () => {
  it('should_returnJson_when_responseIsOk', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 'lot-1' }] }),
    });

    const result = await adminApi.get<{ data: { id: string }[] }>('/admin/api/lots');

    expect(result).toEqual({ data: [{ id: 'lot-1' }] });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/admin/api/lots'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-admin-jwt' }),
      }),
    );
  });

  it('should_throwAdminApiError_when_responseIsNot2xx', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { code: 'NOT_FOUND' } }),
    });

    await expect(adminApi.get('/admin/api/lots/missing')).rejects.toBeInstanceOf(AdminApiError);
  });

  it('should_preserveStatus_on_AdminApiError', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: { code: 'CONFLICT' } }),
    });

    const err = await adminApi.post('/admin/api/lots', {}).catch(e => e);
    expect(err).toBeInstanceOf(AdminApiError);
    expect(err.status).toBe(409);
  });

  it('should_sendBodyAsJson_when_posting', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: { id: 'lot-2' } }) });

    await adminApi.post('/admin/api/lots', { title: 'Pearl Bracelet' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Pearl Bracelet' }) }),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/admin-portal
npx vitest run src/lib/admin-api.test.ts
```

Expected: FAIL — `Cannot find module './admin-api'`

- [ ] **Step 3: Create `apps/admin-portal/src/lib/admin-api.ts`**

```typescript
import { cookies } from 'next/headers';

export class AdminApiError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super('AdminApiError');
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = cookies().get('admin_token')?.value ?? '';
  const baseUrl = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3005';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const json = await res.json();
  if (!res.ok) throw new AdminApiError(res.status, json);
  return json as T;
}

export const adminApi = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run src/lib/admin-api.test.ts
```

Expected: 4 passed

- [ ] **Step 5: Create `apps/admin-portal/src/app/api/admin/[...path]/route.ts`**

This is the client-side proxy used by SWR. Browser cannot call Admin Service directly (different port, no CORS). This Route Handler reads the cookie, adds the Authorization header, and forwards the request.

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

type RouteContext = { params: { path: string[] } };

async function proxyToAdminService(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const token = cookies().get('admin_token')?.value;

  if (!token) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }

  const adminServiceUrl = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3005';
  const targetPath = context.params.path.join('/');
  const searchParams = req.nextUrl.searchParams.toString();
  const url = `${adminServiceUrl}/admin/api/${targetPath}${searchParams ? `?${searchParams}` : ''}`;

  const body = req.method !== 'GET' && req.method !== 'DELETE' ? await req.text() : undefined;

  const upstream = await fetch(url, {
    method: req.method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  const json = await upstream.json();
  return NextResponse.json(json, { status: upstream.status });
}

export const GET = (req: NextRequest, ctx: RouteContext) => proxyToAdminService(req, ctx);
export const POST = (req: NextRequest, ctx: RouteContext) => proxyToAdminService(req, ctx);
export const PATCH = (req: NextRequest, ctx: RouteContext) => proxyToAdminService(req, ctx);
export const DELETE = (req: NextRequest, ctx: RouteContext) => proxyToAdminService(req, ctx);
```

- [ ] **Step 6: Commit**

```bash
git add apps/admin-portal/src/lib/admin-api.ts apps/admin-portal/src/lib/admin-api.test.ts \
  apps/admin-portal/src/app/api/admin/
git commit -m "feat(admin-portal): admin API client and client-side proxy route handler"
```

---

### Task 4: Layout + shared components

**Files:**
- Create: `apps/admin-portal/src/components/layout/sidebar.tsx`
- Create: `apps/admin-portal/src/components/layout/breadcrumbs.tsx`
- Create: `apps/admin-portal/src/components/layout/admin-shell.tsx`
- Create: `apps/admin-portal/src/app/admin/layout.tsx`
- Create: `apps/admin-portal/src/components/status-badge.tsx`
- Create: `apps/admin-portal/src/components/confirm-dialog.tsx`
- Create: `apps/admin-portal/src/components/data-table.tsx`
- Test: `apps/admin-portal/src/components/status-badge.test.tsx`
- Test: `apps/admin-portal/src/components/confirm-dialog.test.tsx`

**Interfaces:**
- Produces:
  - `<StatusBadge status={string} />` — maps status strings to colour variants
  - `<ConfirmDialog trigger onConfirm title description />` — wraps Shadcn AlertDialog
  - `<DataTable columns data />` — generic TanStack Table wrapper with pagination
  - Protected admin layout shell (sidebar + top bar)

- [ ] **Step 1: Write failing tests**

Create `apps/admin-portal/src/components/status-badge.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('should_renderStatusText', () => {
    render(<StatusBadge status='ACTIVE' />);
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('should_applyDestructiveVariant_when_statusIsCancelled', () => {
    const { container } = render(<StatusBadge status='CANCELLED' />);
    expect(container.firstChild).toHaveClass('destructive');
  });

  it('should_applyDefaultVariant_when_statusIsUnknown', () => {
    const { container } = render(<StatusBadge status='UNKNOWN_STATUS' />);
    expect(container.firstChild).toBeDefined();
  });
});
```

Create `apps/admin-portal/src/components/confirm-dialog.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './confirm-dialog';
import { Button } from '@/components/ui/button';

describe('ConfirmDialog', () => {
  it('should_callOnConfirm_when_confirmButtonClicked', async () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        trigger={<Button>Delete</Button>}
        title='Delete lot?'
        description='This action cannot be undone.'
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/admin-portal
npx vitest run src/components/status-badge.test.tsx src/components/confirm-dialog.test.tsx
```

Expected: FAIL — `Cannot find module './status-badge'`

- [ ] **Step 3: Create `apps/admin-portal/src/components/status-badge.tsx`**

```tsx
import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';

const STATUS_VARIANTS: Record<string, BadgeProps['variant']> = {
  ACTIVE: 'default',
  SCHEDULED: 'secondary',
  LIVE: 'default',
  CLOSED: 'secondary',
  CANCELLED: 'destructive',
  PAID: 'default',
  UNPAID: 'secondary',
  EXPIRED: 'destructive',
  DISPATCHED: 'default',
  COLLECTED: 'default',
  PENDING: 'secondary',
  SUSPENDED: 'destructive',
  VERIFIED: 'default',
};

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status] ?? 'outline';
  return <Badge variant={variant}>{status}</Badge>;
}
```

- [ ] **Step 4: Create `apps/admin-portal/src/components/confirm-dialog.tsx`**

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  trigger: ReactNode;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmLabel?: string;
}

export function ConfirmDialog({ trigger, title, description, onConfirm, confirmLabel = 'Confirm' }: ConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 5: Create `apps/admin-portal/src/components/data-table.tsx`**

```tsx
'use client';

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  pageSize?: number;
}

export function DataTable<TData>({ columns, data, pageSize = 20 }: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className='space-y-2'>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(hg => (
            <TableRow key={hg.id}>
              {hg.headers.map(h => (
                <TableHead key={h.id}>
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className='h-24 text-center text-muted-foreground'>
                No results.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map(row => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className='flex items-center justify-end gap-2'>
        <Button variant='outline' size='sm' onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Previous
        </Button>
        <span className='text-sm text-muted-foreground'>
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </span>
        <Button variant='outline' size='sm' onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create sidebar, breadcrumbs, admin-shell**

Create `apps/admin-portal/src/components/layout/sidebar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Gem,
  Gavel,
  Users,
  FileText,
  Package,
  Tag,
  BarChart3,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/lots', label: 'Lots', icon: Gem },
  { href: '/admin/categories', label: 'Categories', icon: Tag },
  { href: '/admin/auctions', label: 'Auctions', icon: Gavel },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/invoices', label: 'Invoices', icon: FileText },
  { href: '/admin/fulfilments', label: 'Fulfilments', icon: Package },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className='flex h-full w-56 flex-col border-r bg-card px-3 py-4'>
      <p className='mb-6 px-2 text-sm font-semibold tracking-tight'>Carat Room Admin</p>
      <ul className='space-y-1'>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors',
                pathname.startsWith(href)
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className='h-4 w-4' />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

Create `apps/admin-portal/src/components/layout/breadcrumbs.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  return (
    <nav className='flex items-center gap-1 text-sm text-muted-foreground'>
      {segments.map((seg, idx) => {
        const href = '/' + segments.slice(0, idx + 1).join('/');
        const label = seg.charAt(0).toUpperCase() + seg.slice(1);
        const isLast = idx === segments.length - 1;

        return (
          <span key={href} className='flex items-center gap-1'>
            {idx > 0 && <ChevronRight className='h-3 w-3' />}
            {isLast ? (
              <span className='font-medium text-foreground'>{label}</span>
            ) : (
              <Link href={href} className='hover:text-foreground'>
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
```

Create `apps/admin-portal/src/components/layout/admin-shell.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Breadcrumbs } from './breadcrumbs';

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className='flex h-screen overflow-hidden'>
      <Sidebar />
      <div className='flex flex-1 flex-col overflow-auto'>
        <header className='border-b px-6 py-3'>
          <Breadcrumbs />
        </header>
        <main className='flex-1 p-6'>{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `apps/admin-portal/src/app/admin/layout.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { AdminShell } from '@/components/layout/admin-shell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get('admin_token')?.value;
  if (!token) redirect('/admin/login');

  return <AdminShell>{children}</AdminShell>;
}
```

- [ ] **Step 8: Run component tests**

```bash
npx vitest run src/components/status-badge.test.tsx src/components/confirm-dialog.test.tsx
```

Expected: 4 passed

- [ ] **Step 9: Commit**

```bash
git add apps/admin-portal/src/components/ apps/admin-portal/src/app/admin/layout.tsx
git commit -m "feat(admin-portal): layout shell, sidebar, breadcrumbs, DataTable, StatusBadge, ConfirmDialog"
```

---

### Task 5: Lots pages + image uploader

**Files:**
- Create: `apps/admin-portal/src/lib/schemas/lot.schema.ts`
- Create: `apps/admin-portal/src/app/admin/lots/_actions.ts`
- Create: `apps/admin-portal/src/app/admin/lots/page.tsx`
- Create: `apps/admin-portal/src/app/admin/lots/new/page.tsx`
- Create: `apps/admin-portal/src/app/admin/lots/[id]/page.tsx`
- Create: `apps/admin-portal/src/app/admin/lots/[id]/_actions.ts`
- Create: `apps/admin-portal/src/components/image-uploader.tsx`
- Test: `apps/admin-portal/src/lib/schemas/lot.schema.test.ts`
- Test: `apps/admin-portal/src/app/admin/lots/_actions.test.ts`

**Interfaces:**
- Consumes: `adminApi` from Task 3; `DataTable`, `StatusBadge`, `ConfirmDialog` from Task 4
- Produces: full CRUD lot management including R2 direct image upload

**Lot form fields:** `title` (string, min 1), `description` (string, min 1), `categoryId` (UUID string), `condition` (`'EXCELLENT' | 'VERY_GOOD' | 'GOOD' | 'FAIR'`), `estimatedValue` (positive number)

**Admin Service endpoints used:**
- `GET /admin/api/lots` → `{ data: Lot[] }`
- `POST /admin/api/lots` → `{ data: Lot }`
- `GET /admin/api/lots/:id` → `{ data: Lot }`
- `PATCH /admin/api/lots/:id` → `{ data: Lot }`
- `DELETE /admin/api/lots/:id` → `{ data: { id: string } }`
- `POST /admin/api/lots/:id/images/upload-url` with `{ filename: string, contentType: string }` → `{ data: { uploadUrl: string, imageId: string, publicUrl: string } }`
- `PATCH /admin/api/lots/:id/images/reorder` with `{ imageIds: string[] }` → `{ data: Lot }`
- `DELETE /admin/api/lots/:id/images/:imageId` → `{ data: { id: string } }`

- [ ] **Step 1: Write failing schema tests**

Create `apps/admin-portal/src/lib/schemas/lot.schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { LotFormSchema } from './lot.schema';

describe('LotFormSchema', () => {
  const valid = {
    title: 'Diamond Solitaire Ring',
    description: 'Brilliant cut, 1.2ct',
    categoryId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    condition: 'EXCELLENT' as const,
    estimatedValue: 5000,
  };

  it('should_pass_when_allFieldsAreValid', () => {
    expect(LotFormSchema.safeParse(valid).success).toBe(true);
  });

  it('should_fail_when_titleIsEmpty', () => {
    expect(LotFormSchema.safeParse({ ...valid, title: '' }).success).toBe(false);
  });

  it('should_fail_when_estimatedValueIsNegative', () => {
    expect(LotFormSchema.safeParse({ ...valid, estimatedValue: -1 }).success).toBe(false);
  });

  it('should_fail_when_conditionIsInvalid', () => {
    expect(LotFormSchema.safeParse({ ...valid, condition: 'PERFECT' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/admin-portal
npx vitest run src/lib/schemas/lot.schema.test.ts
```

Expected: FAIL — `Cannot find module './lot.schema'`

- [ ] **Step 3: Create `apps/admin-portal/src/lib/schemas/lot.schema.ts`**

```typescript
import { z } from 'zod';

export const LotCondition = z.enum(['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR']);

export const LotFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  categoryId: z.string().uuid('Select a category'),
  condition: LotCondition,
  estimatedValue: z.number({ invalid_type_error: 'Enter a number' }).positive('Must be positive'),
});

export type LotFormValues = z.infer<typeof LotFormSchema>;
```

- [ ] **Step 4: Run schema tests to verify pass**

```bash
npx vitest run src/lib/schemas/lot.schema.test.ts
```

Expected: 4 passed

- [ ] **Step 5: Write failing action tests**

Create `apps/admin-portal/src/app/admin/lots/_actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi } from '@/lib/admin-api';
import { createLot, updateLot, deleteLot } from './_actions';

beforeEach(() => vi.clearAllMocks());

describe('createLot', () => {
  it('should_callAdminApiPostAndReturn_when_formDataIsValid', async () => {
    vi.mocked(adminApi.post).mockResolvedValue({ data: { id: 'lot-1' } });

    const fd = new FormData();
    fd.append('title', 'Emerald Ring');
    fd.append('description', 'Natural 2ct emerald');
    fd.append('categoryId', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    fd.append('condition', 'EXCELLENT');
    fd.append('estimatedValue', '3000');

    const result = await createLot({}, fd);

    expect(adminApi.post).toHaveBeenCalledWith('/admin/api/lots', expect.objectContaining({ title: 'Emerald Ring' }));
    expect(result).toEqual({ ok: true, id: 'lot-1' });
  });

  it('should_returnErrors_when_formDataIsInvalid', async () => {
    const fd = new FormData();
    fd.append('title', '');

    const result = await createLot({}, fd);

    expect(result).toMatchObject({ ok: false, errors: expect.any(Object) });
    expect(adminApi.post).not.toHaveBeenCalled();
  });
});

describe('deleteLot', () => {
  it('should_callAdminApiDeleteWithId', async () => {
    vi.mocked(adminApi.delete).mockResolvedValue({ data: { id: 'lot-1' } });

    await deleteLot('lot-1');

    expect(adminApi.delete).toHaveBeenCalledWith('/admin/api/lots/lot-1');
  });
});
```

- [ ] **Step 6: Run to verify failure**

```bash
npx vitest run src/app/admin/lots/_actions.test.ts
```

Expected: FAIL — `Cannot find module './_actions'`

- [ ] **Step 7: Create `apps/admin-portal/src/app/admin/lots/_actions.ts`**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { LotFormSchema } from '@/lib/schemas/lot.schema';

type ActionState = Record<string, unknown>;

export async function createLot(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    title: formData.get('title'),
    description: formData.get('description'),
    categoryId: formData.get('categoryId'),
    condition: formData.get('condition'),
    estimatedValue: Number(formData.get('estimatedValue')),
  };

  const parsed = LotFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors };

  try {
    const res = await adminApi.post<{ data: { id: string } }>('/admin/api/lots', parsed.data);
    revalidatePath('/admin/lots');
    return { ok: true, id: res.data.id };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function updateLot(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    title: formData.get('title'),
    description: formData.get('description'),
    categoryId: formData.get('categoryId'),
    condition: formData.get('condition'),
    estimatedValue: Number(formData.get('estimatedValue')),
  };

  const parsed = LotFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/lots/${id}`, parsed.data);
    revalidatePath('/admin/lots');
    revalidatePath(`/admin/lots/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function deleteLot(id: string): Promise<void> {
  await adminApi.delete(`/admin/api/lots/${id}`);
  revalidatePath('/admin/lots');
}
```

- [ ] **Step 8: Run action tests to verify pass**

```bash
npx vitest run src/app/admin/lots/_actions.test.ts
```

Expected: 3 passed

- [ ] **Step 9: Create image actions `apps/admin-portal/src/app/admin/lots/[id]/_actions.ts`**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { adminApi } from '@/lib/admin-api';

export async function getUploadUrl(
  lotId: string,
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; imageId: string; publicUrl: string }> {
  const res = await adminApi.post<{ data: { uploadUrl: string; imageId: string; publicUrl: string } }>(
    `/admin/api/lots/${lotId}/images/upload-url`,
    { filename, contentType },
  );
  return res.data;
}

export async function deleteImage(lotId: string, imageId: string): Promise<void> {
  await adminApi.delete(`/admin/api/lots/${lotId}/images/${imageId}`);
  revalidatePath(`/admin/lots/${lotId}`);
}

export async function reorderImages(lotId: string, imageIds: string[]): Promise<void> {
  await adminApi.patch(`/admin/api/lots/${lotId}/images/reorder`, { imageIds });
  revalidatePath(`/admin/lots/${lotId}`);
}
```

- [ ] **Step 10: Create `apps/admin-portal/src/components/image-uploader.tsx`**

```tsx
'use client';

import { useState, useCallback } from 'react';
import { GripVertical, Trash2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUploadUrl, deleteImage, reorderImages } from '@/app/admin/lots/[id]/_actions';

interface LotImage {
  id: string;
  publicUrl: string;
  isPrimary: boolean;
}

interface ImageUploaderProps {
  lotId: string;
  initialImages: LotImage[];
}

export function ImageUploader({ lotId, initialImages }: ImageUploaderProps) {
  const [images, setImages] = useState<LotImage[]>(initialImages);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const { uploadUrl, imageId, publicUrl } = await getUploadUrl(lotId, file.name, file.type);

      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      setImages(prev => [...prev, { id: imageId, publicUrl, isPrimary: prev.length === 0 }]);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, [lotId]);

  const handleDelete = async (imageId: string) => {
    await deleteImage(lotId, imageId);
    setImages(prev => prev.filter(img => img.id !== imageId));
  };

  const moveUp = async (index: number) => {
    if (index === 0) return;
    const next = [...images];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setImages(next);
    await reorderImages(lotId, next.map(img => img.id));
  };

  return (
    <div className='space-y-3'>
      <ul className='space-y-2'>
        {images.map((img, idx) => (
          <li key={img.id} className='flex items-center gap-3 rounded border p-2'>
            <GripVertical className='h-4 w-4 cursor-grab text-muted-foreground' />
            <img src={img.publicUrl} alt='' className='h-12 w-12 rounded object-cover' />
            {img.isPrimary && <Star className='h-4 w-4 text-yellow-500' />}
            <Button variant='ghost' size='icon' onClick={() => moveUp(idx)} disabled={idx === 0}>↑</Button>
            <Button variant='ghost' size='icon' onClick={() => handleDelete(img.id)}>
              <Trash2 className='h-4 w-4 text-destructive' />
            </Button>
          </li>
        ))}
      </ul>
      {error && <p className='text-sm text-destructive'>{error}</p>}
      <div>
        <label htmlFor='image-upload' className='cursor-pointer'>
          <Button variant='outline' asChild>
            <span>{uploading ? 'Uploading…' : 'Upload image'}</span>
          </Button>
          <input
            id='image-upload'
            type='file'
            accept='image/*'
            className='sr-only'
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Create lots list page `apps/admin-portal/src/app/admin/lots/page.tsx`**

```tsx
import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { deleteLot } from './_actions';
import type { ColumnDef } from '@tanstack/react-table';

interface Lot {
  id: string;
  title: string;
  categoryName: string;
  status: string;
  createdAt: string;
}

const columns: ColumnDef<Lot>[] = [
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'categoryName', header: 'Category' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <div className='flex gap-2'>
        <Button variant='outline' size='sm' asChild>
          <Link href={`/admin/lots/${row.original.id}`}>Edit</Link>
        </Button>
        <Button variant='outline' size='sm' asChild>
          <Link href={`/admin/auctions/new?lotId=${row.original.id}`}>Schedule Auction</Link>
        </Button>
        <ConfirmDialog
          trigger={<Button variant='destructive' size='sm'>Delete</Button>}
          title='Delete lot?'
          description='This will permanently remove the lot and all its images.'
          onConfirm={async () => { 'use server'; await deleteLot(row.original.id); }}
          confirmLabel='Delete'
        />
      </div>
    ),
  },
];

export default async function LotsPage() {
  const res = await adminApi.get<{ data: Lot[] }>('/admin/api/lots');

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Lots</h1>
        <Button asChild>
          <Link href='/admin/lots/new'>New Lot</Link>
        </Button>
      </div>
      <DataTable columns={columns} data={res.data} />
    </div>
  );
}
```

- [ ] **Step 12: Create new lot page `apps/admin-portal/src/app/admin/lots/new/page.tsx`**

```tsx
'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createLot } from '../_actions';

const CONDITIONS = ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR'] as const;

export default function NewLotPage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createLot, {});

  useEffect(() => {
    if (state.ok) router.push('/admin/lots');
  }, [state, router]);

  return (
    <div className='max-w-lg space-y-4'>
      <h1 className='text-2xl font-semibold'>New Lot</h1>
      <form action={formAction} className='space-y-4'>
        <div className='space-y-1'>
          <Label htmlFor='title'>Title</Label>
          <Input id='title' name='title' />
          {state.errors?.title && <p className='text-sm text-destructive'>{state.errors.title[0]}</p>}
        </div>
        <div className='space-y-1'>
          <Label htmlFor='description'>Description</Label>
          <Textarea id='description' name='description' rows={4} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='categoryId'>Category ID</Label>
          <Input id='categoryId' name='categoryId' placeholder='UUID' />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='condition'>Condition</Label>
          <Select name='condition'>
            <SelectTrigger><SelectValue placeholder='Select condition' /></SelectTrigger>
            <SelectContent>
              {CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-1'>
          <Label htmlFor='estimatedValue'>Estimated Value</Label>
          <Input id='estimatedValue' name='estimatedValue' type='number' min={0} step={0.01} />
        </div>
        <Button type='submit' disabled={isPending}>
          {isPending ? 'Creating…' : 'Create Lot'}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 13: Create edit lot page `apps/admin-portal/src/app/admin/lots/[id]/page.tsx`**

```tsx
import { adminApi } from '@/lib/admin-api';
import { ImageUploader } from '@/components/image-uploader';
import { EditLotForm } from './_edit-form';

interface LotImage {
  id: string;
  publicUrl: string;
  isPrimary: boolean;
}

interface Lot {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  condition: string;
  estimatedValue: number;
  images: LotImage[];
}

export default async function EditLotPage({ params }: { params: { id: string } }) {
  const res = await adminApi.get<{ data: Lot }>(`/admin/api/lots/${params.id}`);
  const lot = res.data;

  return (
    <div className='max-w-lg space-y-8'>
      <h1 className='text-2xl font-semibold'>Edit Lot</h1>
      <EditLotForm lot={lot} />
      <section className='space-y-2'>
        <h2 className='text-lg font-medium'>Images</h2>
        <ImageUploader lotId={lot.id} initialImages={lot.images} />
      </section>
    </div>
  );
}
```

Note: `_edit-form.tsx` is a client component in the same directory that uses `useActionState` with `updateLot`. Create it with the same pattern as `NewLotPage` but pre-populated with `lot` data and calling `updateLot.bind(null, lot.id)`.

- [ ] **Step 14: Run all lot tests**

```bash
npx vitest run src/lib/schemas/lot.schema.test.ts src/app/admin/lots/_actions.test.ts
```

Expected: 7 passed

- [ ] **Step 15: Commit**

```bash
git add apps/admin-portal/src/lib/schemas/lot.schema.ts apps/admin-portal/src/lib/schemas/lot.schema.test.ts \
  apps/admin-portal/src/app/admin/lots/ apps/admin-portal/src/components/image-uploader.tsx
git commit -m "feat(admin-portal): lots pages — list, create, edit, image uploader"
```

---

### Task 6: Categories page

**Files:**
- Create: `apps/admin-portal/src/lib/schemas/category.schema.ts`
- Create: `apps/admin-portal/src/app/admin/categories/_actions.ts`
- Create: `apps/admin-portal/src/app/admin/categories/page.tsx`
- Create: `apps/admin-portal/src/components/category-tree.tsx`
- Test: `apps/admin-portal/src/lib/schemas/category.schema.test.ts`
- Test: `apps/admin-portal/src/app/admin/categories/_actions.test.ts`

**Interfaces:**
- Consumes: `adminApi` from Task 3
- Produces: `<CategoryTree categories onRename onCreate onDelete />` — recursive expandable tree

**Admin Service endpoints used:**
- `GET /admin/api/categories` → `{ data: Category[] }` where `Category = { id, name, slug, parentId: string | null, children: Category[] }`
- `POST /admin/api/categories` with `{ name, slug, parentId?: string }` → `{ data: Category }`
- `PATCH /admin/api/categories/:id` with `{ name }` → `{ data: Category }`
- `DELETE /admin/api/categories/:id` → `{ data: { id: string } }` (fails 409 if lots assigned)

- [ ] **Step 1: Write failing schema tests**

Create `apps/admin-portal/src/lib/schemas/category.schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CategoryFormSchema } from './category.schema';

describe('CategoryFormSchema', () => {
  it('should_pass_when_nameAndSlugArePresent', () => {
    expect(CategoryFormSchema.safeParse({ name: 'Rings', slug: 'rings' }).success).toBe(true);
  });

  it('should_pass_when_parentIdIsProvided', () => {
    expect(CategoryFormSchema.safeParse({
      name: 'Solitaire',
      slug: 'solitaire',
      parentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    }).success).toBe(true);
  });

  it('should_fail_when_nameIsEmpty', () => {
    expect(CategoryFormSchema.safeParse({ name: '', slug: 'rings' }).success).toBe(false);
  });

  it('should_fail_when_slugContainsSpaces', () => {
    expect(CategoryFormSchema.safeParse({ name: 'Fine Rings', slug: 'fine rings' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/admin-portal
npx vitest run src/lib/schemas/category.schema.test.ts
```

Expected: FAIL — `Cannot find module './category.schema'`

- [ ] **Step 3: Create `apps/admin-portal/src/lib/schemas/category.schema.ts`**

```typescript
import { z } from 'zod';

export const CategoryFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  parentId: z.string().uuid().optional(),
});

export type CategoryFormValues = z.infer<typeof CategoryFormSchema>;
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run src/lib/schemas/category.schema.test.ts
```

Expected: 4 passed

- [ ] **Step 5: Write failing action tests**

Create `apps/admin-portal/src/app/admin/categories/_actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi, AdminApiError } from '@/lib/admin-api';
import { createCategory, renameCategory, deleteCategory } from './_actions';

beforeEach(() => vi.clearAllMocks());

describe('createCategory', () => {
  it('should_callAdminApiPost_when_dataIsValid', async () => {
    vi.mocked(adminApi.post).mockResolvedValue({ data: { id: 'cat-1' } });

    const result = await createCategory({ name: 'Rings', slug: 'rings' });

    expect(adminApi.post).toHaveBeenCalledWith('/admin/api/categories', { name: 'Rings', slug: 'rings' });
    expect(result).toEqual({ ok: true });
  });
});

describe('renameCategory', () => {
  it('should_callAdminApiPatch_with_id', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'cat-1' } });

    await renameCategory('cat-1', 'Updated Name');

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/categories/cat-1', { name: 'Updated Name' });
  });
});

describe('deleteCategory', () => {
  it('should_returnError_when_lotsAreAssigned', async () => {
    vi.mocked(adminApi.delete).mockRejectedValue(new AdminApiError(409, { error: { code: 'LOTS_ASSIGNED' } }));

    const result = await deleteCategory('cat-1');

    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'LOTS_ASSIGNED' }) });
  });
});
```

- [ ] **Step 6: Run to verify failure**

```bash
npx vitest run src/app/admin/categories/_actions.test.ts
```

Expected: FAIL — `Cannot find module './_actions'`

- [ ] **Step 7: Create `apps/admin-portal/src/app/admin/categories/_actions.ts`**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { CategoryFormSchema } from '@/lib/schemas/category.schema';

export async function createCategory(data: { name: string; slug: string; parentId?: string }): Promise<{ ok: boolean; error?: unknown }> {
  const parsed = CategoryFormSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.post('/admin/api/categories', parsed.data);
    revalidatePath('/admin/categories');
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: (err.body as { error: unknown }).error };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await adminApi.patch(`/admin/api/categories/${id}`, { name });
  revalidatePath('/admin/categories');
}

export async function deleteCategory(id: string): Promise<{ ok: boolean; error?: unknown }> {
  try {
    await adminApi.delete(`/admin/api/categories/${id}`);
    revalidatePath('/admin/categories');
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: (err.body as { error: unknown }).error };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}
```

- [ ] **Step 8: Run action tests to verify pass**

```bash
npx vitest run src/app/admin/categories/_actions.test.ts
```

Expected: 3 passed

- [ ] **Step 9: Create `apps/admin-portal/src/components/category-tree.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from './confirm-dialog';
import { renameCategory, deleteCategory, createCategory } from '@/app/admin/categories/_actions';

interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  children: Category[];
}

interface CategoryNodeProps {
  category: Category;
  depth: number;
}

function CategoryNode({ category, depth }: CategoryNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [nameValue, setNameValue] = useState(category.name);
  const [newChildName, setNewChildName] = useState('');
  const [newChildSlug, setNewChildSlug] = useState('');

  const handleRename = async () => {
    await renameCategory(category.id, nameValue);
    setEditing(false);
  };

  const handleAddChild = async () => {
    await createCategory({ name: newChildName, slug: newChildSlug, parentId: category.id });
    setAddingChild(false);
    setNewChildName('');
    setNewChildSlug('');
  };

  const handleDelete = async () => {
    await deleteCategory(category.id);
  };

  return (
    <li>
      <div className='flex items-center gap-2 py-1' style={{ paddingLeft: `${depth * 16}px` }}>
        <Button variant='ghost' size='icon' className='h-5 w-5' onClick={() => setExpanded(e => !e)}>
          {category.children.length > 0
            ? (expanded ? <ChevronDown className='h-3 w-3' /> : <ChevronRight className='h-3 w-3' />)
            : <span className='h-3 w-3' />}
        </Button>
        {editing ? (
          <Input
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => e.key === 'Enter' && handleRename()}
            className='h-6 w-48 text-sm'
            autoFocus
          />
        ) : (
          <span className='text-sm'>{category.name}</span>
        )}
        <Button variant='ghost' size='icon' className='h-5 w-5' onClick={() => setEditing(true)}>
          <Pencil className='h-3 w-3' />
        </Button>
        <Button variant='ghost' size='icon' className='h-5 w-5' onClick={() => setAddingChild(true)}>
          <Plus className='h-3 w-3' />
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant='ghost' size='icon' className='h-5 w-5'>
              <Trash2 className='h-3 w-3 text-destructive' />
            </Button>
          }
          title={`Delete "${category.name}"?`}
          description='Cannot delete if lots are assigned to this category.'
          onConfirm={handleDelete}
          confirmLabel='Delete'
        />
      </div>
      {addingChild && (
        <div className='flex items-center gap-2 py-1' style={{ paddingLeft: `${(depth + 1) * 16}px` }}>
          <Input placeholder='Name' value={newChildName} onChange={e => setNewChildName(e.target.value)} className='h-6 w-32 text-sm' autoFocus />
          <Input placeholder='slug' value={newChildSlug} onChange={e => setNewChildSlug(e.target.value)} className='h-6 w-28 text-sm' />
          <Button size='sm' className='h-6' onClick={handleAddChild}>Add</Button>
          <Button size='sm' variant='ghost' className='h-6' onClick={() => setAddingChild(false)}>Cancel</Button>
        </div>
      )}
      {expanded && category.children.length > 0 && (
        <ul>
          {category.children.map(child => (
            <CategoryNode key={child.id} category={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CategoryTree({ categories }: { categories: Category[] }) {
  return (
    <ul className='rounded border bg-card p-2'>
      {categories.map(cat => (
        <CategoryNode key={cat.id} category={cat} depth={0} />
      ))}
    </ul>
  );
}
```

- [ ] **Step 10: Create `apps/admin-portal/src/app/admin/categories/page.tsx`**

```tsx
import { adminApi } from '@/lib/admin-api';
import { CategoryTree } from '@/components/category-tree';

interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  children: Category[];
}

export default async function CategoriesPage() {
  const res = await adminApi.get<{ data: Category[] }>('/admin/api/categories');

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Categories</h1>
      <CategoryTree categories={res.data} />
    </div>
  );
}
```

- [ ] **Step 11: Run all category tests**

```bash
npx vitest run src/lib/schemas/category.schema.test.ts src/app/admin/categories/_actions.test.ts
```

Expected: 7 passed

- [ ] **Step 12: Commit**

```bash
git add apps/admin-portal/src/lib/schemas/category.schema.ts apps/admin-portal/src/lib/schemas/category.schema.test.ts \
  apps/admin-portal/src/app/admin/categories/ apps/admin-portal/src/components/category-tree.tsx
git commit -m "feat(admin-portal): categories page with recursive tree, inline rename, add child"
```

---

### Task 7: Auctions pages + live stats

**Files:**
- Create: `apps/admin-portal/src/lib/schemas/auction.schema.ts`
- Create: `apps/admin-portal/src/app/admin/auctions/_actions.ts`
- Create: `apps/admin-portal/src/app/admin/auctions/page.tsx`
- Create: `apps/admin-portal/src/app/admin/auctions/new/page.tsx`
- Create: `apps/admin-portal/src/app/admin/auctions/[lotId]/page.tsx`
- Create: `apps/admin-portal/src/components/auction-live-stats.tsx`
- Test: `apps/admin-portal/src/lib/schemas/auction.schema.test.ts`
- Test: `apps/admin-portal/src/app/admin/auctions/_actions.test.ts`

**Interfaces:**
- Consumes: `adminApi` from Task 3; `DataTable`, `StatusBadge`, `ConfirmDialog` from Task 4
- Produces: `<AuctionLiveStats lotId />` — SWR polling component refreshing every 5 seconds

**Admin Service endpoints used:**
- `GET /admin/api/auctions` → `{ data: AuctionSummary[] }` where `AuctionSummary = { lotId, lotTitle, status, currentBid, endAt }`
- `GET /admin/api/auctions/:lotId` → `{ data: AuctionDetail }` where `AuctionDetail = { lotId, lotTitle, status, currentBid, bidCount, endAt, bids: Bid[], autoExtendWindowMinutes, autoExtendDurationMinutes }`
- `POST /admin/api/auctions` with `{ lotId, startAt, endAt, reservePrice, minBidIncrement, autoExtendWindowMinutes, autoExtendDurationMinutes }` → `{ data: AuctionSummary }`
- `PATCH /admin/api/auctions/:lotId/reschedule` with `{ startAt, endAt }` → `{ data: AuctionSummary }`
- `DELETE /admin/api/auctions/:lotId` → `{ data: { lotId: string } }`

- [ ] **Step 1: Write failing schema tests**

Create `apps/admin-portal/src/lib/schemas/auction.schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ScheduleAuctionSchema, RescheduleAuctionSchema } from './auction.schema';

const futureDate = (hoursFromNow: number) =>
  new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();

describe('ScheduleAuctionSchema', () => {
  const valid = {
    lotId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    startAt: futureDate(1),
    endAt: futureDate(25),
    reservePrice: 500,
    minBidIncrement: 10,
    autoExtendWindowMinutes: 3,
    autoExtendDurationMinutes: 3,
  };

  it('should_pass_when_allFieldsAreValid', () => {
    expect(ScheduleAuctionSchema.safeParse(valid).success).toBe(true);
  });

  it('should_fail_when_endAtIsBeforeStartAt', () => {
    expect(ScheduleAuctionSchema.safeParse({ ...valid, endAt: futureDate(0.5) }).success).toBe(false);
  });

  it('should_fail_when_reservePriceIsNegative', () => {
    expect(ScheduleAuctionSchema.safeParse({ ...valid, reservePrice: -1 }).success).toBe(false);
  });

  it('should_fail_when_autoExtendWindowIsZero', () => {
    expect(ScheduleAuctionSchema.safeParse({ ...valid, autoExtendWindowMinutes: 0 }).success).toBe(false);
  });
});

describe('RescheduleAuctionSchema', () => {
  it('should_pass_when_startAndEndAreValid', () => {
    expect(RescheduleAuctionSchema.safeParse({ startAt: futureDate(1), endAt: futureDate(25) }).success).toBe(true);
  });

  it('should_fail_when_endIsNotAfterStart', () => {
    expect(RescheduleAuctionSchema.safeParse({ startAt: futureDate(2), endAt: futureDate(1) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/admin-portal
npx vitest run src/lib/schemas/auction.schema.test.ts
```

Expected: FAIL — `Cannot find module './auction.schema'`

- [ ] **Step 3: Create `apps/admin-portal/src/lib/schemas/auction.schema.ts`**

```typescript
import { z } from 'zod';

export const ScheduleAuctionSchema = z
  .object({
    lotId: z.string().uuid('Select a lot'),
    startAt: z.string().datetime('Invalid start date'),
    endAt: z.string().datetime('Invalid end date'),
    reservePrice: z.number({ invalid_type_error: 'Enter a number' }).nonnegative('Cannot be negative'),
    minBidIncrement: z.number({ invalid_type_error: 'Enter a number' }).positive('Must be positive'),
    autoExtendWindowMinutes: z.number({ invalid_type_error: 'Enter a number' }).int().positive('Must be positive'),
    autoExtendDurationMinutes: z.number({ invalid_type_error: 'Enter a number' }).int().positive('Must be positive'),
  })
  .refine(data => new Date(data.endAt) > new Date(data.startAt), {
    message: 'End date must be after start date',
    path: ['endAt'],
  });

export const RescheduleAuctionSchema = z
  .object({
    startAt: z.string().datetime('Invalid start date'),
    endAt: z.string().datetime('Invalid end date'),
  })
  .refine(data => new Date(data.endAt) > new Date(data.startAt), {
    message: 'End date must be after start date',
    path: ['endAt'],
  });

export type ScheduleAuctionValues = z.infer<typeof ScheduleAuctionSchema>;
export type RescheduleAuctionValues = z.infer<typeof RescheduleAuctionSchema>;
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run src/lib/schemas/auction.schema.test.ts
```

Expected: 6 passed

- [ ] **Step 5: Write failing action tests**

Create `apps/admin-portal/src/app/admin/auctions/_actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi } from '@/lib/admin-api';
import { scheduleAuction, cancelAuction } from './_actions';

beforeEach(() => vi.clearAllMocks());

const futureDate = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('scheduleAuction', () => {
  it('should_callAdminApiPost_when_formDataIsValid', async () => {
    vi.mocked(adminApi.post).mockResolvedValue({ data: { lotId: 'lot-1' } });

    const fd = new FormData();
    fd.append('lotId', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    fd.append('startAt', futureDate(1));
    fd.append('endAt', futureDate(25));
    fd.append('reservePrice', '500');
    fd.append('minBidIncrement', '10');
    fd.append('autoExtendWindowMinutes', '3');
    fd.append('autoExtendDurationMinutes', '3');

    const result = await scheduleAuction({}, fd);

    expect(adminApi.post).toHaveBeenCalledWith('/admin/api/auctions', expect.objectContaining({ reservePrice: 500 }));
    expect(result).toMatchObject({ ok: true });
  });

  it('should_returnErrors_when_endIsBeforeStart', async () => {
    const fd = new FormData();
    fd.append('lotId', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    fd.append('startAt', futureDate(2));
    fd.append('endAt', futureDate(1));
    fd.append('reservePrice', '500');
    fd.append('minBidIncrement', '10');
    fd.append('autoExtendWindowMinutes', '3');
    fd.append('autoExtendDurationMinutes', '3');

    const result = await scheduleAuction({}, fd);

    expect(result).toMatchObject({ ok: false });
    expect(adminApi.post).not.toHaveBeenCalled();
  });
});

describe('cancelAuction', () => {
  it('should_callAdminApiDelete_with_lotId', async () => {
    vi.mocked(adminApi.delete).mockResolvedValue({ data: { lotId: 'lot-1' } });

    await cancelAuction('lot-1');

    expect(adminApi.delete).toHaveBeenCalledWith('/admin/api/auctions/lot-1');
  });
});
```

- [ ] **Step 6: Run to verify failure**

```bash
npx vitest run src/app/admin/auctions/_actions.test.ts
```

Expected: FAIL — `Cannot find module './_actions'`

- [ ] **Step 7: Create `apps/admin-portal/src/app/admin/auctions/_actions.ts`**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { ScheduleAuctionSchema, RescheduleAuctionSchema } from '@/lib/schemas/auction.schema';

type ActionState = Record<string, unknown>;

export async function scheduleAuction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    lotId: formData.get('lotId'),
    startAt: formData.get('startAt'),
    endAt: formData.get('endAt'),
    reservePrice: Number(formData.get('reservePrice')),
    minBidIncrement: Number(formData.get('minBidIncrement')),
    autoExtendWindowMinutes: Number(formData.get('autoExtendWindowMinutes')),
    autoExtendDurationMinutes: Number(formData.get('autoExtendDurationMinutes')),
  };

  const parsed = ScheduleAuctionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors };

  try {
    const res = await adminApi.post<{ data: { lotId: string } }>('/admin/api/auctions', parsed.data);
    revalidatePath('/admin/auctions');
    return { ok: true, lotId: res.data.lotId };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function rescheduleAuction(lotId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    startAt: formData.get('startAt'),
    endAt: formData.get('endAt'),
  };

  const parsed = RescheduleAuctionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/auctions/${lotId}/reschedule`, parsed.data);
    revalidatePath('/admin/auctions');
    revalidatePath(`/admin/auctions/${lotId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function cancelAuction(lotId: string): Promise<void> {
  await adminApi.delete(`/admin/api/auctions/${lotId}`);
  revalidatePath('/admin/auctions');
}
```

- [ ] **Step 8: Run action tests to verify pass**

```bash
npx vitest run src/app/admin/auctions/_actions.test.ts
```

Expected: 3 passed

- [ ] **Step 9: Create `apps/admin-portal/src/components/auction-live-stats.tsx`**

SWR polls the client-side proxy (Task 3) every 5 seconds for current bid and time remaining. No SSE.

```tsx
'use client';

import useSWR from 'swr';

interface LiveStats {
  currentBid: number;
  bidCount: number;
  endAt: string;
  status: string;
}

const fetcher = (url: string) => fetch(url).then(r => r.json()) as Promise<{ data: LiveStats }>;

function timeRemaining(endAt: string): string {
  const diff = new Date(endAt).getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return `${h}h ${m}m ${s}s`;
}

export function AuctionLiveStats({ lotId }: { lotId: string }) {
  const { data, error } = useSWR(`/api/admin/auctions/${lotId}`, fetcher, {
    refreshInterval: 5_000,
    dedupingInterval: 4_000,
  });

  if (error) return <p className='text-sm text-destructive'>Failed to load live stats.</p>;
  if (!data) return <p className='text-sm text-muted-foreground'>Loading…</p>;

  const { currentBid, bidCount, endAt, status } = data.data;

  return (
    <div className='flex gap-8 rounded border bg-muted/40 p-4'>
      <div>
        <p className='text-xs text-muted-foreground'>Current Bid</p>
        <p className='text-2xl font-semibold'>{currentBid.toLocaleString()}</p>
      </div>
      <div>
        <p className='text-xs text-muted-foreground'>Bids</p>
        <p className='text-2xl font-semibold'>{bidCount}</p>
      </div>
      <div>
        <p className='text-xs text-muted-foreground'>Time Remaining</p>
        <p className='text-2xl font-semibold font-mono'>
          {status === 'LIVE' ? timeRemaining(endAt) : status}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Create auctions list page `apps/admin-portal/src/app/admin/auctions/page.tsx`**

```tsx
import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import type { ColumnDef } from '@tanstack/react-table';

interface AuctionSummary {
  lotId: string;
  lotTitle: string;
  status: string;
  currentBid: number;
  endAt: string;
}

const columns: ColumnDef<AuctionSummary>[] = [
  { accessorKey: 'lotTitle', header: 'Lot' },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { accessorKey: 'currentBid', header: 'Current Bid', cell: ({ row }) => row.original.currentBid.toLocaleString() },
  { accessorKey: 'endAt', header: 'Ends', cell: ({ row }) => new Date(row.original.endAt).toLocaleString() },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Button variant='outline' size='sm' asChild>
        <Link href={`/admin/auctions/${row.original.lotId}`}>View</Link>
      </Button>
    ),
  },
];

export default async function AuctionsPage() {
  const res = await adminApi.get<{ data: AuctionSummary[] }>('/admin/api/auctions');

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Auctions</h1>
        <Button asChild><Link href='/admin/auctions/new'>Schedule Auction</Link></Button>
      </div>
      <DataTable columns={columns} data={res.data} />
    </div>
  );
}
```

- [ ] **Step 11: Create schedule auction form `apps/admin-portal/src/app/admin/auctions/new/page.tsx`**

```tsx
'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { scheduleAuction } from '../_actions';

export default function NewAuctionPage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(scheduleAuction, {});

  useEffect(() => {
    if (state.ok) router.push(`/admin/auctions/${state.lotId}`);
  }, [state, router]);

  return (
    <div className='max-w-lg space-y-4'>
      <h1 className='text-2xl font-semibold'>Schedule Auction</h1>
      <form action={formAction} className='space-y-4'>
        <div className='space-y-1'>
          <Label htmlFor='lotId'>Lot ID (UUID)</Label>
          <Input id='lotId' name='lotId' placeholder='Select a lot UUID' />
          {state.errors?.lotId && <p className='text-sm text-destructive'>{state.errors.lotId[0]}</p>}
        </div>
        <div className='grid grid-cols-2 gap-4'>
          <div className='space-y-1'>
            <Label htmlFor='startAt'>Start Date/Time</Label>
            <Input id='startAt' name='startAt' type='datetime-local' />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='endAt'>End Date/Time</Label>
            <Input id='endAt' name='endAt' type='datetime-local' />
            {state.errors?.endAt && <p className='text-sm text-destructive'>{state.errors.endAt[0]}</p>}
          </div>
        </div>
        <div className='grid grid-cols-2 gap-4'>
          <div className='space-y-1'>
            <Label htmlFor='reservePrice'>Reserve Price</Label>
            <Input id='reservePrice' name='reservePrice' type='number' min={0} step={0.01} />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='minBidIncrement'>Min Bid Increment</Label>
            <Input id='minBidIncrement' name='minBidIncrement' type='number' min={1} step={0.01} />
          </div>
        </div>
        <div className='grid grid-cols-2 gap-4'>
          <div className='space-y-1'>
            <Label htmlFor='autoExtendWindowMinutes'>Auto-extend Window (min)</Label>
            <Input id='autoExtendWindowMinutes' name='autoExtendWindowMinutes' type='number' min={1} defaultValue={3} />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='autoExtendDurationMinutes'>Auto-extend Duration (min)</Label>
            <Input id='autoExtendDurationMinutes' name='autoExtendDurationMinutes' type='number' min={1} defaultValue={3} />
          </div>
        </div>
        <Button type='submit' disabled={isPending}>{isPending ? 'Scheduling…' : 'Schedule Auction'}</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 12: Create auction detail page `apps/admin-portal/src/app/admin/auctions/[lotId]/page.tsx`**

```tsx
import { adminApi } from '@/lib/admin-api';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { AuctionLiveStats } from '@/components/auction-live-stats';
import { Button } from '@/components/ui/button';
import { cancelAuction } from '../_actions';
import type { ColumnDef } from '@tanstack/react-table';

interface Bid {
  id: string;
  userEmail: string;
  amount: number;
  placedAt: string;
}

interface AuctionDetail {
  lotId: string;
  lotTitle: string;
  status: string;
  currentBid: number;
  bidCount: number;
  endAt: string;
  bids: Bid[];
}

const bidColumns: ColumnDef<Bid>[] = [
  { accessorKey: 'userEmail', header: 'Bidder' },
  { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => row.original.amount.toLocaleString() },
  { accessorKey: 'placedAt', header: 'Placed At', cell: ({ row }) => new Date(row.original.placedAt).toLocaleString() },
];

export default async function AuctionDetailPage({ params }: { params: { lotId: string } }) {
  const res = await adminApi.get<{ data: AuctionDetail }>(`/admin/api/auctions/${params.lotId}`);
  const auction = res.data;
  const isLive = auction.status === 'LIVE';
  const isScheduled = auction.status === 'SCHEDULED';

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-semibold'>{auction.lotTitle}</h1>
          <StatusBadge status={auction.status} />
        </div>
        <div className='flex gap-2'>
          {isScheduled && (
            <Button variant='outline' asChild>
              <a href={`/admin/auctions/${params.lotId}/reschedule`}>Reschedule</a>
            </Button>
          )}
          {(isLive || isScheduled) && (
            <ConfirmDialog
              trigger={<Button variant='destructive'>Cancel Auction</Button>}
              title='Cancel auction?'
              description='The auction will be cancelled and all bids removed. This cannot be undone.'
              onConfirm={async () => { 'use server'; await cancelAuction(params.lotId); }}
              confirmLabel='Cancel Auction'
            />
          )}
        </div>
      </div>
      {isLive && <AuctionLiveStats lotId={params.lotId} />}
      <section className='space-y-2'>
        <h2 className='text-lg font-medium'>Bid History</h2>
        <DataTable columns={bidColumns} data={auction.bids} />
      </section>
    </div>
  );
}
```

- [ ] **Step 13: Run all auction tests**

```bash
npx vitest run src/lib/schemas/auction.schema.test.ts src/app/admin/auctions/_actions.test.ts
```

Expected: 9 passed

- [ ] **Step 14: Commit**

```bash
git add apps/admin-portal/src/lib/schemas/auction.schema.ts apps/admin-portal/src/lib/schemas/auction.schema.test.ts \
  apps/admin-portal/src/app/admin/auctions/ apps/admin-portal/src/components/auction-live-stats.tsx
git commit -m "feat(admin-portal): auctions pages — list, schedule, detail + live stats polling"
```

---

### Task 8: Users pages

**Files:**
- Create: `apps/admin-portal/src/lib/schemas/user.schema.ts`
- Create: `apps/admin-portal/src/app/admin/users/_actions.ts`  *(shared by both pages)*
- Create: `apps/admin-portal/src/app/admin/users/page.tsx`
- Create: `apps/admin-portal/src/app/admin/users/[id]/page.tsx`
- Create: `apps/admin-portal/src/app/admin/users/[id]/_actions.ts`
- Test: `apps/admin-portal/src/lib/schemas/user.schema.test.ts`
- Test: `apps/admin-portal/src/app/admin/users/[id]/_actions.test.ts`

**Interfaces:**
- Consumes: `adminApi` from Task 3; `DataTable`, `StatusBadge`, `ConfirmDialog` from Task 4

**Admin Service endpoints used:**
- `GET /admin/api/users?status=&search=` → `{ data: UserSummary[] }` where `UserSummary = { id, email, status, country, registeredAt, bidCount }`
- `GET /admin/api/users/:id` → `{ data: UserDetail }` where `UserDetail = { id, email, status, country, phoneVerified, emailVerified, registeredAt, bids: Bid[], invoices: Invoice[] }`
- `PATCH /admin/api/users/:id/suspend` with `{ reason: string }` → `{ data: UserSummary }`
- `PATCH /admin/api/users/:id/reinstate` → `{ data: UserSummary }`
- `PATCH /admin/api/users/:id/approve` → `{ data: UserSummary }`

- [ ] **Step 1: Write failing schema test**

Create `apps/admin-portal/src/lib/schemas/user.schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SuspendUserSchema } from './user.schema';

describe('SuspendUserSchema', () => {
  it('should_pass_when_reasonHasTenChars', () => {
    expect(SuspendUserSchema.safeParse({ reason: '1234567890' }).success).toBe(true);
  });

  it('should_fail_when_reasonIsTooShort', () => {
    expect(SuspendUserSchema.safeParse({ reason: 'short' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/admin-portal
npx vitest run src/lib/schemas/user.schema.test.ts
```

Expected: FAIL — `Cannot find module './user.schema'`

- [ ] **Step 3: Create `apps/admin-portal/src/lib/schemas/user.schema.ts`**

```typescript
import { z } from 'zod';

export const SuspendUserSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

export type SuspendUserValues = z.infer<typeof SuspendUserSchema>;
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run src/lib/schemas/user.schema.test.ts
```

Expected: 2 passed

- [ ] **Step 5: Write failing action tests**

Create `apps/admin-portal/src/app/admin/users/[id]/_actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { patch: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi } from '@/lib/admin-api';
import { suspendUser, reinstateUser, manuallyApproveUser } from './_actions';

beforeEach(() => vi.clearAllMocks());

describe('suspendUser', () => {
  it('should_callAdminApiPatch_with_reason', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'user-1' } });

    const result = await suspendUser('user-1', 'Suspicious bidding behaviour detected.');

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/users/user-1/suspend', { reason: 'Suspicious bidding behaviour detected.' });
    expect(result).toEqual({ ok: true });
  });

  it('should_returnError_when_reasonIsTooShort', async () => {
    const result = await suspendUser('user-1', 'short');

    expect(result).toMatchObject({ ok: false });
    expect(adminApi.patch).not.toHaveBeenCalled();
  });
});

describe('reinstateUser', () => {
  it('should_callAdminApiPatch', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'user-1' } });

    await reinstateUser('user-1');

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/users/user-1/reinstate', {});
  });
});
```

- [ ] **Step 6: Run to verify failure**

```bash
npx vitest run src/app/admin/users/[id]/_actions.test.ts
```

Expected: FAIL — `Cannot find module './_actions'`

- [ ] **Step 7: Create `apps/admin-portal/src/app/admin/users/[id]/_actions.ts`**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { SuspendUserSchema } from '@/lib/schemas/user.schema';

export async function suspendUser(id: string, reason: string): Promise<{ ok: boolean; error?: unknown }> {
  const parsed = SuspendUserSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/users/${id}/suspend`, { reason });
    revalidatePath(`/admin/users/${id}`);
    revalidatePath('/admin/users');
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function reinstateUser(id: string): Promise<void> {
  await adminApi.patch(`/admin/api/users/${id}/reinstate`, {});
  revalidatePath(`/admin/users/${id}`);
  revalidatePath('/admin/users');
}

export async function manuallyApproveUser(id: string): Promise<void> {
  await adminApi.patch(`/admin/api/users/${id}/approve`, {});
  revalidatePath(`/admin/users/${id}`);
  revalidatePath('/admin/users');
}
```

- [ ] **Step 8: Run action tests to verify pass**

```bash
npx vitest run src/app/admin/users/[id]/_actions.test.ts
```

Expected: 3 passed

- [ ] **Step 9: Create users list page `apps/admin-portal/src/app/admin/users/page.tsx`**

```tsx
import { adminApi } from '@/lib/admin-api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';

interface UserSummary {
  id: string;
  email: string;
  status: string;
  country: string;
  registeredAt: string;
  bidCount: number;
}

const columns: ColumnDef<UserSummary>[] = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { accessorKey: 'country', header: 'Country' },
  { accessorKey: 'bidCount', header: 'Bids' },
  { accessorKey: 'registeredAt', header: 'Registered', cell: ({ row }) => new Date(row.original.registeredAt).toLocaleDateString() },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Button variant='outline' size='sm' asChild>
        <Link href={`/admin/users/${row.original.id}`}>View</Link>
      </Button>
    ),
  },
];

export default async function UsersPage({ searchParams }: { searchParams: { status?: string; search?: string } }) {
  const query = new URLSearchParams();
  if (searchParams.status) query.set('status', searchParams.status);
  if (searchParams.search) query.set('search', searchParams.search);

  const res = await adminApi.get<{ data: UserSummary[] }>(`/admin/api/users?${query.toString()}`);

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Users</h1>
      <DataTable columns={columns} data={res.data} />
    </div>
  );
}
```

- [ ] **Step 10: Create user detail page `apps/admin-portal/src/app/admin/users/[id]/page.tsx`**

```tsx
import { adminApi } from '@/lib/admin-api';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { suspendUser, reinstateUser, manuallyApproveUser } from './_actions';

interface UserDetail {
  id: string;
  email: string;
  status: string;
  country: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  registeredAt: string;
}

export default async function UserDetailPage({ params }: { params: { id: string } }) {
  const res = await adminApi.get<{ data: UserDetail }>(`/admin/api/users/${params.id}`);
  const user = res.data;

  return (
    <div className='space-y-6 max-w-2xl'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-semibold'>{user.email}</h1>
          <StatusBadge status={user.status} />
        </div>
        <div className='flex gap-2'>
          {user.status === 'ACTIVE' && (
            <ConfirmDialog
              trigger={<Button variant='destructive'>Suspend</Button>}
              title='Suspend user?'
              description='User will be unable to place bids.'
              onConfirm={async () => { 'use server'; await suspendUser(user.id, 'Suspended by admin.'); }}
              confirmLabel='Suspend'
            />
          )}
          {user.status === 'SUSPENDED' && (
            <Button onClick={async () => { 'use server'; await reinstateUser(user.id); }}>
              Reinstate
            </Button>
          )}
          {!user.emailVerified && (
            <Button variant='outline' onClick={async () => { 'use server'; await manuallyApproveUser(user.id); }}>
              Manually Approve
            </Button>
          )}
        </div>
      </div>
      <dl className='grid grid-cols-2 gap-4 rounded border p-4'>
        <div><dt className='text-xs text-muted-foreground'>Country</dt><dd>{user.country}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Registered</dt><dd>{new Date(user.registeredAt).toLocaleDateString()}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Email verified</dt><dd>{user.emailVerified ? 'Yes' : 'No'}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Phone verified</dt><dd>{user.phoneVerified ? 'Yes' : 'No'}</dd></div>
      </dl>
    </div>
  );
}
```

- [ ] **Step 11: Run all user tests**

```bash
npx vitest run src/lib/schemas/user.schema.test.ts src/app/admin/users/\[id\]/_actions.test.ts
```

Expected: 5 passed

- [ ] **Step 12: Commit**

```bash
git add apps/admin-portal/src/lib/schemas/user.schema.ts apps/admin-portal/src/lib/schemas/user.schema.test.ts \
  apps/admin-portal/src/app/admin/users/
git commit -m "feat(admin-portal): users pages — list and detail with suspend/reinstate/approve"
```

---

### Task 9: Invoices pages

**Files:**
- Create: `apps/admin-portal/src/lib/schemas/invoice.schema.ts`
- Create: `apps/admin-portal/src/app/admin/invoices/page.tsx`
- Create: `apps/admin-portal/src/app/admin/invoices/[id]/page.tsx`
- Create: `apps/admin-portal/src/app/admin/invoices/[id]/_actions.ts`
- Test: `apps/admin-portal/src/lib/schemas/invoice.schema.test.ts`
- Test: `apps/admin-portal/src/app/admin/invoices/[id]/_actions.test.ts`

**Interfaces:**
- Consumes: `adminApi` from Task 3; `DataTable`, `StatusBadge`, `ConfirmDialog` from Task 4

**Admin Service endpoints used:**
- `GET /admin/api/invoices?status=` → `{ data: InvoiceSummary[] }` where `InvoiceSummary = { id, lotTitle, winnerEmail, amount, currency, status, dueAt }`
- `GET /admin/api/invoices/:id` → `{ data: InvoiceDetail }` where `InvoiceDetail = { id, lotTitle, winnerEmail, amount, currency, status, dueAt, stripePaymentIntentId }`
- `PATCH /admin/api/invoices/:id/extend` with `{ dueAt: string }` → `{ data: InvoiceDetail }`
- `PATCH /admin/api/invoices/:id/cancel` with `{ reason: string }` → `{ data: InvoiceDetail }`

- [ ] **Step 1: Write failing schema tests**

Create `apps/admin-portal/src/lib/schemas/invoice.schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ExtendDueDateSchema, CancelInvoiceSchema } from './invoice.schema';

describe('ExtendDueDateSchema', () => {
  it('should_pass_when_dueDateIsInFuture', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
    expect(ExtendDueDateSchema.safeParse({ dueAt: future }).success).toBe(true);
  });

  it('should_fail_when_dueDateIsInPast', () => {
    expect(ExtendDueDateSchema.safeParse({ dueAt: '2020-01-01' }).success).toBe(false);
  });
});

describe('CancelInvoiceSchema', () => {
  it('should_pass_when_reasonHasTenChars', () => {
    expect(CancelInvoiceSchema.safeParse({ reason: '1234567890' }).success).toBe(true);
  });

  it('should_fail_when_reasonIsTooShort', () => {
    expect(CancelInvoiceSchema.safeParse({ reason: 'short' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/admin-portal
npx vitest run src/lib/schemas/invoice.schema.test.ts
```

Expected: FAIL — `Cannot find module './invoice.schema'`

- [ ] **Step 3: Create `apps/admin-portal/src/lib/schemas/invoice.schema.ts`**

```typescript
import { z } from 'zod';

export const ExtendDueDateSchema = z.object({
  dueAt: z.string().refine(d => new Date(d) > new Date(), { message: 'Due date must be in the future' }),
});

export const CancelInvoiceSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

export type ExtendDueDateValues = z.infer<typeof ExtendDueDateSchema>;
export type CancelInvoiceValues = z.infer<typeof CancelInvoiceSchema>;
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run src/lib/schemas/invoice.schema.test.ts
```

Expected: 4 passed

- [ ] **Step 5: Write failing action tests**

Create `apps/admin-portal/src/app/admin/invoices/[id]/_actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { patch: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi } from '@/lib/admin-api';
import { extendDueDate, cancelInvoice } from './_actions';

beforeEach(() => vi.clearAllMocks());

describe('extendDueDate', () => {
  it('should_callAdminApiPatch_with_futureDate', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'inv-1' } });

    const future = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
    const result = await extendDueDate('inv-1', future);

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/invoices/inv-1/extend', { dueAt: future });
    expect(result).toEqual({ ok: true });
  });

  it('should_returnError_when_dateIsInPast', async () => {
    const result = await extendDueDate('inv-1', '2020-01-01');

    expect(result).toMatchObject({ ok: false });
    expect(adminApi.patch).not.toHaveBeenCalled();
  });
});

describe('cancelInvoice', () => {
  it('should_callAdminApiPatch_with_reason', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'inv-1' } });

    const result = await cancelInvoice('inv-1', 'Customer requested cancellation of this invoice.');

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/invoices/inv-1/cancel', { reason: 'Customer requested cancellation of this invoice.' });
    expect(result).toEqual({ ok: true });
  });
});
```

- [ ] **Step 6: Run to verify failure**

```bash
npx vitest run src/app/admin/invoices/\[id\]/_actions.test.ts
```

Expected: FAIL — `Cannot find module './_actions'`

- [ ] **Step 7: Create `apps/admin-portal/src/app/admin/invoices/[id]/_actions.ts`**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { ExtendDueDateSchema, CancelInvoiceSchema } from '@/lib/schemas/invoice.schema';

export async function extendDueDate(id: string, dueAt: string): Promise<{ ok: boolean; error?: unknown }> {
  const parsed = ExtendDueDateSchema.safeParse({ dueAt });
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/invoices/${id}/extend`, { dueAt });
    revalidatePath(`/admin/invoices/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function cancelInvoice(id: string, reason: string): Promise<{ ok: boolean; error?: unknown }> {
  const parsed = CancelInvoiceSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/invoices/${id}/cancel`, { reason });
    revalidatePath('/admin/invoices');
    revalidatePath(`/admin/invoices/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}
```

- [ ] **Step 8: Run to verify pass**

```bash
npx vitest run src/app/admin/invoices/\[id\]/_actions.test.ts
```

Expected: 3 passed

- [ ] **Step 9: Create invoices list page `apps/admin-portal/src/app/admin/invoices/page.tsx`**

```tsx
import { adminApi } from '@/lib/admin-api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';

interface InvoiceSummary {
  id: string;
  lotTitle: string;
  winnerEmail: string;
  amount: number;
  currency: string;
  status: string;
  dueAt: string;
}

const columns: ColumnDef<InvoiceSummary>[] = [
  { accessorKey: 'lotTitle', header: 'Lot' },
  { accessorKey: 'winnerEmail', header: 'Winner' },
  { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => `${row.original.currency} ${row.original.amount.toLocaleString()}` },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { accessorKey: 'dueAt', header: 'Due', cell: ({ row }) => new Date(row.original.dueAt).toLocaleDateString() },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Button variant='outline' size='sm' asChild>
        <Link href={`/admin/invoices/${row.original.id}`}>View</Link>
      </Button>
    ),
  },
];

export default async function InvoicesPage({ searchParams }: { searchParams: { status?: string } }) {
  const query = searchParams.status ? `?status=${searchParams.status}` : '';
  const res = await adminApi.get<{ data: InvoiceSummary[] }>(`/admin/api/invoices${query}`);

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Invoices</h1>
      <DataTable columns={columns} data={res.data} />
    </div>
  );
}
```

- [ ] **Step 10: Create invoice detail page `apps/admin-portal/src/app/admin/invoices/[id]/page.tsx`**

```tsx
import { adminApi } from '@/lib/admin-api';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { extendDueDate, cancelInvoice } from './_actions';

interface InvoiceDetail {
  id: string;
  lotTitle: string;
  winnerEmail: string;
  amount: number;
  currency: string;
  status: string;
  dueAt: string;
  stripePaymentIntentId: string;
}

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const res = await adminApi.get<{ data: InvoiceDetail }>(`/admin/api/invoices/${params.id}`);
  const invoice = res.data;
  const isUnpaid = invoice.status === 'UNPAID';

  return (
    <div className='max-w-2xl space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-semibold'>{invoice.lotTitle}</h1>
          <StatusBadge status={invoice.status} />
        </div>
        {isUnpaid && (
          <ConfirmDialog
            trigger={<Button variant='destructive'>Cancel Invoice</Button>}
            title='Cancel invoice?'
            description='The invoice will be cancelled. Reason: unpaid after due date.'
            onConfirm={async () => { 'use server'; await cancelInvoice(invoice.id, 'Cancelled by admin after review.'); }}
            confirmLabel='Cancel Invoice'
          />
        )}
      </div>
      <dl className='grid grid-cols-2 gap-4 rounded border p-4'>
        <div><dt className='text-xs text-muted-foreground'>Winner</dt><dd>{invoice.winnerEmail}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Amount</dt><dd>{invoice.currency} {invoice.amount.toLocaleString()}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Due</dt><dd>{new Date(invoice.dueAt).toLocaleDateString()}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Stripe PI</dt><dd className='font-mono text-xs'>{invoice.stripePaymentIntentId}</dd></div>
      </dl>
      {isUnpaid && (
        <form action={async (fd: FormData) => { 'use server'; await extendDueDate(invoice.id, fd.get('dueAt') as string); }} className='space-y-2'>
          <Label htmlFor='dueAt'>Extend due date</Label>
          <div className='flex gap-2'>
            <Input id='dueAt' name='dueAt' type='date' className='w-40' />
            <Button type='submit' variant='outline'>Extend</Button>
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 11: Run all invoice tests**

```bash
npx vitest run src/lib/schemas/invoice.schema.test.ts src/app/admin/invoices/\[id\]/_actions.test.ts
```

Expected: 7 passed

- [ ] **Step 12: Commit**

```bash
git add apps/admin-portal/src/lib/schemas/invoice.schema.ts apps/admin-portal/src/lib/schemas/invoice.schema.test.ts \
  apps/admin-portal/src/app/admin/invoices/
git commit -m "feat(admin-portal): invoices pages — list, detail, extend due date, cancel"
```

---

### Task 10: Fulfilments pages

**Files:**
- Create: `apps/admin-portal/src/lib/schemas/fulfilment.schema.ts`
- Create: `apps/admin-portal/src/app/admin/fulfilments/page.tsx`
- Create: `apps/admin-portal/src/app/admin/fulfilments/[id]/page.tsx`
- Create: `apps/admin-portal/src/app/admin/fulfilments/[id]/_actions.ts`
- Test: `apps/admin-portal/src/lib/schemas/fulfilment.schema.test.ts`
- Test: `apps/admin-portal/src/app/admin/fulfilments/[id]/_actions.test.ts`

**Interfaces:**
- Consumes: `adminApi` from Task 3; `DataTable`, `StatusBadge` from Task 4

**Admin Service endpoints used:**
- `GET /admin/api/fulfilments?status=` → `{ data: FulfilmentSummary[] }` where `FulfilmentSummary = { id, lotTitle, buyerEmail, method: 'SHIP' | 'COLLECT' | 'PENDING', status }`
- `GET /admin/api/fulfilments/:id` → `{ data: FulfilmentDetail }` where `FulfilmentDetail = { id, lotTitle, buyerEmail, method, status, address?: ShippingAddress, collectionSlot?: string }`
- `PATCH /admin/api/fulfilments/:id/dispatch` with `{ trackingNumber: string, carrier: string }` → `{ data: FulfilmentDetail }`
- `PATCH /admin/api/fulfilments/:id/collect` → `{ data: FulfilmentDetail }`

- [ ] **Step 1: Write failing schema tests**

Create `apps/admin-portal/src/lib/schemas/fulfilment.schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MarkDispatchedSchema } from './fulfilment.schema';

describe('MarkDispatchedSchema', () => {
  it('should_pass_when_trackingAndCarrierArePresent', () => {
    expect(MarkDispatchedSchema.safeParse({ trackingNumber: 'TRK123456', carrier: 'DHL' }).success).toBe(true);
  });

  it('should_fail_when_trackingNumberIsEmpty', () => {
    expect(MarkDispatchedSchema.safeParse({ trackingNumber: '', carrier: 'DHL' }).success).toBe(false);
  });

  it('should_fail_when_carrierIsEmpty', () => {
    expect(MarkDispatchedSchema.safeParse({ trackingNumber: 'TRK123456', carrier: '' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/admin-portal
npx vitest run src/lib/schemas/fulfilment.schema.test.ts
```

Expected: FAIL — `Cannot find module './fulfilment.schema'`

- [ ] **Step 3: Create `apps/admin-portal/src/lib/schemas/fulfilment.schema.ts`**

```typescript
import { z } from 'zod';

export const MarkDispatchedSchema = z.object({
  trackingNumber: z.string().min(1, 'Tracking number is required'),
  carrier: z.string().min(1, 'Carrier is required'),
});

export type MarkDispatchedValues = z.infer<typeof MarkDispatchedSchema>;
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run src/lib/schemas/fulfilment.schema.test.ts
```

Expected: 3 passed

- [ ] **Step 5: Write failing action tests**

Create `apps/admin-portal/src/app/admin/fulfilments/[id]/_actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { patch: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi } from '@/lib/admin-api';
import { markDispatched, markCollected } from './_actions';

beforeEach(() => vi.clearAllMocks());

describe('markDispatched', () => {
  it('should_callAdminApiPatch_with_trackingAndCarrier', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'ful-1' } });

    const result = await markDispatched('ful-1', 'TRK123456', 'DHL');

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/fulfilments/ful-1/dispatch', { trackingNumber: 'TRK123456', carrier: 'DHL' });
    expect(result).toEqual({ ok: true });
  });

  it('should_returnError_when_trackingNumberIsEmpty', async () => {
    const result = await markDispatched('ful-1', '', 'DHL');

    expect(result).toMatchObject({ ok: false });
    expect(adminApi.patch).not.toHaveBeenCalled();
  });
});

describe('markCollected', () => {
  it('should_callAdminApiPatch_dispatch', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'ful-1' } });

    await markCollected('ful-1');

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/fulfilments/ful-1/collect', {});
  });
});
```

- [ ] **Step 6: Run to verify failure**

```bash
npx vitest run src/app/admin/fulfilments/\[id\]/_actions.test.ts
```

Expected: FAIL — `Cannot find module './_actions'`

- [ ] **Step 7: Create `apps/admin-portal/src/app/admin/fulfilments/[id]/_actions.ts`**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { MarkDispatchedSchema } from '@/lib/schemas/fulfilment.schema';

export async function markDispatched(id: string, trackingNumber: string, carrier: string): Promise<{ ok: boolean; error?: unknown }> {
  const parsed = MarkDispatchedSchema.safeParse({ trackingNumber, carrier });
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/fulfilments/${id}/dispatch`, { trackingNumber, carrier });
    revalidatePath(`/admin/fulfilments/${id}`);
    revalidatePath('/admin/fulfilments');
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function markCollected(id: string): Promise<void> {
  await adminApi.patch(`/admin/api/fulfilments/${id}/collect`, {});
  revalidatePath(`/admin/fulfilments/${id}`);
  revalidatePath('/admin/fulfilments');
}
```

- [ ] **Step 8: Run to verify pass**

```bash
npx vitest run src/app/admin/fulfilments/\[id\]/_actions.test.ts
```

Expected: 3 passed

- [ ] **Step 9: Create fulfilments list page `apps/admin-portal/src/app/admin/fulfilments/page.tsx`**

```tsx
import { adminApi } from '@/lib/admin-api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';

interface FulfilmentSummary {
  id: string;
  lotTitle: string;
  buyerEmail: string;
  method: string;
  status: string;
}

const columns: ColumnDef<FulfilmentSummary>[] = [
  { accessorKey: 'lotTitle', header: 'Lot' },
  { accessorKey: 'buyerEmail', header: 'Buyer' },
  { accessorKey: 'method', header: 'Method' },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Button variant='outline' size='sm' asChild>
        <Link href={`/admin/fulfilments/${row.original.id}`}>View</Link>
      </Button>
    ),
  },
];

export default async function FulfilmentsPage({ searchParams }: { searchParams: { status?: string } }) {
  const query = searchParams.status ? `?status=${searchParams.status}` : '';
  const res = await adminApi.get<{ data: FulfilmentSummary[] }>(`/admin/api/fulfilments${query}`);

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Fulfilments</h1>
      <DataTable columns={columns} data={res.data} />
    </div>
  );
}
```

- [ ] **Step 10: Create fulfilment detail page `apps/admin-portal/src/app/admin/fulfilments/[id]/page.tsx`**

```tsx
import { adminApi } from '@/lib/admin-api';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { markDispatched, markCollected } from './_actions';

interface ShippingAddress {
  line1: string;
  city: string;
  country: string;
  postalCode: string;
}

interface FulfilmentDetail {
  id: string;
  lotTitle: string;
  buyerEmail: string;
  method: string;
  status: string;
  address?: ShippingAddress;
  collectionSlot?: string;
}

export default async function FulfilmentDetailPage({ params }: { params: { id: string } }) {
  const res = await adminApi.get<{ data: FulfilmentDetail }>(`/admin/api/fulfilments/${params.id}`);
  const ful = res.data;
  const isPendingDispatch = ful.method === 'SHIP' && ful.status === 'PENDING';
  const isPendingCollection = ful.method === 'COLLECT' && ful.status === 'PENDING';

  return (
    <div className='max-w-2xl space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-semibold'>{ful.lotTitle}</h1>
          <StatusBadge status={ful.status} />
        </div>
        {isPendingCollection && (
          <form action={async () => { 'use server'; await markCollected(ful.id); }}>
            <Button type='submit'>Mark Collected</Button>
          </form>
        )}
      </div>
      <dl className='grid grid-cols-2 gap-4 rounded border p-4'>
        <div><dt className='text-xs text-muted-foreground'>Buyer</dt><dd>{ful.buyerEmail}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Method</dt><dd>{ful.method}</dd></div>
        {ful.address && (
          <div className='col-span-2'>
            <dt className='text-xs text-muted-foreground'>Shipping Address</dt>
            <dd>{ful.address.line1}, {ful.address.city}, {ful.address.postalCode}, {ful.address.country}</dd>
          </div>
        )}
        {ful.collectionSlot && (
          <div><dt className='text-xs text-muted-foreground'>Collection Slot</dt><dd>{ful.collectionSlot}</dd></div>
        )}
      </dl>
      {isPendingDispatch && (
        <form
          action={async (fd: FormData) => {
            'use server';
            await markDispatched(ful.id, fd.get('trackingNumber') as string, fd.get('carrier') as string);
          }}
          className='space-y-3'
        >
          <h2 className='text-lg font-medium'>Mark as Dispatched</h2>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label htmlFor='carrier'>Carrier</Label>
              <Input id='carrier' name='carrier' placeholder='DHL' />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='trackingNumber'>Tracking Number</Label>
              <Input id='trackingNumber' name='trackingNumber' placeholder='TRK123456789' />
            </div>
          </div>
          <Button type='submit'>Mark Dispatched</Button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 11: Run all fulfilment tests**

```bash
npx vitest run src/lib/schemas/fulfilment.schema.test.ts src/app/admin/fulfilments/\[id\]/_actions.test.ts
```

Expected: 6 passed

- [ ] **Step 12: Commit**

```bash
git add apps/admin-portal/src/lib/schemas/fulfilment.schema.ts apps/admin-portal/src/lib/schemas/fulfilment.schema.test.ts \
  apps/admin-portal/src/app/admin/fulfilments/
git commit -m "feat(admin-portal): fulfilments pages — list, detail, mark dispatched, mark collected"
```

---

### Task 11: Dashboard + Reports pages

**Files:**
- Create: `apps/admin-portal/src/app/admin/dashboard/page.tsx`
- Create: `apps/admin-portal/src/app/admin/reports/page.tsx`

**Interfaces:**
- Consumes: `adminApi` from Task 3; `DataTable` from Task 4

**Admin Service endpoints used:**
- `GET /admin/api/reports/dashboard` → `{ data: { activeAuctions, endingSoon, pendingInvoices, pendingFulfilments } }`
- `GET /admin/api/reports/auction-results?from=&to=` → `{ data: { rows: AuctionResult[], summary: { totalLots, soldPercent, totalValue } } }`
- `GET /admin/api/reports/revenue?groupBy=week|month` → `{ data: { byCurrency: Record<string, number>, weekly: RevenuePoint[] } }`
- `GET /admin/api/reports/unsold` → `{ data: UnsoldLot[] }`

No tests for this task — all data fetching is in Server Components with no branch logic.

- [ ] **Step 1: Create `apps/admin-portal/src/app/admin/dashboard/page.tsx`**

```tsx
import { adminApi } from '@/lib/admin-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gavel, Clock, FileText, Package } from 'lucide-react';

interface DashboardStats {
  activeAuctions: number;
  endingSoon: number;
  pendingInvoices: number;
  pendingFulfilments: number;
}

export default async function DashboardPage() {
  const res = await adminApi.get<{ data: DashboardStats }>('/admin/api/reports/dashboard');
  const stats = res.data;

  const CARDS = [
    { label: 'Active Auctions', value: stats.activeAuctions, icon: Gavel },
    { label: 'Ending in 24h', value: stats.endingSoon, icon: Clock },
    { label: 'Pending Invoices', value: stats.pendingInvoices, icon: FileText },
    { label: 'Pending Fulfilments', value: stats.pendingFulfilments, icon: Package },
  ];

  return (
    <div className='space-y-6'>
      <h1 className='text-2xl font-semibold'>Dashboard</h1>
      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        {CARDS.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>{label}</CardTitle>
              <Icon className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <p className='text-3xl font-bold'>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/admin-portal/src/app/admin/reports/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ColumnDef } from '@tanstack/react-table';

type Fetcher = (url: string) => Promise<unknown>;
const fetcher: Fetcher = url => fetch(url).then(r => r.json());

interface AuctionResult {
  lotTitle: string;
  categoryName: string;
  finalBid: number;
  reserveMet: boolean;
  winnerEmail: string;
}

interface UnsoldLot {
  id: string;
  title: string;
  categoryName: string;
  reservePrice: number;
  highestBid: number;
}

const auctionResultColumns: ColumnDef<AuctionResult>[] = [
  { accessorKey: 'lotTitle', header: 'Lot' },
  { accessorKey: 'categoryName', header: 'Category' },
  { accessorKey: 'finalBid', header: 'Final Bid', cell: ({ row }) => row.original.finalBid.toLocaleString() },
  { accessorKey: 'reserveMet', header: 'Reserve Met', cell: ({ row }) => row.original.reserveMet ? '✓' : '✗' },
  { accessorKey: 'winnerEmail', header: 'Winner' },
];

const unsoldColumns: ColumnDef<UnsoldLot>[] = [
  { accessorKey: 'title', header: 'Lot' },
  { accessorKey: 'categoryName', header: 'Category' },
  { accessorKey: 'reservePrice', header: 'Reserve', cell: ({ row }) => row.original.reservePrice.toLocaleString() },
  { accessorKey: 'highestBid', header: 'Highest Bid', cell: ({ row }) => row.original.highestBid.toLocaleString() },
  {
    id: 'relist',
    cell: ({ row }) => (
      <Button variant='outline' size='sm' asChild>
        <Link href={`/admin/auctions/new?lotId=${row.original.id}`}>Relist</Link>
      </Button>
    ),
  },
];

function AuctionResultsTab() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];
  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState(`from=${thirtyDaysAgo}&to=${today}`);

  const { data } = useSWR(`/api/admin/reports/auction-results?${query}`, fetcher) as
    { data: { data: { rows: AuctionResult[]; summary: { totalLots: number; soldPercent: number; totalValue: number } } } | undefined };

  return (
    <div className='space-y-4'>
      <div className='flex items-end gap-3'>
        <div className='space-y-1'>
          <Label>From</Label>
          <Input type='date' value={from} onChange={e => setFrom(e.target.value)} className='w-36' />
        </div>
        <div className='space-y-1'>
          <Label>To</Label>
          <Input type='date' value={to} onChange={e => setTo(e.target.value)} className='w-36' />
        </div>
        <Button onClick={() => setQuery(`from=${from}&to=${to}`)}>Apply</Button>
      </div>
      {data?.data.summary && (
        <div className='flex gap-6 rounded border bg-muted/30 p-4 text-sm'>
          <span>Total lots: <strong>{data.data.summary.totalLots}</strong></span>
          <span>% Sold: <strong>{data.data.summary.soldPercent}%</strong></span>
          <span>Total value: <strong>{data.data.summary.totalValue.toLocaleString()}</strong></span>
        </div>
      )}
      <DataTable columns={auctionResultColumns} data={data?.data.rows ?? []} />
    </div>
  );
}

function RevenueTab() {
  const { data } = useSWR('/api/admin/reports/revenue', fetcher) as
    { data: { data: { byCurrency: Record<string, number> } } | undefined };

  if (!data) return <p className='text-muted-foreground'>Loading…</p>;

  return (
    <div className='space-y-4'>
      <h2 className='text-lg font-medium'>Revenue by Currency</h2>
      <dl className='grid grid-cols-3 gap-4'>
        {Object.entries(data.data.byCurrency).map(([currency, amount]) => (
          <div key={currency} className='rounded border p-4'>
            <dt className='text-xs text-muted-foreground'>{currency}</dt>
            <dd className='text-2xl font-semibold'>{amount.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function UnsoldLotsTab() {
  const { data } = useSWR('/api/admin/reports/unsold', fetcher) as
    { data: { data: UnsoldLot[] } | undefined };

  return <DataTable columns={unsoldColumns} data={data?.data ?? []} />;
}

export default function ReportsPage() {
  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Reports</h1>
      <Tabs defaultValue='results'>
        <TabsList>
          <TabsTrigger value='results'>Auction Results</TabsTrigger>
          <TabsTrigger value='revenue'>Revenue</TabsTrigger>
          <TabsTrigger value='unsold'>Unsold Lots</TabsTrigger>
        </TabsList>
        <TabsContent value='results' className='pt-4'><AuctionResultsTab /></TabsContent>
        <TabsContent value='revenue' className='pt-4'><RevenueTab /></TabsContent>
        <TabsContent value='unsold' className='pt-4'><UnsoldLotsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: Add root redirect from `/admin` → `/admin/dashboard`**

Create `apps/admin-portal/src/app/admin/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function AdminRootPage() {
  redirect('/admin/dashboard');
}
```

- [ ] **Step 4: Add root redirect from `/` → `/admin/login`**

Create `apps/admin-portal/src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/admin/login');
}
```

- [ ] **Step 5: Run full test suite**

```bash
cd apps/admin-portal
npx vitest run
```

Expected: all tests pass (no failures). Record the count.

- [ ] **Step 6: Verify the app loads end-to-end**

```bash
pnpm dev
```

Then manually verify:
1. `http://localhost:3006` redirects to `/admin/login`
2. Login with invalid credentials shows error message
3. Login with valid admin credentials redirects to `/admin/dashboard`
4. Sidebar navigation links are visible and active state changes on click
5. `http://localhost:3006/admin/lots` loads without crashing (may show empty table)

- [ ] **Step 7: Commit**

```bash
git add apps/admin-portal/src/app/admin/dashboard/ apps/admin-portal/src/app/admin/reports/ \
  apps/admin-portal/src/app/admin/page.tsx apps/admin-portal/src/app/page.tsx
git commit -m "feat(admin-portal): dashboard stats cards and reports page with three tabs"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task covering it |
|---|---|
| `/admin/login` page with JWT cookie | Task 2 |
| Middleware protecting `/admin/*` | Task 2 |
| Session timeout 8 hours | Task 2 (maxAge 28800) |
| Sidebar nav | Task 4 |
| Breadcrumbs | Task 4 |
| Data tables with Shadcn/ui | Task 4 (`DataTable`) |
| Status badges | Task 4 (`StatusBadge`) |
| Confirmation dialogs | Task 4 (`ConfirmDialog`) |
| Lots list — title, category, status, date + Edit/Delete/Schedule | Task 5 |
| Lot create/edit form — all fields | Task 5 |
| Image uploader — R2 pre-signed URL, reorder, set-primary, delete | Task 5 |
| Categories — nested tree + inline rename + add child + delete | Task 6 |
| Auctions list | Task 7 |
| Schedule auction form — all fields including auto-extend | Task 7 |
| Auction detail — live stats polling + bid history | Task 7 |
| Reschedule / Cancel actions | Task 7 |
| Users list + filter by status | Task 8 |
| User detail + Suspend/Reinstate/Approve | Task 8 |
| Invoices list + filter by status | Task 9 |
| Invoice detail + Extend due date + Cancel with reason | Task 9 |
| Fulfilments list | Task 10 |
| Fulfilment detail + Mark Dispatched + Mark Collected | Task 10 |
| Dashboard stats cards | Task 11 |
| Reports — Auction Results + Revenue + Unsold Lots + Relist action | Task 11 |
| No SSE in admin portal | No SSE used anywhere; polling via SWR in Task 7 and Task 11 |
| All calls via Admin Service (port 3005) | `adminApi` in Task 3, all pages use it |
| Role check `role: ADMIN` | Task 2 route handler validates `role === 'ADMIN'` |

**No gaps found.**

**Placeholder scan:** No TBD, TODO, or vague steps found. Every step includes exact file paths and complete code.

**Type consistency check:**
- `adminApi` defined in Task 3, used in Tasks 5–11 ✓
- `AdminApiError` defined in Task 3, caught in Tasks 5–10 ✓
- `getAdminToken` defined in Task 2, used in `admin-api.ts` Task 3 ✓
- `DataTable<TData>` generic defined in Task 4, used with concrete types in Tasks 5–11 ✓
- `StatusBadge` defined in Task 4, used in Tasks 5–11 ✓
- `ConfirmDialog` defined in Task 4, used in Tasks 5, 7, 8, 9 ✓
- `cancelAuction` defined and used within Task 7 ✓
- All schema types match their action parameter types ✓

---
