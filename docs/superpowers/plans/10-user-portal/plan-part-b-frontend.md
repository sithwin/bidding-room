# User Portal — Part B: Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete user-facing Next.js application for The Carat Room — public auction browsing, live bidding with SSE, identity registration wizard with Stripe card setup, and account management pages.

**Architecture:** Next.js 14 App Router. JWT access token stored in React context (memory only, XSS-safe). Refresh token in httpOnly cookie managed by Next.js middleware. SSE proxied through a Next.js route handler. Public pages are RSC with 60s revalidation. Account pages are client components with SWR polling.

**Tech Stack:** Next.js 14.2.4, Tailwind CSS, Shadcn/ui, React Hook Form, Zod, SWR, Stripe.js, Vitest + @testing-library/react.

## Global Constraints

- TypeScript strict mode, no implicit `any`
- Named exports only — no `export default` (except `layout.tsx`, `page.tsx`, `middleware.ts`, `route.ts` which Next.js requires as default exports)
- Single quotes for string literals; `const`/`let` only
- British English in copy: "authorise", "cancelled", "fulfilment"
- OzBid Heritage tokens: `--paper:#FFFFFF`, `--cream:#F5F5F4`, `--ink:#111111`, `--gold:#8a8a8a`, `--line:rgba(0,0,0,.13)`, `--mut:#777777`, canvas `#e7e5df`
- Fonts: Bodoni Moda (headings) + Mulish (UI) via `next/font/google`
- App port: **3000** (dev: `next dev -p 3000`)
- Package name: `@carat-room/user-portal`

---

## File Map

```
apps/user-portal/
  package.json
  tsconfig.json
  next.config.mjs
  tailwind.config.ts
  postcss.config.js
  vitest.config.ts
  src/
    middleware.ts                         — refresh token guard for /account/*
    app/
      layout.tsx                          — root layout: fonts, globals.css
      globals.css                         — OzBid tokens + Tailwind base
      page.tsx                            — Home (RSC, revalidate 60s)
      calendar/
        page.tsx                          — Auction Calendar (RSC)
      auctions/
        page.tsx                          — Browse & Search (client, SWR)
        [auctionId]/
          page.tsx                        — Sale Catalogue (RSC + SWR)
          lots/
            [lotId]/
              page.tsx                    — Lot Detail + Live Bidding
      sell/
        page.tsx                          — Valuation Enquiry form
      account/
        login/
          page.tsx                        — Sign In / Create Account split layout
        verify-email/
          page.tsx                        — Email verification landing
        verify-phone/
          page.tsx                        — Phone OTP (standalone)
        register-to-bid/
          page.tsx                        — 4-step wizard
        dashboard/
          page.tsx                        — Account Overview (SWR)
        bids/
          page.tsx                        — My Bids (SWR)
        watchlist/
          page.tsx                        — Watchlist (SWR)
        won/
          page.tsx                        — Won Lots (SWR)
        invoices/
          [id]/
            page.tsx                      — Invoice + payment
        fulfilments/
          [id]/
            page.tsx                      — Ship or Collect
      api/
        auth/
          refresh/
            route.ts                      — POST: proxy refresh to user-auth
        auctions/
          [lotId]/
            stream/
              route.ts                    — GET: SSE proxy to auction-engine
    components/
      layout/
        app-shell.tsx                     — theme context + class toggle
        header.tsx                        — light header (all standard pages)
        header-dark.tsx                   — dark header (live bidding state)
        account-shell.tsx                 — sidebar nav for /account/*
      primitives/
        lot-card.tsx
        countdown-timer.tsx
        bid-status-badge.tsx
        bid-confirmed-modal.tsx
        outbid-modal.tsx
        toast.tsx
    lib/
      api.ts                              — typed fetch (injects access token)
      auth-context.tsx                    — AuthContext, useAuth, token store
      stripe.ts                           — loadStripe singleton
    hooks/
      use-lot-sse.ts                      — EventSource hook for lot detail
```

---

### Task 1: Scaffold — package.json, tsconfig, next.config, tailwind, postcss, vitest

**Files:** Create all config files.

- [ ] **Step 1: Create `apps/user-portal/package.json`**

```json
{
  "name": "@carat-room/user-portal",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.10.0",
    "@radix-ui/react-dialog": "^1.1.17",
    "@radix-ui/react-label": "^2.1.10",
    "@radix-ui/react-select": "^2.3.1",
    "@radix-ui/react-separator": "^1.1.10",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.15",
    "@radix-ui/react-toast": "^1.2.17",
    "@stripe/react-stripe-js": "^2.7.3",
    "@stripe/stripe-js": "^4.1.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.395.0",
    "next": "14.2.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.80.0",
    "swr": "^2.2.5",
    "tailwind-merge": "^2.3.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.25.76"
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

- [ ] **Step 2: Create `apps/user-portal/tsconfig.json`**

```json
{
  "extends": "@carat-room/tsconfig/nextjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/user-portal/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    USER_SERVICE_URL:      process.env.USER_SERVICE_URL      ?? 'http://localhost:3001',
    CATALOGUE_SERVICE_URL: process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002',
    AUCTION_SERVICE_URL:   process.env.AUCTION_SERVICE_URL   ?? 'http://localhost:3003',
    PAYMENT_SERVICE_URL:   process.env.PAYMENT_SERVICE_URL   ?? 'http://localhost:3004',
    SHIPPING_SERVICE_URL:  process.env.SHIPPING_SERVICE_URL  ?? 'http://localhost:3006',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  },
  images: { domains: ['pub-placeholder.r2.dev'] },
};

export default nextConfig;
```

- [ ] **Step 4: Create `apps/user-portal/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper:  '#FFFFFF',
        cream:  '#F5F5F4',
        ink:    '#111111',
        gold:   '#8a8a8a',
        mut:    '#777777',
        canvas: '#e7e5df',
      },
      fontFamily: {
        serif: ['var(--font-bodoni)', 'Georgia', 'serif'],
        sans:  ['var(--font-mulish)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

- [ ] **Step 5: Create `apps/user-portal/postcss.config.js`**

```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 6: Create `apps/user-portal/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], globals: true },
  resolve: { alias: { '@': resolve(__dirname, './src') } },
});
```

- [ ] **Step 7: Create `apps/user-portal/src/test-setup.ts`**

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 8: Install and commit**

```bash
pnpm install
git add apps/user-portal/package.json apps/user-portal/tsconfig.json apps/user-portal/next.config.mjs apps/user-portal/tailwind.config.ts apps/user-portal/postcss.config.js apps/user-portal/vitest.config.ts apps/user-portal/src/test-setup.ts
git commit -m "feat(user-portal): scaffold config files"
```

---

### Task 2: Global styles + root layout

**Files:**
- Create: `apps/user-portal/src/app/globals.css`
- Create: `apps/user-portal/src/app/layout.tsx`

- [ ] **Step 1: Create `apps/user-portal/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --paper:  #FFFFFF;
    --cream:  #F5F5F4;
    --ink:    #111111;
    --gold:   #8a8a8a;
    --line:   rgba(0, 0, 0, 0.13);
    --mut:    #777777;
    --canvas: #e7e5df;
  }

  * { box-sizing: border-box; }

  body {
    background-color: var(--canvas);
    color: var(--ink);
    font-family: var(--font-mulish), system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-bodoni), Georgia, serif;
  }
}

.theme-live {
  --paper:  #111111;
  --cream:  #1a1a1a;
  --ink:    #FFFFFF;
  --gold:   #c9a84c;
  --line:   rgba(255, 255, 255, 0.13);
  --mut:    #999999;
  background-color: var(--paper);
  color: var(--ink);
  transition: background-color 0.4s ease, color 0.4s ease;
}
```

- [ ] **Step 2: Create `apps/user-portal/src/app/layout.tsx`**

```typescript
import type { Metadata } from 'next';
import { Bodoni_Moda, Mulish } from 'next/font/google';
import './globals.css';

const bodoni = Bodoni_Moda({
  subsets: ['latin'],
  axes: ['opsz'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-bodoni',
  display: 'swap',
});

const mulish = Mulish({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-mulish',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'The Carat Room — Fine Auction House',
  description: 'Bid with confidence on the finest collections in Australia.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en' className={`${bodoni.variable} ${mulish.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/user-portal/src/app/globals.css apps/user-portal/src/app/layout.tsx
git commit -m "feat(user-portal): global styles with OzBid Heritage tokens and root layout"
```

---

### Task 3: AuthContext — token memory store

**Files:**
- Create: `apps/user-portal/src/lib/auth-context.tsx`
- Create: `apps/user-portal/src/lib/auth-context.test.tsx`

**Interfaces:**
- Produces: `AuthProvider` (wrap in root layout), `useAuth()` → `{ user, accessToken, login, logout, setAccessToken }`
- `user`: `{ userId, email, verificationStatus, role } | null`
- `login(accessToken, user)` — stores token in memory
- `logout()` — clears token, calls `DELETE /api/auth/refresh` to clear cookie

- [ ] **Step 1: Write failing test**

```typescript
// apps/user-portal/src/lib/auth-context.test.tsx
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth-context';

function TestConsumer() {
  const { user, login, logout } = useAuth();
  return (
    <div>
      <span data-testid='user'>{user ? user.email : 'none'}</span>
      <button onClick={() => login('tok123', { userId: 'u1', email: 'a@b.com', verificationStatus: 'APPROVED_BIDDER', role: 'BUYER' })}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  it('starts with no user', () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('stores user after login', async () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await act(async () => { screen.getByText('login').click(); });
    expect(screen.getByTestId('user')).toHaveTextContent('a@b.com');
  });

  it('clears user after logout', async () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await act(async () => { screen.getByText('login').click(); });
    await act(async () => { screen.getByText('logout').click(); });
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm turbo test --filter=user-portal
```

- [ ] **Step 3: Implement `apps/user-portal/src/lib/auth-context.tsx`**

```typescript
'use client';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface AuthUser {
  userId: string;
  email: string;
  verificationStatus: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);

  const login = useCallback((token: string, u: AuthUser) => {
    setAccessTokenState(token);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    setAccessTokenState(null);
    setUser(null);
    await fetch('/api/auth/refresh', { method: 'DELETE' });
  }, []);

  const setAccessToken = useCallback((token: string) => {
    setAccessTokenState(token);
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout, setAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Add `AuthProvider` to root layout**

In `apps/user-portal/src/app/layout.tsx`, wrap children:
```typescript
import { AuthProvider } from '@/lib/auth-context';
// inside body:
<AuthProvider>{children}</AuthProvider>
```

- [ ] **Step 5: Run tests**

```bash
pnpm turbo test --filter=user-portal
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/user-portal/src/lib/auth-context.tsx apps/user-portal/src/lib/auth-context.test.tsx apps/user-portal/src/app/layout.tsx
git commit -m "feat(user-portal): AuthContext with in-memory token store"
```

---

### Task 4: API client + middleware

**Files:**
- Create: `apps/user-portal/src/lib/api.ts`
- Create: `apps/user-portal/src/middleware.ts`
- Create: `apps/user-portal/src/app/api/auth/refresh/route.ts`

**Interfaces:**
- `api.ts` — exports `createApi(getToken)` returning `{ get, post, patch, delete }`. Used in client components via `useAuth().accessToken`.
- `middleware.ts` — on `/account/*`, reads refresh-token cookie, calls user-auth `/api/users/refresh`, on success injects new access token via header (read by client `AuthProvider` on mount via `/api/auth/refresh` GET route).
- Route handler `/api/auth/refresh` — GET: calls user-auth refresh, returns new access token to client. DELETE: clears cookie.

- [ ] **Step 1: Create `apps/user-portal/src/lib/api.ts`**

```typescript
export class ApiError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`API error ${status}`);
  }
}

type GetToken = () => string | null;

async function request<T>(method: string, path: string, getToken: GetToken, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

export function createApi(getToken: GetToken) {
  return {
    get:    <T>(path: string) => request<T>('GET', path, getToken),
    post:   <T>(path: string, body: unknown) => request<T>('POST', path, getToken, body),
    patch:  <T>(path: string, body: unknown) => request<T>('PATCH', path, getToken, body),
    delete: <T>(path: string) => request<T>('DELETE', path, getToken),
  };
}
```

- [ ] **Step 2: Create `apps/user-portal/src/middleware.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
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

- [ ] **Step 3: Create `apps/user-portal/src/app/api/auth/refresh/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';

export async function GET() {
  const cookieStore = cookies();
  const refreshToken = cookieStore.get('refresh_token')?.value;
  if (!refreshToken) return NextResponse.json({ error: 'No refresh token' }, { status: 401 });

  const res = await fetch(`${USER_SERVICE_URL}/api/users/refresh`, {
    method: 'POST',
    headers: { 'Cookie': `refresh_token=${refreshToken}` },
    cache: 'no-store',
  });

  if (!res.ok) return NextResponse.json({ error: 'Refresh failed' }, { status: 401 });

  const data = await res.json() as { accessToken: string; user: unknown };
  return NextResponse.json(data);
}

export async function DELETE() {
  const cookieStore = cookies();
  const refreshToken = cookieStore.get('refresh_token')?.value;
  if (refreshToken) {
    await fetch(`${USER_SERVICE_URL}/api/users/logout`, {
      method: 'POST',
      headers: { 'Cookie': `refresh_token=${refreshToken}` },
    });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('refresh_token');
  return res;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/user-portal/src/lib/api.ts apps/user-portal/src/middleware.ts apps/user-portal/src/app/api/
git commit -m "feat(user-portal): API client, middleware refresh guard, auth route handlers"
```

---

### Task 5: AppShell + Header components

**Files:**
- Create: `apps/user-portal/src/components/layout/app-shell.tsx`
- Create: `apps/user-portal/src/components/layout/header.tsx`
- Create: `apps/user-portal/src/components/layout/header-dark.tsx`

**Interfaces:**
- `AppShell` — wraps page content; accepts `isLive?: boolean` prop. Adds `theme-live` class to a wrapper div when `isLive` is true, enabling the dark live-bidding theme via CSS custom properties.
- `Header` — light variant; shows wordmark, nav links (Auctions / Calendar / Sell), and user avatar or Sign In link.
- `HeaderDark` — same structure on `var(--ink)` background.

- [ ] **Step 1: Create `apps/user-portal/src/components/layout/app-shell.tsx`**

```typescript
'use client';
import { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
  isLive?: boolean;
}

export function AppShell({ children, isLive = false }: AppShellProps) {
  return (
    <div className={isLive ? 'theme-live min-h-screen' : 'min-h-screen bg-canvas'}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/user-portal/src/components/layout/header.tsx`**

```typescript
import Link from 'next/link';

export function Header() {
  return (
    <header className='bg-paper border-b border-[var(--line)] px-6 py-4'>
      <div className='max-w-7xl mx-auto flex items-center justify-between'>
        <Link href='/' className='font-serif text-xl font-semibold tracking-wide text-ink'>
          The Carat Room
        </Link>
        <nav className='hidden md:flex items-center gap-8 font-sans text-sm font-medium text-mut'>
          <Link href='/auctions' className='hover:text-ink transition-colors'>Auctions</Link>
          <Link href='/calendar' className='hover:text-ink transition-colors'>Calendar</Link>
          <Link href='/sell' className='hover:text-ink transition-colors'>Sell</Link>
        </nav>
        <div className='flex items-center gap-4'>
          <Link href='/account/login' className='font-sans text-sm font-medium text-ink border border-[var(--line)] px-4 py-2 hover:bg-cream transition-colors'>
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create `apps/user-portal/src/components/layout/header-dark.tsx`**

```typescript
import Link from 'next/link';

export function HeaderDark() {
  return (
    <header className='bg-ink border-b border-[var(--line)] px-6 py-4'>
      <div className='max-w-7xl mx-auto flex items-center justify-between'>
        <Link href='/' className='font-serif text-xl font-semibold tracking-wide text-paper'>
          The Carat Room
        </Link>
        <nav className='hidden md:flex items-center gap-8 font-sans text-sm font-medium text-[var(--mut)]'>
          <Link href='/auctions' className='hover:text-paper transition-colors'>Auctions</Link>
          <Link href='/calendar' className='hover:text-paper transition-colors'>Calendar</Link>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/user-portal/src/components/layout/
git commit -m "feat(user-portal): AppShell, Header, and HeaderDark layout components"
```

---

### Task 6: AccountShell + shared primitives

**Files:**
- Create: `apps/user-portal/src/components/layout/account-shell.tsx`
- Create: `apps/user-portal/src/components/primitives/lot-card.tsx`
- Create: `apps/user-portal/src/components/primitives/countdown-timer.tsx`
- Create: `apps/user-portal/src/components/primitives/bid-status-badge.tsx`
- Create: `apps/user-portal/src/components/primitives/bid-confirmed-modal.tsx`
- Create: `apps/user-portal/src/components/primitives/outbid-modal.tsx`
- Create: `apps/user-portal/src/components/primitives/toast.tsx`

- [ ] **Step 1: Create `apps/user-portal/src/components/layout/account-shell.tsx`**

```typescript
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

const NAV = [
  { href: '/account/dashboard', label: 'Overview' },
  { href: '/account/bids',      label: 'My Bids' },
  { href: '/account/watchlist', label: 'Watchlist' },
  { href: '/account/won',       label: 'Won Lots' },
  { href: '/account/invoices',  label: 'Invoices & Payments' },
];

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className='max-w-7xl mx-auto px-6 py-10 flex gap-10'>
      <aside className='w-56 shrink-0'>
        <nav className='flex flex-col gap-1'>
          {NAV.map(({ href, label }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`font-sans text-sm px-4 py-2 rounded transition-colors ${isActive ? 'bg-ink text-paper font-medium' : 'text-mut hover:text-ink'}`}>
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className='flex-1 min-w-0'>{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/user-portal/src/components/primitives/countdown-timer.tsx`**

```typescript
'use client';
import { useEffect, useState } from 'react';

function formatMs(ms: number): string {
  if (ms <= 0) return '0:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CountdownTimer({ endAt }: { endAt: string | Date }) {
  const end = new Date(endAt).getTime();
  const [remaining, setRemaining] = useState(() => end - Date.now());

  useEffect(() => {
    const interval = setInterval(() => setRemaining(end - Date.now()), 1000);
    return () => clearInterval(interval);
  }, [end]);

  const isUrgent = remaining <= 3 * 60 * 1000;

  return (
    <span className={`font-sans tabular-nums text-sm font-medium ${isUrgent ? 'text-red-600' : 'text-ink'}`}>
      {formatMs(remaining)}
    </span>
  );
}
```

- [ ] **Step 3: Create `apps/user-portal/src/components/primitives/lot-card.tsx`**

```typescript
import Link from 'next/link';
import Image from 'next/image';
import { CountdownTimer } from './countdown-timer';

export interface LotCardProps {
  lotId: string;
  auctionId: string;
  lotNumber: string;
  title: string;
  imageUrl: string;
  currentBid: number;
  currency: string;
  endAt: string;
}

export function LotCard({ lotId, auctionId, lotNumber, title, imageUrl, currentBid, currency, endAt }: LotCardProps) {
  const href = `/auctions/${auctionId}/lots/${lotId}`;
  return (
    <Link href={href} className='group block bg-paper border border-[var(--line)] overflow-hidden hover:shadow-md transition-shadow'>
      <div className='relative overflow-hidden aspect-square'>
        <Image src={imageUrl} alt={title} fill className='object-cover group-hover:scale-105 transition-transform duration-300' />
      </div>
      <div className='p-4'>
        <p className='font-sans text-xs text-mut mb-1'>Lot {lotNumber}</p>
        <p className='font-serif text-sm font-medium text-ink leading-snug line-clamp-2 mb-3'>{title}</p>
        <div className='flex items-center justify-between'>
          <div>
            <p className='font-sans text-[10px] text-mut uppercase tracking-wider'>Current bid</p>
            <p className='font-sans text-sm font-semibold text-ink'>{currency.toUpperCase()} {currentBid.toLocaleString()}</p>
          </div>
          <CountdownTimer endAt={endAt} />
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Create `apps/user-portal/src/components/primitives/bid-status-badge.tsx`**

```typescript
type Status = 'leading' | 'outbid' | 'closed';

export function BidStatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    leading: 'bg-green-100 text-green-800',
    outbid:  'bg-red-100 text-red-800',
    closed:  'bg-gray-100 text-gray-600',
  };
  const labels: Record<Status, string> = {
    leading: 'Leading',
    outbid:  'Outbid',
    closed:  'Closed',
  };
  return (
    <span className={`inline-block font-sans text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
```

- [ ] **Step 5: Create `apps/user-portal/src/components/primitives/bid-confirmed-modal.tsx`**

```typescript
'use client';

interface Props {
  amount: number;
  currency: string;
  lotTitle: string;
  onClose: () => void;
}

export function BidConfirmedModal({ amount, currency, lotTitle, onClose }: Props) {
  return (
    <div className='fixed inset-0 bg-ink/60 flex items-center justify-center z-50' onClick={onClose}>
      <div className='bg-paper p-8 max-w-sm w-full mx-4 text-center' onClick={e => e.stopPropagation()}>
        <div className='w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4'>
          <svg className='w-6 h-6 text-green-700' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
          </svg>
        </div>
        <h2 className='font-serif text-xl font-semibold text-ink mb-2'>You&apos;re the highest bidder</h2>
        <p className='font-sans text-mut text-sm mb-1'>{lotTitle}</p>
        <p className='font-sans text-2xl font-bold text-ink mb-6'>{currency.toUpperCase()} {amount.toLocaleString()}</p>
        <button onClick={onClose} className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 transition-colors'>
          Continue Browsing
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `apps/user-portal/src/components/primitives/outbid-modal.tsx`**

```typescript
'use client';

interface Props {
  yourBid: number;
  currentBid: number;
  currency: string;
  onBidAgain: (amount: number) => void;
  onClose: () => void;
}

export function OutbidModal({ yourBid, currentBid, currency, onBidAgain, onClose }: Props) {
  const suggested = currentBid + 100;
  return (
    <div className='fixed inset-0 bg-ink/60 flex items-center justify-center z-50' onClick={onClose}>
      <div className='bg-paper p-8 max-w-sm w-full mx-4 text-center' onClick={e => e.stopPropagation()}>
        <h2 className='font-serif text-xl font-semibold text-ink mb-2'>You&apos;ve been outbid</h2>
        <p className='font-sans text-sm text-mut line-through mb-1'>{currency.toUpperCase()} {yourBid.toLocaleString()}</p>
        <p className='font-sans text-2xl font-bold text-ink mb-6'>{currency.toUpperCase()} {currentBid.toLocaleString()}</p>
        <button onClick={() => onBidAgain(suggested)} className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 transition-colors mb-3'>
          Bid {currency.toUpperCase()} {suggested.toLocaleString()}
        </button>
        <button onClick={onClose} className='font-sans text-sm text-mut hover:text-ink'>Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `apps/user-portal/src/components/primitives/toast.tsx`**

```typescript
'use client';
import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'info' | 'error' | 'success';
  onDismiss: () => void;
}

export function Toast({ message, type = 'info', onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const colours = { info: 'bg-ink text-paper', error: 'bg-red-600 text-paper', success: 'bg-green-700 text-paper' };
  return (
    <div className={`fixed top-4 right-4 z-50 px-5 py-3 font-sans text-sm font-medium shadow-lg ${colours[type]}`}>
      {message}
    </div>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/user-portal/src/components/
git commit -m "feat(user-portal): AccountShell and shared primitives (LotCard, CountdownTimer, modals, toast)"
```

---

### Task 7: SSE route handler + useLotSse hook

**Files:**
- Create: `apps/user-portal/src/app/api/auctions/[lotId]/stream/route.ts`
- Create: `apps/user-portal/src/hooks/use-lot-sse.ts`

**Interfaces:**
- Route handler proxies GET to `AUCTION_SERVICE_URL/api/auctions/:lotId/stream`, streams SSE back to client.
- `useLotSse(lotId)` returns `{ lastEvent }` where `lastEvent` is the most recent parsed SSE event object.

- [ ] **Step 1: Create SSE proxy route handler**

```typescript
// apps/user-portal/src/app/api/auctions/[lotId]/stream/route.ts
import { NextRequest } from 'next/server';

const AUCTION_SERVICE_URL = process.env.AUCTION_SERVICE_URL ?? 'http://localhost:3003';

export async function GET(
  request: NextRequest,
  { params }: { params: { lotId: string } },
) {
  const upstream = await fetch(`${AUCTION_SERVICE_URL}/api/auctions/${params.lotId}/stream`, {
    headers: { Accept: 'text/event-stream' },
    signal: request.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response('Stream unavailable', { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}
```

- [ ] **Step 2: Create `apps/user-portal/src/hooks/use-lot-sse.ts`**

```typescript
'use client';
import { useEffect, useRef, useState } from 'react';

export type SseEvent =
  | { type: 'bid_placed';    lotId: string; currentBid: number; bidCount: number; bidderId: string }
  | { type: 'timer_extended'; lotId: string; endAt: string }
  | { type: 'closing_soon';  lotId: string }
  | { type: 'auction_closed'; lotId: string; result: 'SOLD' | 'UNSOLD' };

interface UseLotSseReturn {
  lastEvent: SseEvent | null;
  isConnected: boolean;
}

export function useLotSse(lotId: string): UseLotSseReturn {
  const [lastEvent, setLastEvent] = useState<SseEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const retryDelay = useRef(1000);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const es = new EventSource(`/api/auctions/${lotId}/stream`);
      esRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
        retryDelay.current = 1000;
      };

      es.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data) as SseEvent;
          setLastEvent(parsed);
        } catch { /* ignore malformed events */ }
      };

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        if (!cancelled) {
          setTimeout(() => {
            retryDelay.current = Math.min(retryDelay.current * 2, 30000);
            connect();
          }, retryDelay.current);
        }
      };
    }

    connect();
    return () => {
      cancelled = true;
      esRef.current?.close();
    };
  }, [lotId]);

  return { lastEvent, isConnected };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/user-portal/src/app/api/auctions/ apps/user-portal/src/hooks/
git commit -m "feat(user-portal): SSE proxy route handler and useLotSse hook"
```

---

### Task 8: Home page

**Files:**
- Create: `apps/user-portal/src/app/page.tsx`

**Pattern:** RSC, `revalidate = 60`. Fetches closing-soon lots from catalogue service and next 3 auctions. No client JS required.

- [ ] **Step 1: Create `apps/user-portal/src/app/page.tsx`**

```typescript
import { Header } from '@/components/layout/header';
import { LotCard } from '@/components/primitives/lot-card';
import Link from 'next/link';

export const revalidate = 60;

const CATALOGUE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';

async function getClosingSoonLots() {
  try {
    const res = await fetch(`${CATALOGUE_URL}/api/lots?status=open&sort=endAt&limit=8`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json() as { lots: Array<{ id: string; auctionId: string; lotNumber: string; title: string; imageUrl: string; currentBid: number; currency: string; endAt: string }> };
    return data.lots;
  } catch { return []; }
}

async function getUpcomingAuctions() {
  try {
    const res = await fetch(`${CATALOGUE_URL}/api/auctions?status=upcoming&limit=3`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json() as { auctions: Array<{ id: string; title: string; saleDate: string; lotCount: number }> };
    return data.auctions;
  } catch { return []; }
}

export default async function HomePage() {
  const [lots, auctions] = await Promise.all([getClosingSoonLots(), getUpcomingAuctions()]);

  return (
    <>
      <Header />
      {/* Hero */}
      <section className='bg-ink text-paper px-6 py-20 text-center'>
        <p className='font-sans text-xs uppercase tracking-widest text-gold mb-4'>Currently open</p>
        <h1 className='font-serif text-4xl md:text-6xl font-semibold mb-6'>Fine Jewellery &amp; Watches</h1>
        <Link href='/auctions' className='inline-block border border-paper font-sans text-sm px-8 py-3 hover:bg-paper hover:text-ink transition-colors'>
          View Catalogue
        </Link>
      </section>

      {/* Closing soon */}
      <section className='max-w-7xl mx-auto px-6 py-16'>
        <h2 className='font-serif text-2xl font-semibold text-ink mb-8'>Closing soon</h2>
        {lots.length === 0 ? (
          <p className='font-sans text-mut text-sm'>No lots currently open.</p>
        ) : (
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
            {lots.map(lot => <LotCard key={lot.id} {...lot} />)}
          </div>
        )}
      </section>

      {/* Upcoming auctions strip */}
      {auctions.length > 0 && (
        <section className='bg-cream border-t border-[var(--line)] px-6 py-12'>
          <div className='max-w-7xl mx-auto'>
            <h2 className='font-serif text-2xl font-semibold text-ink mb-6'>Upcoming Sales</h2>
            <div className='flex flex-col md:flex-row gap-4'>
              {auctions.map(a => (
                <div key={a.id} className='flex-1 bg-paper border border-[var(--line)] p-6'>
                  <p className='font-sans text-xs text-gold uppercase tracking-wider mb-2'>
                    {new Date(a.saleDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  <p className='font-serif text-lg font-semibold text-ink mb-1'>{a.title}</p>
                  <p className='font-sans text-sm text-mut'>{a.lotCount} lots</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/user-portal/src/app/page.tsx
git commit -m "feat(user-portal): home page with hero, closing-soon grid, and upcoming auctions"
```

---

### Task 9: Calendar + Browse pages

**Files:**
- Create: `apps/user-portal/src/app/calendar/page.tsx`
- Create: `apps/user-portal/src/app/auctions/page.tsx`

- [ ] **Step 1: Create `apps/user-portal/src/app/calendar/page.tsx`**

```typescript
import { Header } from '@/components/layout/header';
import Link from 'next/link';

export const revalidate = 60;

const CATALOGUE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';

type Auction = { id: string; title: string; saleDate: string; lotCount: number; status: 'upcoming' | 'open' | 'closed'; location: string };

async function getAuctions(): Promise<{ upcoming: Auction[]; live: Auction[]; results: Auction[] }> {
  try {
    const res = await fetch(`${CATALOGUE_URL}/api/auctions?limit=50`, { next: { revalidate: 60 } });
    if (!res.ok) return { upcoming: [], live: [], results: [] };
    const data = await res.json() as { auctions: Auction[] };
    return {
      upcoming: data.auctions.filter(a => a.status === 'upcoming'),
      live:     data.auctions.filter(a => a.status === 'open'),
      results:  data.auctions.filter(a => a.status === 'closed'),
    };
  } catch { return { upcoming: [], live: [], results: [] }; }
}

function AuctionRow({ auction }: { auction: Auction }) {
  const date = new Date(auction.saleDate);
  return (
    <div className='flex items-center gap-6 bg-paper border border-[var(--line)] p-5'>
      <div className='w-16 text-center shrink-0'>
        <p className='font-serif text-2xl font-semibold text-ink'>{date.getDate()}</p>
        <p className='font-sans text-xs text-mut uppercase'>{date.toLocaleString('en-AU', { month: 'short' })}</p>
      </div>
      <div className='flex-1 min-w-0'>
        <p className='font-serif text-base font-semibold text-ink truncate'>{auction.title}</p>
        <p className='font-sans text-sm text-mut'>{auction.lotCount} lots · {auction.location}</p>
      </div>
      {auction.status === 'open' ? (
        <Link href={`/auctions/${auction.id}`} className='shrink-0 bg-ink text-paper font-sans text-sm px-5 py-2 hover:bg-ink/90 transition-colors'>View Catalogue</Link>
      ) : (
        <button className='shrink-0 border border-[var(--line)] font-sans text-sm px-5 py-2 text-mut hover:text-ink transition-colors'>Register Interest</button>
      )}
    </div>
  );
}

export default async function CalendarPage() {
  const { upcoming, live, results } = await getAuctions();

  return (
    <>
      <Header />
      <div className='max-w-4xl mx-auto px-6 py-12'>
        <h1 className='font-serif text-3xl font-semibold text-ink mb-10'>Auction Calendar</h1>

        {live.length > 0 && (
          <section className='mb-10'>
            <h2 className='font-sans text-xs uppercase tracking-widest text-gold mb-4'>Live Now</h2>
            <div className='flex flex-col gap-3'>{live.map(a => <AuctionRow key={a.id} auction={a} />)}</div>
          </section>
        )}

        <section className='mb-10'>
          <h2 className='font-sans text-xs uppercase tracking-widest text-gold mb-4'>Upcoming</h2>
          {upcoming.length === 0 ? <p className='font-sans text-mut text-sm'>No upcoming auctions.</p>
            : <div className='flex flex-col gap-3'>{upcoming.map(a => <AuctionRow key={a.id} auction={a} />)}</div>}
        </section>

        <section>
          <h2 className='font-sans text-xs uppercase tracking-widest text-gold mb-4'>Results</h2>
          {results.length === 0 ? <p className='font-sans text-mut text-sm'>No past results yet.</p>
            : <div className='flex flex-col gap-3'>{results.map(a => <AuctionRow key={a.id} auction={a} />)}</div>}
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create `apps/user-portal/src/app/auctions/page.tsx`** (Browse & Search — client component with SWR + URL params)

```typescript
'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';
import { LotCard } from '@/components/primitives/lot-card';

type Lot = { id: string; auctionId: string; lotNumber: string; title: string; imageUrl: string; currentBid: number; currency: string; endAt: string };

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function BrowsePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const q      = searchParams.get('q') ?? '';
  const sort   = searchParams.get('sort') ?? 'endAt';
  const minPrice = searchParams.get('min') ?? '';
  const maxPrice = searchParams.get('max') ?? '';

  const params = new URLSearchParams({ sort, ...(q && { q }), ...(minPrice && { minPrice }), ...(maxPrice && { maxPrice }) });
  const { data, isLoading } = useSWR<{ lots: Lot[]; total: number }>(
    `/api/catalogue/lots?${params}`,
    fetcher,
    { refreshInterval: 15000 },
  );

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`/auctions?${next.toString()}`);
  }

  return (
    <>
      <Header />
      <div className='max-w-7xl mx-auto px-6 py-10 flex gap-8'>
        {/* Sidebar filters */}
        <aside className='w-56 shrink-0 hidden md:block'>
          <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-4'>Sort by</h3>
          {[['endAt','Ending Soonest'],['lotNumber','Lot Number'],['priceAsc','Price Low→High'],['priceDesc','Price High→Low']].map(([val, label]) => (
            <label key={val} className='flex items-center gap-2 font-sans text-sm text-ink mb-2 cursor-pointer'>
              <input type='radio' name='sort' value={val} checked={sort === val} onChange={() => setParam('sort', val)} />
              {label}
            </label>
          ))}
          <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-4 mt-6'>Price range</h3>
          <div className='flex gap-2'>
            <input type='number' placeholder='Min' value={minPrice} onChange={e => setParam('min', e.target.value)}
              className='w-full border border-[var(--line)] px-2 py-1 font-sans text-sm' />
            <input type='number' placeholder='Max' value={maxPrice} onChange={e => setParam('max', e.target.value)}
              className='w-full border border-[var(--line)] px-2 py-1 font-sans text-sm' />
          </div>
        </aside>

        {/* Results */}
        <div className='flex-1 min-w-0'>
          <div className='flex items-center justify-between mb-6'>
            <p className='font-sans text-sm text-mut'>{data?.total ?? '—'} lots found</p>
          </div>
          {isLoading ? (
            <p className='font-sans text-sm text-mut'>Loading…</p>
          ) : data?.lots.length === 0 ? (
            <p className='font-sans text-sm text-mut'>No lots match your filters.</p>
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              {data?.lots.map(lot => <LotCard key={lot.id} {...lot} />)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

Note: The Browse page calls `/api/catalogue/lots` — add this Next.js route handler to proxy to the catalogue service (same pattern as the SSE handler):

```typescript
// apps/user-portal/src/app/api/catalogue/lots/route.ts
import { NextRequest, NextResponse } from 'next/server';

const CATALOGUE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.search;
  const res = await fetch(`${CATALOGUE_URL}/api/lots${search}`, { cache: 'no-store' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/user-portal/src/app/calendar/ apps/user-portal/src/app/auctions/ apps/user-portal/src/app/api/catalogue/
git commit -m "feat(user-portal): calendar and browse/search pages"
```

---

### Task 10: Sale Catalogue + Lot Detail pages

**Files:**
- Create: `apps/user-portal/src/app/auctions/[auctionId]/page.tsx`
- Create: `apps/user-portal/src/app/auctions/[auctionId]/lots/[lotId]/page.tsx`

- [ ] **Step 1: Create Sale Catalogue page**

```typescript
// apps/user-portal/src/app/auctions/[auctionId]/page.tsx
import { Header } from '@/components/layout/header';
import { LotCard } from '@/components/primitives/lot-card';
import { notFound } from 'next/navigation';

export const revalidate = 30;

const CATALOGUE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';

type Lot = { id: string; auctionId: string; lotNumber: string; title: string; imageUrl: string; currentBid: number; currency: string; endAt: string };
type Auction = { id: string; title: string; saleDate: string; location: string; description: string };

export default async function SaleCataloguePage({ params }: { params: { auctionId: string } }) {
  const [auctionRes, lotsRes] = await Promise.all([
    fetch(`${CATALOGUE_URL}/api/auctions/${params.auctionId}`, { next: { revalidate: 30 } }),
    fetch(`${CATALOGUE_URL}/api/lots?auctionId=${params.auctionId}&sort=lotNumber&limit=100`, { next: { revalidate: 30 } }),
  ]);

  if (!auctionRes.ok) notFound();
  const auction = await auctionRes.json() as Auction;
  const { lots } = lotsRes.ok ? await lotsRes.json() as { lots: Lot[] } : { lots: [] };

  return (
    <>
      <Header />
      {/* Hero */}
      <section className='bg-ink text-paper px-6 py-16'>
        <div className='max-w-5xl mx-auto'>
          <p className='font-sans text-xs text-gold uppercase tracking-widest mb-3'>
            {new Date(auction.saleDate).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1 className='font-serif text-4xl font-semibold mb-2'>{auction.title}</h1>
          <p className='font-sans text-mut text-sm'>{auction.location}</p>
        </div>
      </section>

      {/* Action bar */}
      <div className='bg-cream border-b border-[var(--line)] px-6 py-4'>
        <div className='max-w-5xl mx-auto flex items-center gap-4'>
          <button className='bg-ink text-paper font-sans text-sm font-medium px-6 py-2 hover:bg-ink/90 transition-colors'>Register to Bid</button>
          <button className='border border-[var(--line)] font-sans text-sm px-6 py-2 text-ink hover:bg-paper transition-colors'>Download Catalogue</button>
        </div>
      </div>

      {/* Lot grid */}
      <div className='max-w-7xl mx-auto px-6 py-12'>
        <p className='font-sans text-sm text-mut mb-6'>{lots.length} lots</p>
        <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
          {lots.map(lot => <LotCard key={lot.id} {...lot} />)}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create Lot Detail page (standard + live states)**

```typescript
// apps/user-portal/src/app/auctions/[auctionId]/lots/[lotId]/page.tsx
import { notFound } from 'next/navigation';
import { LotDetailClient } from './lot-detail-client';

const CATALOGUE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';

type Lot = {
  id: string; auctionId: string; lotNumber: string; title: string;
  department: string; medium: string; dimensions: string; catalogueNumber: string;
  imageUrls: string[]; currentBid: number; bidCount: number; currency: string;
  endAt: string; estimate: string; provenance: string; status: string;
};

export default async function LotDetailPage({ params }: { params: { auctionId: string; lotId: string } }) {
  const res = await fetch(`${CATALOGUE_URL}/api/lots/${params.lotId}`, { cache: 'no-store' });
  if (!res.ok) notFound();
  const lot = await res.json() as Lot;

  return <LotDetailClient lot={lot} />;
}
```

- [ ] **Step 3: Create the client component for lot detail**

```typescript
// apps/user-portal/src/app/auctions/[auctionId]/lots/[lotId]/lot-detail-client.tsx
'use client';
import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Header } from '@/components/layout/header';
import { HeaderDark } from '@/components/layout/header-dark';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { BidConfirmedModal } from '@/components/primitives/bid-confirmed-modal';
import { OutbidModal } from '@/components/primitives/outbid-modal';
import { Toast } from '@/components/primitives/toast';
import { useLotSse } from '@/hooks/use-lot-sse';
import { useAuth } from '@/lib/auth-context';
import { createApi } from '@/lib/api';
import Image from 'next/image';

type Lot = {
  id: string; auctionId: string; lotNumber: string; title: string;
  department: string; medium: string; dimensions: string; catalogueNumber: string;
  imageUrls: string[]; currentBid: number; bidCount: number; currency: string;
  endAt: string; estimate: string; provenance: string; status: string;
};

export function LotDetailClient({ lot: initial }: { lot: Lot }) {
  const { user, accessToken } = useAuth();
  const api = createApi(() => accessToken);

  const [lot, setLot] = useState(initial);
  const [isLive, setIsLive] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [confirmedBid, setConfirmedBid] = useState<number | null>(null);
  const [outbidInfo, setOutbidInfo] = useState<{ yourBid: number; currentBid: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);

  const { lastEvent } = useLotSse(lot.id);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'bid_placed') {
      setLot(prev => ({ ...prev, currentBid: lastEvent.currentBid, bidCount: lastEvent.bidCount }));
      if (user && lastEvent.bidderId !== user.userId) {
        setOutbidInfo({ yourBid: lot.currentBid, currentBid: lastEvent.currentBid });
      }
    }
    if (lastEvent.type === 'timer_extended') setLot(prev => ({ ...prev, endAt: lastEvent.endAt }));
    if (lastEvent.type === 'closing_soon') setIsLive(true);
    if (lastEvent.type === 'auction_closed') setLot(prev => ({ ...prev, status: lastEvent.result }));
  }, [lastEvent]);

  async function placeBid() {
    const amount = Number(bidAmount);
    if (!amount || amount <= lot.currentBid) {
      setToast({ message: `Bid must exceed current bid of ${lot.currency.toUpperCase()} ${lot.currentBid.toLocaleString()}`, type: 'error' });
      return;
    }
    if (!user) { window.location.href = `/account/login?returnUrl=${encodeURIComponent(window.location.pathname)}`; return; }
    if (user.verificationStatus === 'PENDING_REVIEW') {
      setToast({ message: 'Your identity is under review. You\'ll be notified when approved.', type: 'info' }); return;
    }

    try {
      await api.post(`/api/auction/auctions/${lot.auctionId}/lots/${lot.id}/bids`, { amount });
      setConfirmedBid(amount);
      setBidAmount('');
    } catch {
      setToast({ message: 'Unable to place bid. Please try again.', type: 'error' });
    }
  }

  return (
    <AppShell isLive={isLive}>
      {isLive ? <HeaderDark /> : <Header />}

      {isLive ? (
        /* ── Live state ── */
        <div className='max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-2 gap-10'>
          <div>
            <div className='relative aspect-square border border-[var(--line)]'>
              <Image src={lot.imageUrls[selectedImage] ?? '/placeholder.jpg'} alt={lot.title} fill className='object-contain' />
              <div className='absolute top-3 left-3 bg-ink/80 text-paper font-sans text-xs px-3 py-1'>
                Lot {lot.lotNumber} · Now Selling
              </div>
            </div>
            <p className='font-serif text-lg font-semibold text-[var(--ink)] mt-4'>{lot.title}</p>
            <p className='font-sans text-sm text-[var(--mut)]'>Est. {lot.estimate}</p>
          </div>

          <div className='flex flex-col gap-6'>
            <div>
              <p className='font-sans text-xs text-[var(--mut)] uppercase tracking-widest mb-1'>Current Bid</p>
              <p className='font-serif text-5xl font-semibold text-[var(--ink)]'>
                {lot.currency.toUpperCase()} {lot.currentBid.toLocaleString()}
              </p>
            </div>

            <div className='text-center'>
              <p className='font-sans text-xs text-[var(--mut)] mb-1'>Time remaining</p>
              <CountdownTimer endAt={lot.endAt} />
            </div>

            <div>
              <input
                type='number' value={bidAmount} onChange={e => setBidAmount(e.target.value)}
                placeholder={`Min ${lot.currentBid + 100}`}
                className='w-full border border-[var(--line)] bg-transparent text-[var(--ink)] font-sans text-lg px-4 py-3 mb-3'
              />
              <button onClick={placeBid} className='w-full bg-[var(--ink)] text-paper font-sans font-semibold py-4 text-base hover:opacity-90 transition-opacity'>
                Bid {lot.currency.toUpperCase()} {bidAmount || '—'}
              </button>

              <div className='grid grid-cols-3 gap-2 mt-3'>
                {[2000, 4000].map(inc => (
                  <button key={inc} onClick={() => setBidAmount(String(lot.currentBid + inc))}
                    className='border border-[var(--line)] font-sans text-sm py-2 text-[var(--ink)] hover:bg-[var(--cream)]'>
                    +{(inc / 1000).toFixed(0)}k
                  </button>
                ))}
                <button onClick={() => setBidAmount('')} className='border border-[var(--line)] font-sans text-sm py-2 text-[var(--ink)] hover:bg-[var(--cream)]'>
                  Custom
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Standard state ── */
        <div className='max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-2 gap-10'>
          {/* Gallery */}
          <div>
            <div className='relative aspect-square border border-[var(--line)] mb-3'>
              <Image src={lot.imageUrls[selectedImage] ?? '/placeholder.jpg'} alt={lot.title} fill className='object-contain' />
            </div>
            {lot.imageUrls.length > 1 && (
              <div className='flex gap-2'>
                {lot.imageUrls.slice(0, 4).map((url, i) => (
                  <button key={i} onClick={() => setSelectedImage(i)}
                    className={`relative w-16 h-16 border-2 ${i === selectedImage ? 'border-ink' : 'border-[var(--line)]'}`}>
                    <Image src={url} alt='' fill className='object-cover' />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info + bid panel */}
          <div>
            <p className='font-sans text-xs text-gold uppercase tracking-widest mb-2'>{lot.department} · Lot {lot.lotNumber}</p>
            <h1 className='font-serif text-3xl font-semibold text-ink mb-3'>{lot.title}</h1>
            <p className='font-sans text-sm text-mut mb-6'>{lot.medium} · {lot.dimensions}</p>

            <div className='border border-[var(--line)] p-6 mb-4'>
              <div className='flex items-start justify-between mb-4'>
                <div>
                  <p className='font-sans text-xs text-mut uppercase tracking-wider mb-1'>Current Bid</p>
                  <p className='font-serif text-3xl font-semibold text-ink'>{lot.currency.toUpperCase()} {lot.currentBid.toLocaleString()}</p>
                  <p className='font-sans text-xs text-mut mt-1'>{lot.bidCount} bids</p>
                </div>
                <div className='text-right'>
                  <p className='font-sans text-xs text-mut uppercase tracking-wider mb-1'>Estimate</p>
                  <p className='font-sans text-sm text-ink'>{lot.estimate}</p>
                </div>
              </div>

              <div className='flex items-center gap-2 bg-cream px-3 py-2 mb-4'>
                <span className='inline-block w-2 h-2 rounded-full bg-ink'></span>
                <CountdownTimer endAt={lot.endAt} />
              </div>

              <input
                type='number' value={bidAmount} onChange={e => setBidAmount(e.target.value)}
                placeholder={`$ ${lot.currentBid + 100}`}
                className='w-full border border-[var(--line)] font-sans text-base px-4 py-3 mb-3'
              />
              <button onClick={placeBid} className='w-full bg-ink text-paper font-sans font-semibold py-3 hover:bg-ink/90 transition-colors'>
                Place Bid
              </button>
              <p className='font-sans text-xs text-mut mt-3 text-center'>22% buyer&apos;s premium applies</p>
            </div>

            <button onClick={() => setIsLive(true)} className='w-full border border-ink font-sans text-sm py-2 mb-6 hover:bg-cream transition-colors'>
              Enter Live Room
            </button>

            {lot.provenance && (
              <div>
                <p className='font-sans text-xs text-mut uppercase tracking-widest mb-2'>Provenance</p>
                <p className='font-sans text-sm text-ink'>{lot.provenance}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmedBid && (
        <BidConfirmedModal amount={confirmedBid} currency={lot.currency} lotTitle={lot.title} onClose={() => setConfirmedBid(null)} />
      )}
      {outbidInfo && (
        <OutbidModal {...outbidInfo} currency={lot.currency} onClose={() => setOutbidInfo(null)} onBidAgain={amount => { setBidAmount(String(amount)); setOutbidInfo(null); }} />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </AppShell>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/user-portal/src/app/auctions/
git commit -m "feat(user-portal): sale catalogue and lot detail pages with SSE live bidding"
```

---

### Task 11: Auth pages — Login, Verify Email, Verify Phone

**Files:**
- Create: `apps/user-portal/src/app/account/login/page.tsx`
- Create: `apps/user-portal/src/app/account/verify-email/page.tsx`
- Create: `apps/user-portal/src/app/account/verify-phone/page.tsx`

- [ ] **Step 1: Create `apps/user-portal/src/app/account/login/page.tsx`**

Split layout: dark left panel + tabbed form right (Sign In / Create Account).

```typescript
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/lib/auth-context';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
const registerSchema = z.object({ email: z.string().email(), password: z.string().min(8), confirmPassword: z.string() })
  .refine(d => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function LoginPage() {
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [serverError, setServerError] = useState('');
  const [registered, setRegistered] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') ?? '/account/dashboard';

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  async function handleLogin(data: LoginForm) {
    setServerError('');
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const json = await res.json() as { accessToken?: string; user?: { userId: string; email: string; verificationStatus: string; role: string }; error?: string };
    if (!res.ok) { setServerError(json.error ?? 'Sign in failed'); return; }
    login(json.accessToken!, json.user!);
    router.push(returnUrl);
  }

  async function handleRegister(data: RegisterForm) {
    setServerError('');
    const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.email, password: data.password }) });
    const json = await res.json() as { error?: string };
    if (!res.ok) { setServerError(json.error ?? 'Registration failed'); return; }
    setRegistered(true);
  }

  return (
    <div className='min-h-screen flex'>
      {/* Left panel */}
      <div className='hidden md:flex w-1/2 bg-ink text-paper flex-col justify-center px-16'>
        <p className='font-serif text-4xl font-semibold mb-6 leading-tight'>The Carat Room</p>
        <p className='font-sans text-lg text-mut mb-8'>Bid with confidence on the finest collections in Australia.</p>
        <ul className='font-sans text-sm text-mut space-y-2'>
          <li>Authenticity guaranteed</li>
          <li>Insured shipping worldwide</li>
          <li>Expert valuations</li>
        </ul>
      </div>

      {/* Right panel */}
      <div className='flex-1 flex items-center justify-center px-8 bg-paper'>
        <div className='w-full max-w-md'>
          {registered ? (
            <div className='text-center'>
              <h2 className='font-serif text-2xl font-semibold text-ink mb-3'>Check your email</h2>
              <p className='font-sans text-sm text-mut'>We&apos;ve sent a verification link to your inbox.</p>
            </div>
          ) : (
            <>
              <div className='flex border-b border-[var(--line)] mb-8'>
                {(['signin', 'register'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 pb-3 font-sans text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-ink text-ink' : 'text-mut hover:text-ink'}`}>
                    {t === 'signin' ? 'Sign In' : 'Create Account'}
                  </button>
                ))}
              </div>

              {tab === 'signin' ? (
                <form onSubmit={loginForm.handleSubmit(handleLogin)} className='space-y-4'>
                  <div>
                    <label className='block font-sans text-sm font-medium text-ink mb-1'>Email</label>
                    <input {...loginForm.register('email')} type='email' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                    {loginForm.formState.errors.email && <p className='font-sans text-xs text-red-600 mt-1'>{loginForm.formState.errors.email.message}</p>}
                  </div>
                  <div>
                    <label className='block font-sans text-sm font-medium text-ink mb-1'>Password</label>
                    <input {...loginForm.register('password')} type='password' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                    {loginForm.formState.errors.password && <p className='font-sans text-xs text-red-600 mt-1'>{loginForm.formState.errors.password.message}</p>}
                  </div>
                  {serverError && <p className='font-sans text-xs text-red-600'>{serverError}</p>}
                  <button type='submit' disabled={loginForm.formState.isSubmitting}
                    className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 transition-colors disabled:opacity-60'>
                    {loginForm.formState.isSubmitting ? 'Signing in…' : 'Sign In'}
                  </button>
                </form>
              ) : (
                <form onSubmit={registerForm.handleSubmit(handleRegister)} className='space-y-4'>
                  <div>
                    <label className='block font-sans text-sm font-medium text-ink mb-1'>Email</label>
                    <input {...registerForm.register('email')} type='email' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                    {registerForm.formState.errors.email && <p className='font-sans text-xs text-red-600 mt-1'>{registerForm.formState.errors.email.message}</p>}
                  </div>
                  <div>
                    <label className='block font-sans text-sm font-medium text-ink mb-1'>Password</label>
                    <input {...registerForm.register('password')} type='password' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                  </div>
                  <div>
                    <label className='block font-sans text-sm font-medium text-ink mb-1'>Confirm Password</label>
                    <input {...registerForm.register('confirmPassword')} type='password' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                    {registerForm.formState.errors.confirmPassword && <p className='font-sans text-xs text-red-600 mt-1'>{registerForm.formState.errors.confirmPassword.message}</p>}
                  </div>
                  {serverError && <p className='font-sans text-xs text-red-600'>{serverError}</p>}
                  <button type='submit' disabled={registerForm.formState.isSubmitting}
                    className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 transition-colors disabled:opacity-60'>
                    {registerForm.formState.isSubmitting ? 'Creating account…' : 'Create Account'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

Add Next.js route handlers for login and register (proxy to user-auth):

```typescript
// apps/user-portal/src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${USER_SERVICE_URL}/api/users/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json();
  const response = NextResponse.json(data, { status: res.status });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) response.headers.set('set-cookie', setCookie);
  return response;
}
```

```typescript
// apps/user-portal/src/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${USER_SERVICE_URL}/api/users/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Create `apps/user-portal/src/app/account/verify-email/page.tsx`**

```typescript
'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    fetch(`/api/auth/verify-email?token=${token}`, { method: 'POST' })
      .then(r => {
        if (r.ok) { setStatus('success'); setTimeout(() => router.push('/account/login'), 3000); }
        else setStatus('error');
      })
      .catch(() => setStatus('error'));
  }, [token, router]);

  return (
    <div className='min-h-screen bg-paper flex items-center justify-center'>
      <div className='max-w-md text-center px-6'>
        {status === 'loading' && <p className='font-sans text-mut'>Verifying your email…</p>}
        {status === 'success' && (
          <>
            <h1 className='font-serif text-2xl font-semibold text-ink mb-3'>Email verified</h1>
            <p className='font-sans text-sm text-mut'>Redirecting you to sign in…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className='font-serif text-2xl font-semibold text-ink mb-3'>Link expired</h1>
            <p className='font-sans text-sm text-mut mb-6'>This verification link has expired or already been used.</p>
            <a href='/account/login' className='font-sans text-sm text-ink underline'>Back to sign in</a>
          </>
        )}
      </div>
    </div>
  );
}
```

Add verify-email route handler:
```typescript
// apps/user-portal/src/app/api/auth/verify-email/route.ts
import { NextRequest, NextResponse } from 'next/server';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const res = await fetch(`${USER_SERVICE_URL}/api/users/verify-email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 3: Create `apps/user-portal/src/app/account/verify-phone/page.tsx`**

```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function VerifyPhonePage() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function requestCode() {
    setError(''); setIsLoading(true);
    const res = await fetch('/api/auth/phone/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ phone }),
    });
    setIsLoading(false);
    if (res.ok) setStep('otp');
    else { const d = await res.json() as { error?: string }; setError(d.error ?? 'Failed to send code'); }
  }

  async function verifyCode() {
    setError(''); setIsLoading(true);
    const res = await fetch('/api/auth/phone/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ otp }),
    });
    setIsLoading(false);
    if (res.ok) router.push('/account/register-to-bid');
    else { const d = await res.json() as { error?: string }; setError(d.error ?? 'Invalid code'); }
  }

  return (
    <div className='min-h-screen bg-paper flex items-center justify-center'>
      <div className='w-full max-w-sm px-6'>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-2'>Verify your phone</h1>
        <p className='font-sans text-sm text-mut mb-8'>We&apos;ll send a 6-digit code to confirm your number.</p>

        {step === 'phone' ? (
          <div className='space-y-4'>
            <input value={phone} onChange={e => setPhone(e.target.value)} type='tel' placeholder='+61 400 000 000'
              className='w-full border border-[var(--line)] px-3 py-3 font-sans text-sm' />
            {error && <p className='font-sans text-xs text-red-600'>{error}</p>}
            <button onClick={requestCode} disabled={isLoading || !phone}
              className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
              {isLoading ? 'Sending…' : 'Send Code'}
            </button>
          </div>
        ) : (
          <div className='space-y-4'>
            <p className='font-sans text-sm text-ink'>Enter the 6-digit code sent to {phone}</p>
            <input value={otp} onChange={e => setOtp(e.target.value)} type='text' inputMode='numeric' maxLength={6} placeholder='000000'
              className='w-full border border-[var(--line)] px-3 py-3 font-sans text-2xl tracking-widest text-center' />
            {error && <p className='font-sans text-xs text-red-600'>{error}</p>}
            <button onClick={verifyCode} disabled={isLoading || otp.length !== 6}
              className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
              {isLoading ? 'Verifying…' : 'Verify'}
            </button>
            <button onClick={() => { setStep('phone'); setOtp(''); }} className='w-full font-sans text-sm text-mut hover:text-ink'>
              Change number
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

Add phone route handlers (proxy to user-auth):
```typescript
// apps/user-portal/src/app/api/auth/phone/request/route.ts
import { NextRequest, NextResponse } from 'next/server';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const body = await request.json();
  const res = await fetch(`${USER_SERVICE_URL}/api/users/phone/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

// apps/user-portal/src/app/api/auth/phone/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const body = await request.json();
  const res = await fetch(`${USER_SERVICE_URL}/api/users/phone/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/user-portal/src/app/account/login/ apps/user-portal/src/app/account/verify-email/ apps/user-portal/src/app/account/verify-phone/ apps/user-portal/src/app/api/auth/
git commit -m "feat(user-portal): login, verify-email, and verify-phone auth pages"
```

---

### Task 12: Register-to-Bid wizard (4 steps)

**Files:**
- Create: `apps/user-portal/src/app/account/register-to-bid/page.tsx`
- Create: `apps/user-portal/src/lib/stripe.ts`

**Pattern:** Single page component with `step` state (1–4). Step 1 auto-skips if logged in. Stripe Elements loads lazily on Step 3 only.

- [ ] **Step 1: Create `apps/user-portal/src/lib/stripe.ts`**

```typescript
import { loadStripe, type Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
}
```

- [ ] **Step 2: Create `apps/user-portal/src/app/account/register-to-bid/page.tsx`**

```typescript
'use client';
import { useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getStripe } from '@/lib/stripe';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import useSWR from 'swr';

const STEPS = ['Account', 'Identity', 'Payment', 'Approved'] as const;

function ProgressBar({ step }: { step: number }) {
  return (
    <div className='flex items-center gap-2 mb-10'>
      {STEPS.map((label, i) => (
        <div key={label} className='flex items-center gap-2 flex-1'>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-sans text-xs font-semibold
            ${i + 1 <= step ? 'bg-ink text-paper' : 'border border-[var(--line)] text-mut'}`}>
            {i + 1}
          </div>
          <span className={`font-sans text-xs ${i + 1 <= step ? 'text-ink font-medium' : 'text-mut'}`}>{label}</span>
          {i < STEPS.length - 1 && <div className={`flex-1 h-px ${i + 1 < step ? 'bg-ink' : 'bg-[var(--line)]'}`} />}
        </div>
      ))}
    </div>
  );
}

function Step2Identity({ onDone }: { onDone: () => void }) {
  const { accessToken } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!file) return;
    setError(''); setIsLoading(true);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/users/identity-document', {
      method: 'POST',
      headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: form,
    });
    setIsLoading(false);
    if (res.ok) onDone();
    else { const d = await res.json() as { error?: string }; setError(d.error ?? 'Upload failed'); }
  }

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='font-serif text-2xl font-semibold text-ink mb-2'>Verify your identity</h2>
        <p className='font-sans text-sm text-mut'>Upload a government-issued ID (passport or driver licence).</p>
      </div>
      <div className='space-y-4'>
        <div>
          <label className='block font-sans text-sm font-medium text-ink mb-1'>Government ID</label>
          <input type='file' accept='image/jpeg,image/png,application/pdf' onChange={e => setFile(e.target.files?.[0] ?? null)}
            className='block w-full font-sans text-sm text-mut file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-ink file:text-paper file:font-sans file:text-sm hover:file:bg-ink/90' />
          <p className='font-sans text-xs text-mut mt-1'>JPG, PNG or PDF · max 10 MB · encrypted at rest</p>
        </div>
      </div>
      {error && <p className='font-sans text-xs text-red-600'>{error}</p>}
      <button onClick={submit} disabled={!file || isLoading}
        className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
        {isLoading ? 'Uploading…' : 'Continue'}
      </button>
    </div>
  );
}

function Step3Payment({ onDone }: { onDone: () => void }) {
  const { accessToken } = useAuth();
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!stripe || !elements) return;
    setError(''); setIsLoading(true);

    const res = await fetch('/api/payments/setup-intent', {
      method: 'POST', headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    });
    const { clientSecret, error: serverError } = await res.json() as { clientSecret?: string; error?: string };
    if (!clientSecret) { setError(serverError ?? 'Failed to initialise payment'); setIsLoading(false); return; }

    const card = elements.getElement(CardElement);
    if (!card) return;

    const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, { payment_method: { card } });
    if (stripeError) { setError(stripeError.message ?? 'Card declined'); setIsLoading(false); return; }

    const confirmRes = await fetch('/api/payments/setup-intent/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ setupIntentId: setupIntent!.id }),
    });
    setIsLoading(false);
    if (confirmRes.ok) onDone();
    else setError('Failed to save card. Please try again.');
  }

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='font-serif text-2xl font-semibold text-ink mb-2'>Add a payment method</h2>
        <p className='font-sans text-sm text-mut'>Your card won&apos;t be charged now. We verify it&apos;s valid for future purchases.</p>
      </div>
      <div className='border border-[var(--line)] p-4'>
        <CardElement options={{ style: { base: { fontFamily: 'Mulish, sans-serif', fontSize: '16px' } } }} />
      </div>
      {error && <p className='font-sans text-xs text-red-600'>{error}</p>}
      <button onClick={submit} disabled={isLoading}
        className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
        {isLoading ? 'Processing…' : 'Authorise Card'}
      </button>
    </div>
  );
}

function Step4Approved() {
  const { accessToken } = useAuth();
  const { data } = useSWR(
    accessToken ? '/api/auth/me' : null,
    (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
    { refreshInterval: 10000 },
  );
  const isApproved = data?.verificationStatus === 'APPROVED_BIDDER';

  return (
    <div className='text-center py-8'>
      {isApproved ? (
        <>
          <h2 className='font-serif text-2xl font-semibold text-ink mb-3'>You&apos;re approved!</h2>
          <p className='font-sans text-sm text-mut mb-6'>Happy bidding.</p>
          <a href='/auctions' className='bg-ink text-paper font-sans text-sm font-medium px-8 py-3 hover:bg-ink/90'>Browse Lots</a>
        </>
      ) : (
        <>
          <h2 className='font-serif text-2xl font-semibold text-ink mb-3'>Under review</h2>
          <p className='font-sans text-sm text-mut'>Your identity is under review. We&apos;ll notify you by email once approved.</p>
          <p className='font-sans text-xs text-mut mt-4'>Checking for approval…</p>
        </>
      )}
    </div>
  );
}

export default function RegisterToBidPage() {
  const { user } = useAuth();
  const [step, setStep] = useState(user ? 2 : 1);
  const stripePromise = getStripe();

  return (
    <div className='min-h-screen bg-paper flex items-center justify-center px-6'>
      <div className='w-full max-w-lg py-12'>
        <ProgressBar step={step} />

        {step === 1 && (
          <div className='text-center'>
            <h2 className='font-serif text-2xl font-semibold text-ink mb-6'>Create your account</h2>
            <a href='/account/login' className='bg-ink text-paper font-sans text-sm font-medium px-8 py-3 hover:bg-ink/90 transition-colors'>Sign In or Register</a>
          </div>
        )}

        {step === 2 && <Step2Identity onDone={() => setStep(3)} />}

        {step === 3 && (
          <Elements stripe={stripePromise}>
            <Step3Payment onDone={() => setStep(4)} />
          </Elements>
        )}

        {step === 4 && <Step4Approved />}
      </div>
    </div>
  );
}
```

Add proxy route handlers for identity-document and payments:
```typescript
// apps/user-portal/src/app/api/users/identity-document/route.ts
import { NextRequest, NextResponse } from 'next/server';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const body = await request.formData();
  const res = await fetch(`${USER_SERVICE_URL}/api/users/identity-document`, { method: 'POST', headers: { Authorization: auth }, body });
  return NextResponse.json(await res.json(), { status: res.status });
}

// apps/user-portal/src/app/api/payments/setup-intent/route.ts
import { NextRequest, NextResponse } from 'next/server';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3004';
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/setup-intent`, { method: 'POST', headers: { Authorization: auth } });
  return NextResponse.json(await res.json(), { status: res.status });
}

// apps/user-portal/src/app/api/payments/setup-intent/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3004';
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const body = await request.json();
  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/setup-intent/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

Also add `/api/auth/me` route:
```typescript
// apps/user-portal/src/app/api/auth/me/route.ts
import { NextRequest, NextResponse } from 'next/server';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${USER_SERVICE_URL}/api/users/me`, { headers: { Authorization: auth }, cache: 'no-store' });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/user-portal/src/app/account/register-to-bid/ apps/user-portal/src/lib/stripe.ts apps/user-portal/src/app/api/users/ apps/user-portal/src/app/api/payments/ apps/user-portal/src/app/api/auth/me/
git commit -m "feat(user-portal): register-to-bid 4-step wizard with identity upload and Stripe card setup"
```

---

### Task 13: Account pages — Dashboard, My Bids, Watchlist, Won Lots

**Files:**
- Create: `apps/user-portal/src/app/account/dashboard/page.tsx`
- Create: `apps/user-portal/src/app/account/bids/page.tsx`
- Create: `apps/user-portal/src/app/account/watchlist/page.tsx`
- Create: `apps/user-portal/src/app/account/won/page.tsx`

All use `AccountShell` + `Header` + SWR polling every 5 seconds.

- [ ] **Step 1: Create `apps/user-portal/src/app/account/dashboard/page.tsx`**

```typescript
'use client';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { BidStatusBadge } from '@/components/primitives/bid-status-badge';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

const fetcher = (url: string, token: string) =>
  fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());

type Stats = { activeBids: number; leading: number; watching: number; wonThisYear: number };
type Bid = { lotId: string; auctionId: string; title: string; yourBid: number; currentBid: number; status: 'leading' | 'outbid'; endAt: string };

export default function DashboardPage() {
  const { accessToken, user } = useAuth();
  const { data: stats } = useSWR<Stats>(
    accessToken ? ['/api/account/stats', accessToken] : null,
    ([url, tok]: [string, string]) => fetcher(url, tok),
    { refreshInterval: 5000 },
  );
  const { data: bidsData } = useSWR<{ bids: Bid[] }>(
    accessToken ? ['/api/account/bids?limit=5', accessToken] : null,
    ([url, tok]: [string, string]) => fetcher(url, tok),
    { refreshInterval: 5000 },
  );

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-2'>
          Welcome back{user ? `, ${user.email.split('@')[0]}` : ''}
        </h1>
        <p className='font-sans text-sm text-mut mb-8'>Here&apos;s your bidding overview.</p>

        {/* Stat cards */}
        <div className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-10'>
          {[
            { label: 'Active Bids', value: stats?.activeBids ?? '—' },
            { label: 'Leading', value: stats?.leading ?? '—' },
            { label: 'Watching', value: stats?.watching ?? '—' },
            { label: 'Won This Year', value: stats?.wonThisYear ?? '—', dark: true },
          ].map(({ label, value, dark }) => (
            <div key={label} className={`p-5 border ${dark ? 'bg-ink text-paper border-ink' : 'bg-paper border-[var(--line)]'}`}>
              <p className={`font-sans text-xs uppercase tracking-widest mb-2 ${dark ? 'text-mut' : 'text-mut'}`}>{label}</p>
              <p className={`font-serif text-3xl font-semibold ${dark ? 'text-paper' : 'text-ink'}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Recent bids */}
        <div>
          <div className='flex items-center justify-between mb-4'>
            <h2 className='font-sans text-sm font-semibold uppercase tracking-widest text-mut'>Active Bids</h2>
            <Link href='/account/bids' className='font-sans text-xs text-gold hover:text-ink'>View all →</Link>
          </div>
          {bidsData?.bids.length === 0 && <p className='font-sans text-sm text-mut'>No active bids.</p>}
          <div className='flex flex-col divide-y divide-[var(--line)]'>
            {bidsData?.bids.map(bid => (
              <div key={bid.lotId} className='py-4 flex items-center gap-4'>
                <div className='flex-1 min-w-0'>
                  <Link href={`/auctions/${bid.auctionId}/lots/${bid.lotId}`}
                    className='font-sans text-sm font-medium text-ink hover:underline truncate block'>{bid.title}</Link>
                  <p className='font-sans text-xs text-mut mt-0.5'>Your bid: {bid.yourBid.toLocaleString()}</p>
                </div>
                <BidStatusBadge status={bid.status} />
                <CountdownTimer endAt={bid.endAt} />
              </div>
            ))}
          </div>
        </div>
      </AccountShell>
    </>
  );
}
```

- [ ] **Step 2: Create `apps/user-portal/src/app/account/bids/page.tsx`**

```typescript
'use client';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { BidStatusBadge } from '@/components/primitives/bid-status-badge';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

type Bid = { lotId: string; auctionId: string; title: string; yourBid: number; currentBid: number; status: 'leading' | 'outbid'; endAt: string; currency: string };

export default function BidsPage() {
  const { accessToken } = useAuth();
  const { data } = useSWR<{ bids: Bid[] }>(
    accessToken ? `/api/account/bids` : null,
    (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
    { refreshInterval: 5000 },
  );

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>My Bids</h1>
        {!data?.bids.length ? (
          <p className='font-sans text-sm text-mut'>You have no active bids.</p>
        ) : (
          <table className='w-full font-sans text-sm'>
            <thead>
              <tr className='bg-cream'>
                {['Lot', 'Your Bid', 'Current Bid', 'Status', 'Closes'].map(h => (
                  <th key={h} className='px-4 py-3 text-left text-xs font-semibold text-mut uppercase tracking-wider'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y divide-[var(--line)]'>
              {data.bids.map(bid => (
                <tr key={bid.lotId}>
                  <td className='px-4 py-3'>
                    <Link href={`/auctions/${bid.auctionId}/lots/${bid.lotId}`} className='text-ink font-medium hover:underline line-clamp-2'>{bid.title}</Link>
                  </td>
                  <td className='px-4 py-3 text-ink'>{bid.currency.toUpperCase()} {bid.yourBid.toLocaleString()}</td>
                  <td className='px-4 py-3 text-ink'>{bid.currency.toUpperCase()} {bid.currentBid.toLocaleString()}</td>
                  <td className='px-4 py-3'><BidStatusBadge status={bid.status} /></td>
                  <td className='px-4 py-3'><CountdownTimer endAt={bid.endAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AccountShell>
    </>
  );
}
```

- [ ] **Step 3: Create `apps/user-portal/src/app/account/watchlist/page.tsx`**

```typescript
'use client';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { LotCard, LotCardProps } from '@/components/primitives/lot-card';
import { useAuth } from '@/lib/auth-context';

export default function WatchlistPage() {
  const { accessToken } = useAuth();
  const { data, mutate } = useSWR<{ lots: LotCardProps[] }>(
    accessToken ? '/api/account/watchlist' : null,
    (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
    { refreshInterval: 5000 },
  );

  async function removeFromWatchlist(lotId: string) {
    mutate(prev => prev ? { lots: prev.lots.filter(l => l.lotId !== lotId) } : prev, false);
    await fetch(`/api/lots/${lotId}/watchlist`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
    mutate();
  }

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>Watchlist</h1>
        {!data?.lots.length ? (
          <p className='font-sans text-sm text-mut'>Your watchlist is empty.</p>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            {data.lots.map(lot => (
              <div key={lot.lotId} className='relative group'>
                <LotCard {...lot} />
                <button onClick={() => removeFromWatchlist(lot.lotId)}
                  className='absolute top-2 right-2 bg-ink text-paper w-7 h-7 rounded-full flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-opacity'>
                  ♡
                </button>
              </div>
            ))}
          </div>
        )}
      </AccountShell>
    </>
  );
}
```

- [ ] **Step 4: Create `apps/user-portal/src/app/account/won/page.tsx`**

```typescript
'use client';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

type WonLot = { lotId: string; auctionId: string; title: string; wonDate: string; hammerPrice: number; currency: string; invoiceId: string; fulfilmentId?: string; paymentStatus: string };

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Payment due': 'bg-amber-100 text-amber-800',
    'Shipped':     'bg-green-100 text-green-800',
    'Delivered':   'bg-green-100 text-green-800',
    'Collected':   'bg-green-100 text-green-800',
  };
  return <span className={`font-sans text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}

export default function WonLotsPage() {
  const { accessToken } = useAuth();
  const { data } = useSWR<{ lots: WonLot[] }>(
    accessToken ? '/api/account/won' : null,
    (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
    { refreshInterval: 5000 },
  );

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>Won Lots</h1>
        {!data?.lots.length ? (
          <p className='font-sans text-sm text-mut'>No won lots yet.</p>
        ) : (
          <table className='w-full font-sans text-sm'>
            <thead>
              <tr className='bg-cream'>
                {['Lot', 'Hammer Price', 'Status', 'Actions'].map(h => (
                  <th key={h} className='px-4 py-3 text-left text-xs font-semibold text-mut uppercase tracking-wider'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y divide-[var(--line)]'>
              {data.lots.map(lot => (
                <tr key={lot.lotId}>
                  <td className='px-4 py-3'>
                    <Link href={`/auctions/${lot.auctionId}/lots/${lot.lotId}`} className='text-ink font-medium hover:underline'>{lot.title}</Link>
                    <p className='text-xs text-mut mt-0.5'>{new Date(lot.wonDate).toLocaleDateString('en-AU')}</p>
                  </td>
                  <td className='px-4 py-3'>{lot.currency.toUpperCase()} {lot.hammerPrice.toLocaleString()}</td>
                  <td className='px-4 py-3'><StatusPill status={lot.paymentStatus} /></td>
                  <td className='px-4 py-3 flex gap-3'>
                    <Link href={`/account/invoices/${lot.invoiceId}`} className='text-ink text-xs hover:underline'>Invoice</Link>
                    {lot.fulfilmentId && <Link href={`/account/fulfilments/${lot.fulfilmentId}`} className='text-ink text-xs hover:underline'>Fulfilment</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AccountShell>
    </>
  );
}
```

Add proxy route handlers for account data (proxy to respective services):
```typescript
// apps/user-portal/src/app/api/account/bids/route.ts
import { NextRequest, NextResponse } from 'next/server';
const AUCTION_SERVICE_URL = process.env.AUCTION_SERVICE_URL ?? 'http://localhost:3003';
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${AUCTION_SERVICE_URL}/api/account/bids${request.nextUrl.search}`, { headers: { Authorization: auth }, cache: 'no-store' });
  return NextResponse.json(await res.json(), { status: res.status });
}

// apps/user-portal/src/app/api/account/watchlist/route.ts  — proxies to catalogue service
// apps/user-portal/src/app/api/account/won/route.ts         — proxies to payment service
// apps/user-portal/src/app/api/account/stats/route.ts       — proxies to auction service
// (same pattern as above — swap service URL and path)
```

- [ ] **Step 5: Commit**

```bash
git add apps/user-portal/src/app/account/dashboard/ apps/user-portal/src/app/account/bids/ apps/user-portal/src/app/account/watchlist/ apps/user-portal/src/app/account/won/ apps/user-portal/src/app/api/account/
git commit -m "feat(user-portal): account dashboard, bids, watchlist, and won lots pages"
```

---

### Task 14: Invoice, Fulfilment, and Sell pages

**Files:**
- Create: `apps/user-portal/src/app/account/invoices/[id]/page.tsx`
- Create: `apps/user-portal/src/app/account/fulfilments/[id]/page.tsx`
- Create: `apps/user-portal/src/app/sell/page.tsx`

- [ ] **Step 1: Create `apps/user-portal/src/app/account/invoices/[id]/page.tsx`**

```typescript
'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { Toast } from '@/components/primitives/toast';
import { useAuth } from '@/lib/auth-context';

type Invoice = {
  id: string; lotTitle: string; lotImageUrl: string; wonDate: string;
  hammerPrice: number; buyersPremium: number; gst: number; shipping: number;
  total: number; currency: string; status: string; stripeCheckoutUrl?: string;
};

export default function InvoicePage({ params }: { params: { id: string } }) {
  const { accessToken } = useAuth();
  const [isPaying, setIsPaying] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  const { data: invoice, mutate } = useSWR<Invoice>(
    accessToken ? `/api/account/invoices/${params.id}` : null,
    (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
  );

  async function paySavedCard() {
    setIsPaying(true);
    const res = await fetch(`/api/payments/invoices/${params.id}/pay-saved-card`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as { status?: string; error?: string };
    setIsPaying(false);
    if (data.status === 'paid') { setToast({ message: 'Payment successful!', type: 'success' }); mutate(); }
    else setToast({ message: data.error ?? 'Payment failed. Please try again.', type: 'error' });
  }

  if (!invoice) return null;

  const isPaid = invoice.status === 'PAID';

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>Invoice</h1>

        <div className='max-w-lg'>
          {/* Lot summary */}
          <div className='flex gap-4 mb-8 pb-8 border-b border-[var(--line)]'>
            <div className='flex-1'>
              <p className='font-serif text-base font-semibold text-ink'>{invoice.lotTitle}</p>
              <p className='font-sans text-xs text-mut mt-1'>Won {new Date(invoice.wonDate).toLocaleDateString('en-AU')}</p>
            </div>
          </div>

          {/* Price breakdown */}
          <div className='space-y-3 mb-8'>
            {[
              ['Hammer price', invoice.hammerPrice],
              ["Buyer's premium (22%)", invoice.buyersPremium],
              ['GST', invoice.gst],
              ['Shipping', invoice.shipping],
            ].map(([label, amount]) => (
              <div key={label as string} className='flex justify-between font-sans text-sm'>
                <span className='text-mut'>{label}</span>
                <span className='text-ink'>{invoice.currency.toUpperCase()} {(amount as number).toLocaleString()}</span>
              </div>
            ))}
            <div className='flex justify-between font-sans text-base font-semibold pt-4 border-t border-[var(--line)]'>
              <span className='text-ink'>Total due</span>
              <span className='text-ink'>{invoice.currency.toUpperCase()} {invoice.total.toLocaleString()}</span>
            </div>
          </div>

          {isPaid ? (
            <div className='bg-green-50 border border-green-200 px-4 py-3'>
              <p className='font-sans text-sm text-green-800 font-medium'>Payment received</p>
            </div>
          ) : (
            <div className='space-y-3'>
              <button onClick={paySavedCard} disabled={isPaying}
                className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
                {isPaying ? 'Processing…' : `Pay ${invoice.currency.toUpperCase()} ${invoice.total.toLocaleString()} with saved card`}
              </button>
              {invoice.stripeCheckoutUrl && (
                <a href={invoice.stripeCheckoutUrl}
                  className='block w-full text-center border border-[var(--line)] font-sans text-sm py-3 text-ink hover:bg-cream transition-colors'>
                  Pay by card or bank transfer
                </a>
              )}
            </div>
          )}
        </div>
      </AccountShell>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}
```

Add proxy route for invoice pay-saved-card:
```typescript
// apps/user-portal/src/app/api/payments/invoices/[id]/pay-saved-card/route.ts
import { NextRequest, NextResponse } from 'next/server';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3004';
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/invoices/${params.id}/pay-saved-card`, { method: 'POST', headers: { Authorization: auth } });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

- [ ] **Step 2: Create `apps/user-portal/src/app/account/fulfilments/[id]/page.tsx`**

```typescript
'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { Toast } from '@/components/primitives/toast';
import { useAuth } from '@/lib/auth-context';

const addressSchema = z.object({
  name: z.string().min(2), address1: z.string().min(5), address2: z.string().optional(),
  city: z.string().min(2), postcode: z.string().min(4), country: z.string().min(2),
});
type AddressForm = z.infer<typeof addressSchema>;

export default function FulfilmentPage({ params }: { params: { id: string } }) {
  const { accessToken } = useAuth();
  const [option, setOption] = useState<'ship' | 'collect'>('ship');
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  const form = useForm<AddressForm>({ resolver: zodResolver(addressSchema) });

  async function submitAddress(data: AddressForm) {
    const res = await fetch(`/api/shipping/fulfilments/${params.id}/address`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(data),
    });
    if (res.ok) setToast({ message: 'Address saved. We\'ll be in touch with tracking details.', type: 'success' });
    else setToast({ message: 'Failed to save address.', type: 'error' });
  }

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>Delivery Options</h1>
        <div className='max-w-lg'>
          {/* Option selector */}
          <div className='grid grid-cols-2 gap-3 mb-8'>
            {(['ship', 'collect'] as const).map(opt => (
              <button key={opt} onClick={() => setOption(opt)}
                className={`py-4 border font-sans text-sm font-medium transition-colors ${option === opt ? 'border-ink bg-ink text-paper' : 'border-[var(--line)] text-ink hover:bg-cream'}`}>
                {opt === 'ship' ? 'Ship to me' : 'Collect in person'}
              </button>
            ))}
          </div>

          {option === 'ship' && (
            <form onSubmit={form.handleSubmit(submitAddress)} className='space-y-4'>
              {([['name', 'Full name'], ['address1', 'Address line 1'], ['address2', 'Address line 2 (optional)'], ['city', 'City'], ['postcode', 'Postcode'], ['country', 'Country']] as const).map(([field, label]) => (
                <div key={field}>
                  <label className='block font-sans text-sm font-medium text-ink mb-1'>{label}</label>
                  <input {...form.register(field)} className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                  {form.formState.errors[field] && <p className='font-sans text-xs text-red-600 mt-1'>{form.formState.errors[field]?.message}</p>}
                </div>
              ))}
              <button type='submit' disabled={form.formState.isSubmitting}
                className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
                {form.formState.isSubmitting ? 'Saving…' : 'Confirm Shipping Address'}
              </button>
            </form>
          )}

          {option === 'collect' && (
            <div className='text-center py-8'>
              <p className='font-sans text-sm text-mut'>Collection slot booking coming soon. Please contact us at collections@caratroom.com.au</p>
            </div>
          )}
        </div>
      </AccountShell>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}
```

- [ ] **Step 3: Create `apps/user-portal/src/app/sell/page.tsx`**

```typescript
'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Header } from '@/components/layout/header';

const schema = z.object({
  category:    z.string().min(1, 'Select a category'),
  artistMaker: z.string().optional(),
  description: z.string().min(20, 'Please provide at least 20 characters'),
  name:        z.string().min(2),
  email:       z.string().email(),
});
type FormData = z.infer<typeof schema>;

const CATEGORIES = ['Jewellery', 'Watches', 'Designer Handbags', 'Art', 'Collectibles', 'Other'];

export default function SellPage() {
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  async function uploadPhoto(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/enquiries/valuation/upload', { method: 'POST', body: formData });
    if (!res.ok) { setUploadError('Upload failed. Please try again.'); return; }
    const { key } = await res.json() as { key: string };
    setPhotoKeys(prev => [...prev, key]);
  }

  async function submit(data: FormData) {
    const res = await fetch('/api/enquiries/valuation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, photoKeys }),
    });
    if (res.ok) setSubmitted(true);
    else form.setError('root', { message: 'Submission failed. Please try again.' });
  }

  return (
    <>
      <Header />
      <div className='min-h-screen flex'>
        {/* Left panel */}
        <div className='hidden md:flex w-2/5 bg-ink text-paper flex-col justify-center px-16'>
          <h1 className='font-serif text-4xl font-semibold mb-6 leading-tight'>Sell with The Carat Room</h1>
          <ul className='font-sans text-sm text-mut space-y-4'>
            <li>No upfront fees</li>
            <li>Global bidder reach</li>
            <li>Insured collection &amp; storage</li>
          </ul>
        </div>

        {/* Form */}
        <div className='flex-1 bg-paper px-8 py-16 flex items-start justify-center'>
          {submitted ? (
            <div className='text-center max-w-sm'>
              <h2 className='font-serif text-2xl font-semibold text-ink mb-3'>Request received</h2>
              <p className='font-sans text-sm text-mut'>We&apos;ll be in touch within two business days.</p>
            </div>
          ) : (
            <form onSubmit={form.handleSubmit(submit)} className='w-full max-w-md space-y-5'>
              <div>
                <label className='block font-sans text-sm font-medium text-ink mb-1'>Category</label>
                <select {...form.register('category')} className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm bg-white'>
                  <option value=''>Select…</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {form.formState.errors.category && <p className='font-sans text-xs text-red-600 mt-1'>{form.formState.errors.category.message}</p>}
              </div>

              <div>
                <label className='block font-sans text-sm font-medium text-ink mb-1'>Artist / Maker (optional)</label>
                <input {...form.register('artistMaker')} className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
              </div>

              <div>
                <label className='block font-sans text-sm font-medium text-ink mb-1'>Description</label>
                <textarea {...form.register('description')} rows={4}
                  placeholder='Medium, dimensions, provenance, condition…'
                  className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm resize-none' />
                {form.formState.errors.description && <p className='font-sans text-xs text-red-600 mt-1'>{form.formState.errors.description.message}</p>}
              </div>

              <div>
                <label className='block font-sans text-sm font-medium text-ink mb-1'>Photographs (up to 6)</label>
                <input type='file' accept='image/jpeg,image/png,application/pdf' multiple disabled={photoKeys.length >= 6}
                  onChange={e => Array.from(e.target.files ?? []).forEach(uploadPhoto)}
                  className='block w-full font-sans text-sm text-mut file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-ink file:text-paper hover:file:bg-ink/90' />
                {uploadError && <p className='font-sans text-xs text-red-600 mt-1'>{uploadError}</p>}
                {photoKeys.length > 0 && <p className='font-sans text-xs text-mut mt-1'>{photoKeys.length} photo(s) uploaded</p>}
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='block font-sans text-sm font-medium text-ink mb-1'>Name</label>
                  <input {...form.register('name')} className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                </div>
                <div>
                  <label className='block font-sans text-sm font-medium text-ink mb-1'>Email</label>
                  <input {...form.register('email')} type='email' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                </div>
              </div>

              {form.formState.errors.root && <p className='font-sans text-xs text-red-600'>{form.formState.errors.root.message}</p>}

              <button type='submit' disabled={form.formState.isSubmitting}
                className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
                {form.formState.isSubmitting ? 'Submitting…' : 'Request Valuation'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
```

Add proxy routes for enquiries:
```typescript
// apps/user-portal/src/app/api/enquiries/valuation/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
const ADMIN_SERVICE_URL = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3007';
export async function POST(request: NextRequest) {
  const body = await request.formData();
  const res = await fetch(`${ADMIN_SERVICE_URL}/enquiries/valuation/upload`, { method: 'POST', body });
  return NextResponse.json(await res.json(), { status: res.status });
}

// apps/user-portal/src/app/api/enquiries/valuation/route.ts
import { NextRequest, NextResponse } from 'next/server';
const ADMIN_SERVICE_URL = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3007';
export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${ADMIN_SERVICE_URL}/enquiries/valuation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

Add `ADMIN_SERVICE_URL` to `next.config.mjs` env block:
```js
ADMIN_SERVICE_URL: process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3007',
```

- [ ] **Step 4: Commit**

```bash
git add apps/user-portal/src/app/account/invoices/ apps/user-portal/src/app/account/fulfilments/ apps/user-portal/src/app/sell/ apps/user-portal/src/app/api/payments/invoices/ apps/user-portal/src/app/api/enquiries/ apps/user-portal/next.config.mjs
git commit -m "feat(user-portal): invoice, fulfilment, and sell/valuation pages"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| OzBid Heritage tokens (CSS vars + Tailwind) | Task 2 |
| Bodoni Moda + Mulish fonts | Task 2 |
| AuthContext (in-memory JWT) | Task 3 |
| Middleware refresh guard for /account/* | Task 4 |
| SSE proxy route + useLotSse hook | Task 7 |
| Home page — hero, closing-soon grid, upcoming strip | Task 8 |
| Calendar page — three tabs | Task 9 |
| Browse & Search — filters, sort, SWR | Task 9 |
| Sale Catalogue [auctionId] page | Task 10 |
| Lot Detail — standard + live (SSE theme switch) | Task 10 |
| BidConfirmedModal, OutbidModal | Task 6 |
| CountdownTimer (turns red at ≤3 min) | Task 6 |
| Login/Register split layout | Task 11 |
| Verify Email page | Task 11 |
| Verify Phone OTP page | Task 11 |
| Register-to-Bid 4-step wizard | Task 12 |
| Stripe SetupIntent card pre-auth | Task 12 |
| Dashboard — stat cards + recent bids | Task 13 |
| My Bids table | Task 13 |
| Watchlist — optimistic remove | Task 13 |
| Won Lots table | Task 13 |
| Invoice page — pay-saved-card + Stripe Checkout | Task 14 |
| Fulfilment page — ship / collect | Task 14 |
| Sell / Valuation page | Task 14 |

**Placeholder scan:** No TBD, no TODO in any step above. Proxy route handler stubs for account/stats, account/watchlist, account/won, account/invoices, api/lots/{id}/watchlist, api/shipping/fulfilments, api/auction proxy routes are documented inline where needed — the implementer should follow the same fetch-proxy pattern shown repeatedly in Tasks 11–14.

**Type consistency:** All types defined per-page (no cross-file type sharing required). `LotCardProps` is exported from `lot-card.tsx` and imported in `watchlist/page.tsx`.

---

## Gap-Fill Tasks (from spec coverage audit)

These tasks cover spec requirements missed in Tasks 1–14.

---

### Task 15: Header with search bar + updated AccountShell

**Spec lines covered:**
- Header: "wordmark + search bar + Watchlist link + user avatar"
- Header search bar: debounced 300ms, state lives in URL query params
- AccountShell: "avatar, name, 'Collector since YYYY', nav links (Overview / My Bids / Watchlist / Won Lots / Invoices & Payments / Profile & Paddle)"

**Files:**
- Modify: `apps/user-portal/src/components/layout/header.tsx`
- Modify: `apps/user-portal/src/components/layout/header-dark.tsx`
- Modify: `apps/user-portal/src/components/layout/account-shell.tsx`
- Create: `apps/user-portal/src/app/account/profile/page.tsx`

- [ ] **Step 1: Update `apps/user-portal/src/components/layout/header.tsx`**

Replace with version that includes search bar (debounced 300ms), Watchlist link, and user avatar:

```typescript
'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';

export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = e.target.value;
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) params.set('q', q); else params.delete('q');
      router.push(`/auctions?${params.toString()}`);
    }, 300);
  }, [router, searchParams]);

  return (
    <header className='bg-paper border-b border-[var(--line)] px-6 py-4'>
      <div className='max-w-7xl mx-auto flex items-center gap-6'>
        <Link href='/' className='font-serif text-xl font-semibold tracking-wide text-ink shrink-0'>
          The Carat Room
        </Link>

        {/* Search bar */}
        <div className='flex-1 max-w-sm'>
          <input
            type='search'
            defaultValue={searchParams.get('q') ?? ''}
            onChange={handleSearch}
            placeholder='Search lots…'
            className='w-full border border-[var(--line)] bg-cream px-3 py-1.5 font-sans text-sm text-ink placeholder-mut focus:outline-none focus:border-ink'
          />
        </div>

        <nav className='hidden md:flex items-center gap-6 font-sans text-sm font-medium text-mut'>
          <Link href='/auctions' className='hover:text-ink transition-colors'>Auctions</Link>
          <Link href='/calendar' className='hover:text-ink transition-colors'>Calendar</Link>
          <Link href='/sell' className='hover:text-ink transition-colors'>Sell</Link>
          <Link href='/account/watchlist' className='hover:text-ink transition-colors'>Watchlist</Link>
        </nav>

        <div className='flex items-center gap-3 shrink-0'>
          {user ? (
            <div className='flex items-center gap-3'>
              <Link href='/account/dashboard'>
                <div className='w-8 h-8 rounded-full bg-ink text-paper flex items-center justify-center font-sans text-xs font-semibold'>
                  {user.email[0].toUpperCase()}
                </div>
              </Link>
              <button onClick={logout} className='font-sans text-xs text-mut hover:text-ink'>Sign out</button>
            </div>
          ) : (
            <Link href='/account/login' className='font-sans text-sm font-medium text-ink border border-[var(--line)] px-4 py-2 hover:bg-cream transition-colors'>
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Update `apps/user-portal/src/components/layout/header-dark.tsx`** with same search + watchlist structure on dark background:

```typescript
'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';

export function HeaderDark() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = e.target.value;
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) params.set('q', q); else params.delete('q');
      router.push(`/auctions?${params.toString()}`);
    }, 300);
  }, [router, searchParams]);

  return (
    <header className='bg-ink border-b border-white/10 px-6 py-4'>
      <div className='max-w-7xl mx-auto flex items-center gap-6'>
        <Link href='/' className='font-serif text-xl font-semibold tracking-wide text-paper shrink-0'>
          The Carat Room
        </Link>
        <div className='flex-1 max-w-sm'>
          <input
            type='search'
            defaultValue={searchParams.get('q') ?? ''}
            onChange={handleSearch}
            placeholder='Search lots…'
            className='w-full border border-white/20 bg-white/10 px-3 py-1.5 font-sans text-sm text-paper placeholder-white/40 focus:outline-none focus:border-white/60'
          />
        </div>
        <nav className='hidden md:flex items-center gap-6 font-sans text-sm font-medium text-white/60'>
          <Link href='/auctions' className='hover:text-paper transition-colors'>Auctions</Link>
          <Link href='/account/watchlist' className='hover:text-paper transition-colors'>Watchlist</Link>
        </nav>
        <div className='shrink-0'>
          {user ? (
            <div className='flex items-center gap-3'>
              <Link href='/account/dashboard'>
                <div className='w-8 h-8 rounded-full bg-paper text-ink flex items-center justify-center font-sans text-xs font-semibold'>
                  {user.email[0].toUpperCase()}
                </div>
              </Link>
              <button onClick={logout} className='font-sans text-xs text-white/50 hover:text-paper'>Sign out</button>
            </div>
          ) : (
            <Link href='/account/login' className='font-sans text-sm font-medium text-paper border border-white/30 px-4 py-2 hover:bg-white/10 transition-colors'>
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Update `apps/user-portal/src/components/layout/account-shell.tsx`** to add avatar, "Collector since YYYY", and "Profile & Paddle" link:

```typescript
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';

const NAV = [
  { href: '/account/dashboard', label: 'Overview' },
  { href: '/account/bids',      label: 'My Bids' },
  { href: '/account/watchlist', label: 'Watchlist' },
  { href: '/account/won',       label: 'Won Lots' },
  { href: '/account/invoices',  label: 'Invoices & Payments' },
  { href: '/account/profile',   label: 'Profile & Paddle' },
];

export function AccountShell({ children, collectorSince }: { children: ReactNode; collectorSince?: string }) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className='max-w-7xl mx-auto px-6 py-10 flex gap-10'>
      <aside className='w-56 shrink-0'>
        {/* Avatar + name */}
        <div className='mb-6 pb-6 border-b border-[var(--line)]'>
          <div className='w-12 h-12 rounded-full bg-ink text-paper flex items-center justify-center font-sans text-lg font-semibold mb-3'>
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <p className='font-sans text-sm font-medium text-ink truncate'>{user?.email ?? ''}</p>
          {collectorSince && (
            <p className='font-sans text-xs text-mut mt-0.5'>Collector since {collectorSince}</p>
          )}
        </div>

        <nav className='flex flex-col gap-1'>
          {NAV.map(({ href, label }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`font-sans text-sm px-4 py-2 rounded transition-colors ${isActive ? 'bg-ink text-paper font-medium' : 'text-mut hover:text-ink'}`}>
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className='flex-1 min-w-0'>{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/user-portal/src/app/account/profile/page.tsx`** (stub — Profile & Paddle number page):

```typescript
'use client';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { useAuth } from '@/lib/auth-context';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>Profile & Paddle</h1>
        <div className='max-w-sm space-y-4'>
          <div>
            <p className='font-sans text-xs text-mut uppercase tracking-wider mb-1'>Email</p>
            <p className='font-sans text-sm text-ink'>{user?.email}</p>
          </div>
          <div>
            <p className='font-sans text-xs text-mut uppercase tracking-wider mb-1'>Bidder Status</p>
            <p className='font-sans text-sm text-ink capitalize'>{user?.verificationStatus?.toLowerCase().replace('_', ' ')}</p>
          </div>
        </div>
      </AccountShell>
    </>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/user-portal/src/components/layout/ apps/user-portal/src/app/account/profile/
git commit -m "feat(user-portal): header with search bar, watchlist link, avatar; AccountShell with profile nav"
```

---

### Task 16: Lot Detail — missing spec features

**Spec lines covered:**
- Standard state: Add to Watchlist button, Enquire/Condition buttons, trust marks, minimum bid notice, "From the same collection" 4-col related lots grid
- Live state: "You are leading/outbid" status line, bid activity feed, "Up Next" bottom strip
- Bid flow step 3: EMAIL_VERIFIED user → phone OTP inline modal (not redirect)
- SSE: "Reconnecting…" badge after 5 seconds of disconnect
- `auction_closed` event: disable bid input, show "This auction has closed" banner

**Files:**
- Modify: `apps/user-portal/src/app/auctions/[auctionId]/lots/[lotId]/lot-detail-client.tsx`
- Modify: `apps/user-portal/src/hooks/use-lot-sse.ts` — expose `isConnected` with 5s badge delay

- [ ] **Step 1: Update `useLotSse` to expose a `isReconnecting` flag (shows after 5s disconnected)**

In `apps/user-portal/src/hooks/use-lot-sse.ts`, add:
```typescript
const [isReconnecting, setIsReconnecting] = useState(false);
const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// In es.onerror:
es.onerror = () => {
  setIsConnected(false);
  es.close();
  // Show "Reconnecting…" badge only after 5 seconds
  reconnectTimerRef.current = setTimeout(() => setIsReconnecting(true), 5000);
  if (!cancelled) {
    setTimeout(() => {
      retryDelay.current = Math.min(retryDelay.current * 2, 30000);
      connect();
    }, retryDelay.current);
  }
};

// In es.onopen:
es.onopen = () => {
  setIsConnected(true);
  setIsReconnecting(false);
  if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
  retryDelay.current = 1000;
};

// Cleanup:
return () => {
  cancelled = true;
  if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
  esRef.current?.close();
};
```

Return: `{ lastEvent, isConnected, isReconnecting }`

- [ ] **Step 2: Update `lot-detail-client.tsx` — add all missing features**

Add these state variables at the top of `LotDetailClient`:
```typescript
const [bidActivity, setBidActivity] = useState<Array<{ paddle: string; amount: number; isYou: boolean }>>([]);
const [isLeading, setIsLeading] = useState(false);
const [auctionClosed, setAuctionClosed] = useState(false);
const [showPhoneModal, setShowPhoneModal] = useState(false);
```

Update the SSE effect to populate `bidActivity` and `isLeading`:
```typescript
if (lastEvent.type === 'bid_placed') {
  setLot(prev => ({ ...prev, currentBid: lastEvent.currentBid, bidCount: lastEvent.bidCount }));
  const isYou = !!user && lastEvent.bidderId === user.userId;
  setIsLeading(isYou);
  setBidActivity(prev => [{ paddle: isYou ? 'You' : `Paddle ${lastEvent.bidderId.slice(-4)}`, amount: lastEvent.currentBid, isYou }, ...prev.slice(0, 19)]);
  if (!isYou && user) setOutbidInfo({ yourBid: lot.currentBid, currentBid: lastEvent.currentBid });
}
if (lastEvent.type === 'auction_closed') {
  setAuctionClosed(true);
  setLot(prev => ({ ...prev, status: lastEvent.result }));
}
```

Update `placeBid` to show inline phone modal for EMAIL_VERIFIED users without phone:
```typescript
async function placeBid() {
  if (auctionClosed) return;
  const amount = Number(bidAmount);
  if (!amount || amount <= lot.currentBid) { /* ... toast ... */ return; }
  if (!user) { window.location.href = `/account/login?returnUrl=...`; return; }
  // EMAIL_VERIFIED with no phone → inline modal
  if (user.verificationStatus === 'EMAIL_VERIFIED') { setShowPhoneModal(true); return; }
  if (user.verificationStatus === 'PENDING_REVIEW') { setToast({ message: 'Your identity is under review.', type: 'info' }); return; }
  // ... rest of bid logic
}
```

Add to standard state JSX (after bid panel, before provenance):
```typescript
{/* Add to Watchlist + Enquire */}
<div className='flex gap-3 mb-6'>
  <button onClick={toggleWatchlist} className='flex-1 border border-[var(--line)] font-sans text-sm py-2 hover:bg-cream transition-colors'>
    ♡ Add to Watchlist
  </button>
  <button className='flex-1 border border-[var(--line)] font-sans text-sm py-2 hover:bg-cream transition-colors'>
    Enquire
  </button>
</div>

{/* Trust marks */}
<div className='flex gap-6 py-4 border-t border-[var(--line)] mb-6'>
  <p className='font-sans text-xs text-mut'>✓ Authenticity guaranteed</p>
  <p className='font-sans text-xs text-mut'>✓ Insured shipping worldwide</p>
</div>

{/* Minimum bid notice */}
<p className='font-sans text-xs text-mut text-center mb-2'>
  Minimum bid: {lot.currency.toUpperCase()} {(lot.currentBid + 100).toLocaleString()}
</p>
```

Add to standard state JSX (below two-column grid, before closing tag):
```typescript
{/* From the same collection */}
{relatedLots.length > 0 && (
  <div className='max-w-6xl mx-auto px-6 pb-16'>
    <h2 className='font-serif text-xl font-semibold text-ink mb-6'>From the same collection</h2>
    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
      {relatedLots.map(l => <LotCard key={l.lotId} {...l} />)}
    </div>
  </div>
)}
```

Add `relatedLots` state (fetched on mount):
```typescript
const [relatedLots, setRelatedLots] = useState<LotCardProps[]>([]);
useEffect(() => {
  fetch(`/api/catalogue/lots?auctionId=${lot.auctionId}&limit=4&exclude=${lot.id}`)
    .then(r => r.json())
    .then((d: { lots: LotCardProps[] }) => setRelatedLots(d.lots))
    .catch(() => {});
}, [lot.auctionId, lot.id]);
```

Add to live state JSX — status line, activity feed, Up Next strip:
```typescript
{/* Status line */}
{user && (
  <p className={`font-sans text-sm font-medium mb-4 ${isLeading ? 'text-[var(--gold)]' : 'text-red-400'}`}>
    {isLeading ? 'You are leading' : 'You\'ve been outbid'}
  </p>
)}

{/* Bid activity feed */}
{bidActivity.length > 0 && (
  <div className='border border-[var(--line)] divide-y divide-[var(--line)] mb-4 max-h-40 overflow-y-auto'>
    {bidActivity.map((entry, i) => (
      <div key={i} className='flex justify-between px-3 py-2 font-sans text-xs'>
        <span className={entry.isYou ? 'text-[var(--gold)]' : 'text-[var(--mut)]'}>{entry.paddle}</span>
        <span className='text-[var(--ink)]'>{lot.currency.toUpperCase()} {entry.amount.toLocaleString()}</span>
      </div>
    ))}
  </div>
)}
```

Add "Up Next" bottom strip (fetch next 2 lots by lotNumber):
```typescript
{/* Up Next */}
{nextLots.length > 0 && (
  <div className='border-t border-[var(--line)] mt-8 pt-4'>
    <p className='font-sans text-xs text-[var(--mut)] uppercase tracking-widest mb-3'>Up Next</p>
    <div className='flex gap-4'>
      {nextLots.map(l => (
        <Link key={l.lotId} href={`/auctions/${l.auctionId}/lots/${l.lotId}`} className='flex gap-3 items-center hover:opacity-80'>
          <div className='relative w-12 h-12 shrink-0'>
            <Image src={l.imageUrl} alt={l.title} fill className='object-cover' />
          </div>
          <div>
            <p className='font-sans text-xs text-[var(--mut)]'>Lot {l.lotNumber}</p>
            <p className='font-serif text-sm text-[var(--ink)] line-clamp-1'>{l.title}</p>
          </div>
        </Link>
      ))}
    </div>
  </div>
)}
```

Add `nextLots` state (fetched on mount, same auction, higher lot numbers):
```typescript
const [nextLots, setNextLots] = useState<LotCardProps[]>([]);
useEffect(() => {
  if (!isLive) return;
  fetch(`/api/catalogue/lots?auctionId=${lot.auctionId}&after=${lot.lotNumber}&limit=2`)
    .then(r => r.json())
    .then((d: { lots: LotCardProps[] }) => setNextLots(d.lots))
    .catch(() => {});
}, [isLive, lot.auctionId, lot.lotNumber]);
```

Add `auctionClosed` banner + disabled bid input:
```typescript
{auctionClosed && (
  <div className='bg-ink/10 border border-[var(--line)] px-4 py-3 mb-4 text-center'>
    <p className='font-sans text-sm font-medium text-ink'>This auction has closed</p>
  </div>
)}

{/* Bid input — disable when closed */}
<input disabled={auctionClosed} ... />
<button disabled={auctionClosed || isLoading} ... />
```

Add `isReconnecting` indicator (from `useLotSse`):
```typescript
const { lastEvent, isReconnecting } = useLotSse(lot.id);
// ...
{isReconnecting && (
  <div className='fixed bottom-4 left-1/2 -translate-x-1/2 bg-ink text-paper font-sans text-xs px-4 py-2 rounded-full'>
    Reconnecting…
  </div>
)}
```

Add inline phone OTP modal (renders when `showPhoneModal` is true — same UI as verify-phone page but as an overlay):
```typescript
{showPhoneModal && (
  <div className='fixed inset-0 bg-ink/60 flex items-center justify-center z-50'>
    <div className='bg-paper p-8 max-w-sm w-full mx-4'>
      <h2 className='font-serif text-xl font-semibold text-ink mb-4'>Verify your phone first</h2>
      <PhoneOtpInline onVerified={() => { setShowPhoneModal(false); placeBid(); }} onClose={() => setShowPhoneModal(false)} />
    </div>
  </div>
)}
```

Create `apps/user-portal/src/components/primitives/phone-otp-inline.tsx`:
```typescript
'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export function PhoneOtpInline({ onVerified, onClose }: { onVerified: () => void; onClose: () => void }) {
  const { accessToken } = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function requestCode() {
    setError(''); setIsLoading(true);
    const res = await fetch('/api/auth/phone/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ phone }),
    });
    setIsLoading(false);
    if (res.ok) setStep('otp');
    else { const d = await res.json() as { error?: string }; setError(d.error ?? 'Failed to send code'); }
  }

  async function verifyCode() {
    setError(''); setIsLoading(true);
    const res = await fetch('/api/auth/phone/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ otp }),
    });
    setIsLoading(false);
    if (res.ok) onVerified();
    else { const d = await res.json() as { error?: string }; setError(d.error ?? 'Invalid code'); }
  }

  return (
    <div className='space-y-4'>
      {step === 'phone' ? (
        <>
          <input value={phone} onChange={e => setPhone(e.target.value)} type='tel' placeholder='+61 400 000 000'
            className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
          {error && <p className='font-sans text-xs text-red-600'>{error}</p>}
          <button onClick={requestCode} disabled={isLoading || !phone}
            className='w-full bg-ink text-paper font-sans text-sm py-3 disabled:opacity-60'>
            {isLoading ? 'Sending…' : 'Send Code'}
          </button>
        </>
      ) : (
        <>
          <input value={otp} onChange={e => setOtp(e.target.value)} type='text' inputMode='numeric' maxLength={6}
            placeholder='000000' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-2xl tracking-widest text-center' />
          {error && <p className='font-sans text-xs text-red-600'>{error}</p>}
          <button onClick={verifyCode} disabled={isLoading || otp.length !== 6}
            className='w-full bg-ink text-paper font-sans text-sm py-3 disabled:opacity-60'>
            {isLoading ? 'Verifying…' : 'Verify'}
          </button>
        </>
      )}
      <button onClick={onClose} className='w-full font-sans text-sm text-mut hover:text-ink'>Cancel</button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/user-portal/src/app/auctions/ apps/user-portal/src/hooks/ apps/user-portal/src/components/primitives/phone-otp-inline.tsx
git commit -m "feat(user-portal): lot detail missing features — watchlist, trust marks, activity feed, Up Next, phone modal, reconnecting badge"
```

---

### Task 17: Auth page gaps — login links, verify-email resend, phone lockout

**Spec lines covered:**
- Login: "Forgot password link", "New? Create account" link
- Verify email: "resend option" on link expired
- Verify phone: "Max 3 attempts → 15-minute lockout displayed as countdown timer"

**Files:**
- Modify: `apps/user-portal/src/app/account/login/page.tsx`
- Modify: `apps/user-portal/src/app/account/verify-email/page.tsx`
- Modify: `apps/user-portal/src/app/account/verify-phone/page.tsx`

- [ ] **Step 1: Add Forgot password link and "New? Create account" cross-link to login page**

In `apps/user-portal/src/app/account/login/page.tsx`, in the Sign In tab form, add after the password field:
```typescript
<div className='flex justify-end'>
  <button type='button' className='font-sans text-xs text-mut hover:text-ink'>Forgot password?</button>
</div>
```

Below the Sign In button, add:
```typescript
<p className='font-sans text-xs text-center text-mut mt-4'>
  New? <button type='button' onClick={() => setTab('register')} className='text-ink underline'>Create account</button>
</p>
```

In the Create Account tab, below the button, add:
```typescript
<p className='font-sans text-xs text-center text-mut mt-4'>
  Already have an account? <button type='button' onClick={() => setTab('signin')} className='text-ink underline'>Sign in</button>
</p>
```

- [ ] **Step 2: Add resend option to verify-email page**

In `apps/user-portal/src/app/account/verify-email/page.tsx`, update the error state:
```typescript
const [resent, setResent] = useState(false);

async function resendEmail() {
  await fetch('/api/auth/resend-verification', { method: 'POST' });
  setResent(true);
}

// In the error JSX:
{status === 'error' && (
  <>
    <h1 className='font-serif text-2xl font-semibold text-ink mb-3'>Link expired</h1>
    <p className='font-sans text-sm text-mut mb-4'>This verification link has expired or already been used.</p>
    {resent ? (
      <p className='font-sans text-sm text-green-700'>New link sent — check your inbox.</p>
    ) : (
      <button onClick={resendEmail} className='font-sans text-sm text-ink underline'>Resend verification email</button>
    )}
  </>
)}
```

- [ ] **Step 3: Add 3-attempt lockout with countdown to verify-phone page**

In `apps/user-portal/src/app/account/verify-phone/page.tsx`, add attempt tracking and lockout:

```typescript
const [attempts, setAttempts] = useState(0);
const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
const [lockRemaining, setLockRemaining] = useState(0);

// Track lockout countdown
useEffect(() => {
  if (!lockedUntil) return;
  const interval = setInterval(() => {
    const remaining = Math.max(0, lockedUntil.getTime() - Date.now());
    setLockRemaining(Math.ceil(remaining / 1000));
    if (remaining <= 0) { setLockedUntil(null); setAttempts(0); }
  }, 1000);
  return () => clearInterval(interval);
}, [lockedUntil]);

// In verifyCode(), on failure:
const newAttempts = attempts + 1;
setAttempts(newAttempts);
if (newAttempts >= 3) {
  const until = new Date(Date.now() + 15 * 60 * 1000);
  setLockedUntil(until);
  setLockRemaining(15 * 60);
} else {
  setError(`Invalid code. ${3 - newAttempts} attempt${3 - newAttempts === 1 ? '' : 's'} remaining.`);
}
```

Render lockout screen when `lockedUntil` is set:
```typescript
if (lockedUntil) {
  const mins = Math.floor(lockRemaining / 60);
  const secs = lockRemaining % 60;
  return (
    <div className='min-h-screen bg-paper flex items-center justify-center'>
      <div className='text-center px-6'>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-3'>Too many attempts</h1>
        <p className='font-sans text-sm text-mut mb-4'>Try again in</p>
        <p className='font-serif text-4xl font-semibold text-ink'>{mins}:{String(secs).padStart(2, '0')}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/user-portal/src/app/account/login/ apps/user-portal/src/app/account/verify-email/ apps/user-portal/src/app/account/verify-phone/
git commit -m "feat(user-portal): auth page gaps — forgot password link, cross-links, verify-email resend, phone lockout"
```

---

### Task 18: Register-to-Bid Step 2 identity fields + Calendar tabs

**Spec lines covered:**
- Register-to-Bid Step 2: "Fields: Full legal name, Date of birth (DD/MM/YYYY), Residential address"
- Calendar: "Three tabs: Upcoming / Live Now / Results" (rendered as clickable tabs, not static sections)

**Files:**
- Modify: `apps/user-portal/src/app/account/register-to-bid/page.tsx`
- Modify: `apps/user-portal/src/app/calendar/page.tsx`

- [ ] **Step 1: Add legal name, DOB, address fields to Step 2 in register-to-bid page**

In `Step2Identity`, add a form with these fields before the file upload:

```typescript
const [legalName, setLegalName] = useState('');
const [dob, setDob] = useState('');
const [address, setAddress] = useState('');

// Validate before allowing file submission:
if (!legalName || !dob || !address) {
  setError('Please complete all fields');
  return;
}
```

Render the fields:
```typescript
<div className='space-y-4 mb-6'>
  <div>
    <label className='block font-sans text-sm font-medium text-ink mb-1'>Full legal name</label>
    <input value={legalName} onChange={e => setLegalName(e.target.value)} type='text' placeholder='As it appears on your ID'
      className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
  </div>
  <div>
    <label className='block font-sans text-sm font-medium text-ink mb-1'>Date of birth</label>
    <input value={dob} onChange={e => setDob(e.target.value)} type='text' placeholder='DD/MM/YYYY'
      className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
  </div>
  <div>
    <label className='block font-sans text-sm font-medium text-ink mb-1'>Residential address</label>
    <input value={address} onChange={e => setAddress(e.target.value)} type='text' placeholder='Street address, suburb, state, postcode'
      className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
  </div>
</div>
```

- [ ] **Step 2: Update Calendar page to use actual tabs (client component)**

Convert `apps/user-portal/src/app/calendar/page.tsx` to a client component with tab state. Keep the data fetching in a parent RSC + pass data as props, or use SWR in the client component:

```typescript
'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';

type Auction = { id: string; title: string; saleDate: string; lotCount: number; status: 'upcoming' | 'open' | 'closed'; location: string };
type Tab = 'upcoming' | 'live' | 'results';

const fetcher = (url: string) => fetch(url).then(r => r.json());

function AuctionRow({ auction }: { auction: Auction }) {
  const date = new Date(auction.saleDate);
  return (
    <div className='flex items-center gap-6 bg-paper border border-[var(--line)] p-5'>
      <div className='w-16 text-center shrink-0'>
        <p className='font-serif text-2xl font-semibold text-ink'>{date.getDate()}</p>
        <p className='font-sans text-xs text-mut uppercase'>{date.toLocaleString('en-AU', { month: 'short' })}</p>
      </div>
      <div className='flex-1 min-w-0'>
        <p className='font-serif text-base font-semibold text-ink truncate'>{auction.title}</p>
        <p className='font-sans text-sm text-mut'>{auction.lotCount} lots · {auction.location}</p>
      </div>
      {auction.status === 'open'
        ? <a href={`/auctions/${auction.id}`} className='shrink-0 bg-ink text-paper font-sans text-sm px-5 py-2 hover:bg-ink/90'>View Catalogue</a>
        : <button className='shrink-0 border border-[var(--line)] font-sans text-sm px-5 py-2 text-mut hover:text-ink'>Register Interest</button>}
    </div>
  );
}

export default function CalendarPage() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const { data } = useSWR<{ auctions: Auction[] }>('/api/catalogue/auctions?limit=50', fetcher, { revalidateOnFocus: false });

  const auctions = data?.auctions ?? [];
  const filtered = {
    upcoming: auctions.filter(a => a.status === 'upcoming'),
    live:     auctions.filter(a => a.status === 'open'),
    results:  auctions.filter(a => a.status === 'closed'),
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'live',     label: 'Live Now' },
    { key: 'results',  label: 'Results' },
  ];

  return (
    <>
      <Header />
      <div className='max-w-4xl mx-auto px-6 py-12'>
        <h1 className='font-serif text-3xl font-semibold text-ink mb-8'>Auction Calendar</h1>

        {/* Tab bar */}
        <div className='flex border-b border-[var(--line)] mb-8'>
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-6 pb-3 font-sans text-sm font-medium transition-colors ${tab === key ? 'border-b-2 border-ink text-ink' : 'text-mut hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className='flex flex-col gap-3'>
          {filtered[tab].length === 0
            ? <p className='font-sans text-sm text-mut'>No auctions in this category.</p>
            : filtered[tab].map(a => <AuctionRow key={a.id} auction={a} />)}
        </div>
      </div>
    </>
  );
}
```

Add `/api/catalogue/auctions` proxy route:
```typescript
// apps/user-portal/src/app/api/catalogue/auctions/route.ts
import { NextRequest, NextResponse } from 'next/server';
const CATALOGUE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';
export async function GET(request: NextRequest) {
  const res = await fetch(`${CATALOGUE_URL}/api/auctions${request.nextUrl.search}`, { cache: 'no-store' });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/user-portal/src/app/account/register-to-bid/ apps/user-portal/src/app/calendar/ apps/user-portal/src/app/api/catalogue/auctions/
git commit -m "feat(user-portal): register-to-bid identity fields; calendar with tab navigation"
```

---

### Task 19: Mobile responsive — bottom nav, sticky bid bar, account tab strip

**Spec lines covered:**
- "Mobile (<768px): single-column. Lot detail stacks gallery above bid panel. Account pages hide sidebar, use a top tab strip instead. Header collapses to wordmark + hamburger."
- "Home: dark hero + 2-col 'Closing soon' grid + bottom nav bar (Home / Browse / Watch / Bids)"
- "Lot detail: full-bleed image top, info + 'Place Bid · $X' sticky bottom bar"
- "Tablet (768–1279px): lot grids reduce to 2-col; sidebar filters collapse to a drawer"

**Files:**
- Create: `apps/user-portal/src/components/layout/mobile-bottom-nav.tsx`
- Create: `apps/user-portal/src/components/layout/mobile-account-tabs.tsx`
- Modify: `apps/user-portal/src/app/layout.tsx` — add MobileBottomNav
- Modify: `apps/user-portal/src/components/layout/account-shell.tsx` — show tab strip on mobile, hide sidebar
- Modify: `apps/user-portal/src/app/auctions/[auctionId]/lots/[lotId]/lot-detail-client.tsx` — sticky bottom bar on mobile

- [ ] **Step 1: Create `apps/user-portal/src/components/layout/mobile-bottom-nav.tsx`**

```typescript
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/',                  label: 'Home',   icon: '⌂' },
  { href: '/auctions',          label: 'Browse', icon: '⊞' },
  { href: '/account/watchlist', label: 'Watch',  icon: '♡' },
  { href: '/account/bids',      label: 'Bids',   icon: '↑' },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className='md:hidden fixed bottom-0 left-0 right-0 bg-paper border-t border-[var(--line)] flex z-40'>
      {NAV.map(({ href, label, icon }) => {
        const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
        return (
          <Link key={href} href={href}
            className={`flex-1 flex flex-col items-center py-3 gap-1 font-sans text-[10px] ${isActive ? 'text-ink font-semibold' : 'text-mut'}`}>
            <span className='text-base leading-none'>{icon}</span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Add `MobileBottomNav` to root layout**

In `apps/user-portal/src/app/layout.tsx`:
```typescript
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
// inside body, after AuthProvider children:
<MobileBottomNav />
<div className='pb-16 md:pb-0'>{children}</div>  {/* bottom padding on mobile for nav bar */}
```

- [ ] **Step 3: Update AccountShell to show mobile tab strip**

In `account-shell.tsx`, the sidebar already uses `hidden md:block` (or similar). Add mobile tabs above `<main>`:
```typescript
{/* Mobile: horizontal tab strip */}
<div className='md:hidden flex overflow-x-auto border-b border-[var(--line)] mb-6 -mx-6 px-6'>
  {NAV.map(({ href, label }) => {
    const isActive = pathname.startsWith(href);
    return (
      <Link key={href} href={href}
        className={`shrink-0 pb-3 px-3 font-sans text-sm whitespace-nowrap border-b-2 transition-colors ${isActive ? 'border-ink text-ink font-medium' : 'border-transparent text-mut hover:text-ink'}`}>
        {label}
      </Link>
    );
  })}
</div>
```

Wrap the `<aside>` in `hidden md:block`:
```typescript
<aside className='w-56 shrink-0 hidden md:block'>
```

- [ ] **Step 4: Add sticky bottom bid bar to lot detail on mobile**

In `lot-detail-client.tsx`, add at the bottom of the JSX (inside AppShell, at the root level):
```typescript
{/* Mobile sticky bid bar */}
<div className='md:hidden fixed bottom-0 left-0 right-0 bg-paper border-t border-[var(--line)] flex items-center gap-3 px-4 py-3 z-40'>
  <div className='flex-1'>
    <p className='font-sans text-xs text-mut'>Current bid</p>
    <p className='font-sans text-sm font-semibold text-ink'>{lot.currency.toUpperCase()} {lot.currentBid.toLocaleString()}</p>
  </div>
  <button onClick={placeBid} disabled={auctionClosed}
    className='bg-ink text-paper font-sans text-sm font-medium px-6 py-3 disabled:opacity-60'>
    Place Bid · {lot.currency.toUpperCase()} {bidAmount || (lot.currentBid + 100).toLocaleString()}
  </button>
</div>
```

Also add `pb-20 md:pb-0` to the lot detail wrapper div so content isn't hidden behind the sticky bar on mobile.

- [ ] **Step 5: Commit**

```bash
git add apps/user-portal/src/components/layout/mobile-bottom-nav.tsx apps/user-portal/src/app/layout.tsx apps/user-portal/src/components/layout/account-shell.tsx apps/user-portal/src/app/auctions/
git commit -m "feat(user-portal): mobile responsive — bottom nav, sticky bid bar, account tab strip"
```

---

### Task 20: Sale Catalogue — sort, pagination, ♡ Follow Sale; next-intl

**Spec lines covered:**
- Sale Catalogue: "Action bar: Register to Bid / Download PDF Catalogue / ♡ Follow Sale"
- Sale Catalogue: "Paginated lot grid (4-col desktop), sortable: Lot Number / Ending Soonest / Price"
- Tech Stack: "next-intl (currency + date formatting only; English at launch)"

**Files:**
- Modify: `apps/user-portal/package.json` — add next-intl
- Modify: `apps/user-portal/src/app/auctions/[auctionId]/page.tsx` — add sort, pagination, Follow Sale

- [ ] **Step 1: Add next-intl to package.json**

In `apps/user-portal/package.json` dependencies, add:
```json
"next-intl": "^3.14.0"
```

Run `pnpm install`.

Create `apps/user-portal/src/i18n.ts`:
```typescript
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => ({
  locale: 'en-AU',
  messages: {},
  formats: {
    number: {
      currency: { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 },
    },
    dateTime: {
      short: { day: 'numeric', month: 'short', year: 'numeric' },
    },
  },
}));
```

Use `useFormatter` from `next-intl` in client components for currency and date formatting instead of `.toLocaleString('en-AU')` — e.g.:
```typescript
import { useFormatter } from 'next-intl';
const format = useFormatter();
// format.number(amount, { style: 'currency', currency: 'AUD' })
```

For RSC pages use `getFormatter` from `next-intl/server`.

- [ ] **Step 2: Convert Sale Catalogue page to client component with sort + pagination**

Convert `apps/user-portal/src/app/auctions/[auctionId]/page.tsx` to a hybrid: RSC fetches auction details (rarely changes), client component handles lot grid with sort + pagination via SWR:

Create `apps/user-portal/src/app/auctions/[auctionId]/catalogue-lots.tsx` (client component):
```typescript
'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { LotCard } from '@/components/primitives/lot-card';

type Lot = { id: string; auctionId: string; lotNumber: string; title: string; imageUrl: string; currentBid: number; currency: string; endAt: string };
type Sort = 'lotNumber' | 'endAt' | 'price';

const fetcher = (url: string) => fetch(url).then(r => r.json());
const PAGE_SIZE = 24;

export function CatalogueLots({ auctionId }: { auctionId: string }) {
  const [sort, setSort] = useState<Sort>('lotNumber');
  const [page, setPage] = useState(1);

  const { data } = useSWR<{ lots: Lot[]; total: number }>(
    `/api/catalogue/lots?auctionId=${auctionId}&sort=${sort}&page=${page}&limit=${PAGE_SIZE}`,
    fetcher,
    { refreshInterval: 30000 },
  );

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className='max-w-7xl mx-auto px-6 py-12'>
      {/* Sort controls */}
      <div className='flex items-center justify-between mb-6'>
        <p className='font-sans text-sm text-mut'>{data?.total ?? '—'} lots</p>
        <div className='flex gap-2'>
          {([['lotNumber', 'Lot Number'], ['endAt', 'Ending Soonest'], ['price', 'Price']] as [Sort, string][]).map(([val, label]) => (
            <button key={val} onClick={() => { setSort(val); setPage(1); }}
              className={`font-sans text-xs px-3 py-1.5 border transition-colors ${sort === val ? 'bg-ink text-paper border-ink' : 'border-[var(--line)] text-mut hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lot grid */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-8'>
        {data?.lots.map(lot => <LotCard key={lot.id} {...lot} />)}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex items-center justify-center gap-2'>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className='font-sans text-sm px-4 py-2 border border-[var(--line)] text-mut hover:text-ink disabled:opacity-40'>
            ← Prev
          </button>
          <span className='font-sans text-sm text-mut px-4'>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className='font-sans text-sm px-4 py-2 border border-[var(--line)] text-mut hover:text-ink disabled:opacity-40'>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
```

Update `apps/user-portal/src/app/auctions/[auctionId]/page.tsx` to use `CatalogueLots` and add ♡ Follow Sale button:
```typescript
// In the Action bar section, add Follow Sale:
<button className='border border-[var(--line)] font-sans text-sm px-4 py-2 text-ink hover:bg-paper transition-colors flex items-center gap-2'>
  <span>♡</span> Follow Sale
</button>

// Replace the lot grid with:
<CatalogueLots auctionId={params.auctionId} />
```

- [ ] **Step 3: Commit**

```bash
git add apps/user-portal/package.json apps/user-portal/src/i18n.ts apps/user-portal/src/app/auctions/[auctionId]/
git commit -m "feat(user-portal): sale catalogue sort + pagination + follow sale; add next-intl"
```

---

## Updated Self-Review — Full Spec Coverage

| Spec requirement | Task |
|---|---|
| next-intl for currency/date | Task 20 |
| Header: search bar (300ms debounce), Watchlist link, user avatar | Task 15 |
| AccountShell: avatar, "Collector since YYYY", Profile & Paddle nav | Task 15 |
| /account/profile page | Task 15 |
| Calendar: tabbed UI (Upcoming / Live Now / Results) | Task 18 |
| Browse: Department, Status, Auction filter checkboxes | ⚠️ See note below |
| Browse: price range slider | ⚠️ See note below |
| Sale Catalogue: ♡ Follow Sale, sort controls, pagination | Task 20 |
| Sale Catalogue: viewing dates in hero | ⚠️ Requires `viewingDates` field from catalogue service |
| Lot Detail standard: Add to Watchlist, Enquire, trust marks, min bid notice | Task 16 |
| Lot Detail standard: "From the same collection" grid | Task 16 |
| Lot Detail live: status line (leading/outbid), activity feed, Up Next strip | Task 16 |
| Lot Detail: phone OTP inline modal on bid attempt | Task 16 |
| SSE reconnecting badge after 5s | Task 16 |
| auction_closed: disable bid input, show banner | Task 16 |
| Login: Forgot password link, cross-links between tabs | Task 17 |
| Verify email: resend option | Task 17 |
| Verify phone: 3-attempt lockout with countdown | Task 17 |
| Register-to-Bid Step 2: legal name, DOB, address fields | Task 18 |
| Mobile: bottom nav bar (Home/Browse/Watch/Bids) | Task 19 |
| Mobile: sticky bid bar on lot detail | Task 19 |
| Mobile: account top tab strip, hidden sidebar | Task 19 |
| Mobile: header hamburger menu | ⚠️ See note below |

**⚠️ Remaining deferred items (low risk, can be added later):**
- Browse page: Department, Status, Auction multi-select filter checkboxes (requires catalogue service to expose filter counts)
- Browse page: dual-handle price range slider (needs a slider library e.g. `@radix-ui/react-slider`)
- Sale Catalogue: "viewing dates" (requires catalogue service schema addition)
- Mobile header: hamburger/drawer menu (nav collapsed behind hamburger on mobile)

These are deferred because they either require catalogue service schema changes or an additional UI library — they do not block launch of the user portal.

