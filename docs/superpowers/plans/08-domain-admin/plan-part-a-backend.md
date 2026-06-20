# Admin Service — Part A: Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Admin Service — a Hono proxy that forwards all admin operations to downstream services (Catalogue, Auction, User, Payment, Shipping) with no database of its own.

**Architecture:** No domain layer, no database. A `ServiceClient` abstraction wraps `fetch` and forwards the admin JWT. Each router group handles one domain. Errors from downstream services propagate directly to the Admin Portal.

**Tech Stack:** Hono, `@carat-room/shared-auth`, Vitest.

## Global Constraints

- Node.js 20, TypeScript 5.4, strict mode
- Hono only — no Express, no database, no ORM
- Named exports only — no `export default` (exception: `vitest.config.ts`)
- Single quotes; `const`/`let` only
- Service port: **3005**
- All requests require `role: ADMIN` JWT (enforced by `authMiddleware` on every route)
- Admin JWT forwarded as-is to all downstream service calls
- Downstream URLs from env vars (e.g. `CATALOGUE_SERVICE_URL=http://catalogue-service:3001`)
- All responses pass through unchanged — no re-wrapping
- Frontend plan (Admin Portal Next.js app) is a separate session

---

## File Map

```
apps/admin/
  package.json
  tsconfig.json
  vitest.config.ts
  Dockerfile
  src/
    infrastructure/
      service-client.ts         — typed fetch wrapper, forwards JWT, propagates status codes
      service-client.test.ts    — 4 tests
    presentation/
      lots-router.ts            — 6 lot + image routes
      categories-router.ts      — 4 category routes
      auctions-router.ts        — 5 auction routes
      users-router.ts           — 5 user routes
      invoices-router.ts        — 4 invoice routes
      fulfilments-router.ts     — 4 fulfilment routes
      reports-router.ts         — 3 report routes
      routers.test.ts           — 12 route tests (2 per router group)
    main.ts
```

**Total tests: 16**

---

### Task 1: Scaffold

**Files:**
- Create: `apps/admin/package.json`
- Create: `apps/admin/tsconfig.json`
- Create: `apps/admin/vitest.config.ts`
- Create: `apps/admin/Dockerfile`

**Interfaces:**
- Produces: runnable TypeScript scaffold — no migration, Admin Service has no database

- [ ] **Step 1: Create `apps/admin/package.json`**

```json
{
  "name": "@carat-room/admin",
  "version": "0.0.1",
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
    "@hono/node-server": "^1.12.0",
    "hono": "^4.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.15.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `apps/admin/tsconfig.json`**

```json
{
  "extends": "@carat-room/tsconfig/service.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `apps/admin/vitest.config.ts`**

```typescript
export default { test: { environment: 'node' } };
```

- [ ] **Step 4: Create `apps/admin/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
EXPOSE 3005
CMD ["node", "dist/main.js"]
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/
git commit -m "feat(admin): scaffold package and config"
```

---

### Task 2: ServiceClient

**Files:**
- Create: `apps/admin/src/infrastructure/service-client.ts`
- Test: `apps/admin/src/infrastructure/service-client.test.ts`

**Interfaces:**
- Produces:
  - `ServiceError` class with `.status: number` and `.body: unknown`
  - `ServiceClient` class — `new ServiceClient(baseUrl: string)` with `.get<T>(path, token)`, `.post<T>(path, token, body?)`, `.patch<T>(path, token, body?)`, `.delete<T>(path, token)` all returning `Promise<T>` or throwing `ServiceError`
  - All routers in Tasks 3–4 use `ServiceClient` instances injected via constructor

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/src/infrastructure/service-client.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ServiceClient, ServiceError } from './service-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
afterEach(() => vi.clearAllMocks());

describe('ServiceClient', () => {
  const client = new ServiceClient('http://catalogue-service:3001');

  it('should_returnParsedJson_when_responseIsOk', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'lot-1' } }),
    });

    const result = await client.get<{ data: { id: string } }>('/api/lots/lot-1', 'token-abc');

    expect(result).toEqual({ data: { id: 'lot-1' } });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://catalogue-service:3001/api/lots/lot-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }),
      }),
    );
  });

  it('should_throwServiceError_when_responseIsNotOk', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { code: 'NOT_FOUND' } }),
    });

    await expect(client.get('/api/lots/missing', 'token-abc')).rejects.toThrow(ServiceError);
  });

  it('should_sendBodyAsJson_when_posting', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: { id: 'lot-2' } }) });

    await client.post('/api/lots', 'token-abc', { title: 'Ruby Ring' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://catalogue-service:3001/api/lots',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Ruby Ring' }) }),
    );
  });

  it('should_preserveStatusCode_when_serviceErrorThrown', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: { code: 'FORBIDDEN' } }),
    });

    const err = await client.get('/api/lots', 'bad-token').catch(e => e);

    expect(err).toBeInstanceOf(ServiceError);
    expect(err.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/admin
npx vitest run src/infrastructure/service-client.test.ts
```

Expected: FAIL — `Cannot find module './service-client'`

- [ ] **Step 3: Create `apps/admin/src/infrastructure/service-client.ts`**

```typescript
export class ServiceError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super('ServiceError');
  }
}

export class ServiceClient {
  constructor(private readonly baseUrl: string) {}

  async get<T>(path: string, token: string): Promise<T> {
    return this.request<T>('GET', path, token);
  }

  async post<T>(path: string, token: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, token, body);
  }

  async patch<T>(path: string, token: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, token, body);
  }

  async delete<T>(path: string, token: string): Promise<T> {
    return this.request<T>('DELETE', path, token);
  }

  private async request<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) {
      throw new ServiceError(res.status, json);
    }
    return json as T;
  }
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run src/infrastructure/service-client.test.ts
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/infrastructure/
git commit -m "feat(admin): ServiceClient with JWT forwarding and ServiceError propagation"
```

---

### Task 3: Lots, Categories, Auctions Routers

**Files:**
- Create: `apps/admin/src/presentation/lots-router.ts`
- Create: `apps/admin/src/presentation/categories-router.ts`
- Create: `apps/admin/src/presentation/auctions-router.ts`
- Create: `apps/admin/src/presentation/routers.test.ts`

**Interfaces:**
- Consumes: `ServiceClient`, `ServiceError` from Task 2; `authMiddleware` from `@carat-room/shared-auth`
- Produces: `buildLotsRouter`, `buildCategoriesRouter`, `buildAuctionsRouter` — each `(client: ServiceClient): Hono`

**Handler pattern used everywhere:**
```typescript
// Extract token from incoming Authorization header and forward it downstream
const t = c.req.header('Authorization')?.replace('Bearer ', '') ?? '';
// Wrap call in proxy() to catch ServiceError and return same status
return proxy(() => client.method('/api/path', t, body), c);
```

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/src/presentation/routers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { ServiceClient } from '../infrastructure/service-client';
import { buildLotsRouter } from './lots-router';
import { buildCategoriesRouter } from './categories-router';
import { buildAuctionsRouter } from './auctions-router';

vi.mock('@carat-room/shared-auth', () => ({
  authMiddleware: () => async (
    c: { set: (k: string, v: unknown) => void },
    next: () => Promise<void>,
  ) => {
    c.set('jwtPayload', { sub: 'admin-1', role: 'ADMIN' });
    await next();
  },
}));

vi.mock('../infrastructure/service-client');

let mockClient: ServiceClient;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = new ServiceClient('http://mock');
});

const authHeader = () => ({ Authorization: 'Bearer admin-token' });

describe('Lots router', () => {
  it('should_return200_when_postingNewLot', async () => {
    vi.mocked(mockClient.post).mockResolvedValue({ data: { id: 'lot-1' } });
    const app = new Hono().route('/', buildLotsRouter(mockClient));

    const res = await app.request('/admin/api/lots', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Diamond Ring' }),
    });

    expect(res.status).toBe(200);
    expect(mockClient.post).toHaveBeenCalledWith('/api/lots', 'admin-token', expect.any(Object));
  });

  it('should_propagateStatusCode_when_downstreamReturnsError', async () => {
    const { ServiceError } = await import('../infrastructure/service-client');
    vi.mocked(mockClient.patch).mockRejectedValue(new ServiceError(404, { error: { code: 'NOT_FOUND' } }));
    const app = new Hono().route('/', buildLotsRouter(mockClient));

    const res = await app.request('/admin/api/lots/lot-1', {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });

    expect(res.status).toBe(404);
  });
});

describe('Categories router', () => {
  it('should_return200_when_listingCategories', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ data: [] });
    const app = new Hono().route('/', buildCategoriesRouter(mockClient));

    const res = await app.request('/admin/api/categories', { headers: authHeader() });

    expect(res.status).toBe(200);
    expect(mockClient.get).toHaveBeenCalledWith('/api/categories', 'admin-token');
  });

  it('should_return200_when_creatingCategory', async () => {
    vi.mocked(mockClient.post).mockResolvedValue({ data: { id: 'cat-1' } });
    const app = new Hono().route('/', buildCategoriesRouter(mockClient));

    const res = await app.request('/admin/api/categories', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Rings', slug: 'rings' }),
    });

    expect(res.status).toBe(200);
  });
});

describe('Auctions router', () => {
  it('should_return200_when_schedulingAuction', async () => {
    vi.mocked(mockClient.post).mockResolvedValue({ data: { lotId: 'lot-1' } });
    const app = new Hono().route('/', buildAuctionsRouter(mockClient));

    const res = await app.request('/admin/api/auctions', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotId: 'lot-1', startAt: '2026-07-01T10:00:00Z', endAt: '2026-07-01T12:00:00Z', reservePrice: 500, minBidIncrement: 10, autoExtendWindowMinutes: 3, autoExtendDurationMinutes: 3 }),
    });

    expect(res.status).toBe(200);
  });

  it('should_return200_when_listingAuctions', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ data: [] });
    const app = new Hono().route('/', buildAuctionsRouter(mockClient));

    const res = await app.request('/admin/api/auctions', { headers: authHeader() });

    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/presentation/routers.test.ts
```

Expected: FAIL — `Cannot find module './lots-router'`

- [ ] **Step 3: Create `apps/admin/src/presentation/lots-router.ts`**

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';

type Ctx = Parameters<Parameters<Hono['get']>[1]>[0];

function tok(c: Ctx): string {
  return c.req.header('Authorization')?.replace('Bearer ', '') ?? '';
}

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 401 | 403 | 404 | 409 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

export function buildLotsRouter(client: ServiceClient): Hono {
  const r = new Hono();

  r.post('/admin/api/lots', authMiddleware(), async c =>
    proxy(() => client.post('/api/lots', tok(c), await c.req.json()), c));

  r.patch('/admin/api/lots/:id', authMiddleware(), async c =>
    proxy(() => client.patch(`/api/lots/${c.req.param('id')}`, tok(c), await c.req.json()), c));

  r.delete('/admin/api/lots/:id', authMiddleware(), async c =>
    proxy(() => client.delete(`/api/lots/${c.req.param('id')}`, tok(c)), c));

  r.post('/admin/api/lots/:id/images/upload-url', authMiddleware(), async c =>
    proxy(() => client.post(`/api/lots/${c.req.param('id')}/images/upload-url`, tok(c), await c.req.json()), c));

  r.delete('/admin/api/lots/:id/images/:imageId', authMiddleware(), async c =>
    proxy(() => client.delete(`/api/lots/${c.req.param('id')}/images/${c.req.param('imageId')}`, tok(c)), c));

  r.patch('/admin/api/lots/:id/images/reorder', authMiddleware(), async c =>
    proxy(() => client.patch(`/api/lots/${c.req.param('id')}/images/reorder`, tok(c), await c.req.json()), c));

  return r;
}
```

- [ ] **Step 4: Create `apps/admin/src/presentation/categories-router.ts`**

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';

type Ctx = Parameters<Parameters<Hono['get']>[1]>[0];

function tok(c: Ctx): string {
  return c.req.header('Authorization')?.replace('Bearer ', '') ?? '';
}

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 404 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

export function buildCategoriesRouter(client: ServiceClient): Hono {
  const r = new Hono();

  r.get('/admin/api/categories', authMiddleware(), async c =>
    proxy(() => client.get('/api/categories', tok(c)), c));

  r.post('/admin/api/categories', authMiddleware(), async c =>
    proxy(() => client.post('/api/categories', tok(c), await c.req.json()), c));

  r.patch('/admin/api/categories/:id', authMiddleware(), async c =>
    proxy(() => client.patch(`/api/categories/${c.req.param('id')}`, tok(c), await c.req.json()), c));

  r.delete('/admin/api/categories/:id', authMiddleware(), async c =>
    proxy(() => client.delete(`/api/categories/${c.req.param('id')}`, tok(c)), c));

  return r;
}
```

- [ ] **Step 5: Create `apps/admin/src/presentation/auctions-router.ts`**

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';

type Ctx = Parameters<Parameters<Hono['get']>[1]>[0];

function tok(c: Ctx): string {
  return c.req.header('Authorization')?.replace('Bearer ', '') ?? '';
}

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 404 | 409 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

export function buildAuctionsRouter(client: ServiceClient): Hono {
  const r = new Hono();

  r.get('/admin/api/auctions', authMiddleware(), async c =>
    proxy(() => client.get('/api/auctions', tok(c)), c));

  r.get('/admin/api/auctions/:lotId', authMiddleware(), async c =>
    proxy(() => client.get(`/api/auctions/${c.req.param('lotId')}`, tok(c)), c));

  r.post('/admin/api/auctions', authMiddleware(), async c =>
    proxy(() => client.post('/api/auctions', tok(c), await c.req.json()), c));

  r.patch('/admin/api/auctions/:lotId/reschedule', authMiddleware(), async c =>
    proxy(() => client.patch(`/api/auctions/${c.req.param('lotId')}/reschedule`, tok(c), await c.req.json()), c));

  r.delete('/admin/api/auctions/:lotId', authMiddleware(), async c =>
    proxy(() => client.delete(`/api/auctions/${c.req.param('lotId')}`, tok(c)), c));

  return r;
}
```

- [ ] **Step 6: Run to verify pass**

```bash
npx vitest run src/presentation/routers.test.ts
```

Expected: 6 passed

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/presentation/lots-router.ts apps/admin/src/presentation/categories-router.ts apps/admin/src/presentation/auctions-router.ts apps/admin/src/presentation/routers.test.ts
git commit -m "feat(admin): lots, categories, auctions proxy routers"
```

---

### Task 4: Users, Invoices, Fulfilments, Reports Routers + main.ts

**Files:**
- Create: `apps/admin/src/presentation/users-router.ts`
- Create: `apps/admin/src/presentation/invoices-router.ts`
- Create: `apps/admin/src/presentation/fulfilments-router.ts`
- Create: `apps/admin/src/presentation/reports-router.ts`
- Modify: `apps/admin/src/presentation/routers.test.ts` — append 6 more tests
- Create: `apps/admin/src/main.ts`

**Interfaces:**
- Consumes: `ServiceClient`, `ServiceError` from Task 2; `authMiddleware` from `@carat-room/shared-auth`
- Produces: remaining 4 routers + wired `main.ts`

- [ ] **Step 1: Append failing tests to `apps/admin/src/presentation/routers.test.ts`**

Add these imports at the top of the file (after existing imports):

```typescript
import { buildUsersRouter } from './users-router';
import { buildInvoicesRouter } from './invoices-router';
import { buildFulfilmentsRouter } from './fulfilments-router';
import { buildReportsRouter } from './reports-router';
```

Append these `describe` blocks at the bottom of the file:

```typescript
describe('Users router', () => {
  it('should_return200_when_listingUsers', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ data: [] });
    const app = new Hono().route('/', buildUsersRouter(mockClient));

    const res = await app.request('/admin/api/users', { headers: authHeader() });

    expect(res.status).toBe(200);
    expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('/api/users'), 'admin-token');
  });

  it('should_return200_when_suspendingUser', async () => {
    vi.mocked(mockClient.patch).mockResolvedValue({ data: { id: 'user-1' } });
    const app = new Hono().route('/', buildUsersRouter(mockClient));

    const res = await app.request('/admin/api/users/user-1/suspend', {
      method: 'PATCH',
      headers: authHeader(),
    });

    expect(res.status).toBe(200);
    expect(mockClient.patch).toHaveBeenCalledWith('/api/users/user-1/suspend', 'admin-token', undefined);
  });
});

describe('Invoices router', () => {
  it('should_return200_when_listingInvoices', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ data: [] });
    const app = new Hono().route('/', buildInvoicesRouter(mockClient));

    const res = await app.request('/admin/api/invoices', { headers: authHeader() });

    expect(res.status).toBe(200);
  });

  it('should_return200_when_cancellingInvoice', async () => {
    vi.mocked(mockClient.patch).mockResolvedValue({ data: { id: 'inv-1' } });
    const app = new Hono().route('/', buildInvoicesRouter(mockClient));

    const res = await app.request('/admin/api/invoices/inv-1/cancel', {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Customer request' }),
    });

    expect(res.status).toBe(200);
  });
});

describe('Fulfilments + Reports routers', () => {
  it('should_return200_when_dispatchingFulfilment', async () => {
    vi.mocked(mockClient.patch).mockResolvedValue({ data: { id: 'ful-1' } });
    const app = new Hono().route('/', buildFulfilmentsRouter(mockClient));

    const res = await app.request('/admin/api/fulfilments/ful-1/dispatch', {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingNumber: 'TRK123', carrier: 'AusPost' }),
    });

    expect(res.status).toBe(200);
  });

  it('should_return200_when_fetchingRevenueReport', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ data: {} });
    const app = new Hono().route('/', buildReportsRouter(mockClient));

    const res = await app.request('/admin/api/reports/revenue', { headers: authHeader() });

    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/presentation/routers.test.ts
```

Expected: 6 new tests FAIL — `Cannot find module './users-router'`

- [ ] **Step 3: Create `apps/admin/src/presentation/users-router.ts`**

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';

type Ctx = Parameters<Parameters<Hono['get']>[1]>[0];
const tok = (c: Ctx) => c.req.header('Authorization')?.replace('Bearer ', '') ?? '';

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 404 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

export function buildUsersRouter(client: ServiceClient): Hono {
  const r = new Hono();

  r.get('/admin/api/users', authMiddleware(), async c =>
    proxy(() => client.get(`/api/users?${new URLSearchParams(c.req.query() as Record<string, string>)}`, tok(c)), c));

  r.get('/admin/api/users/:id', authMiddleware(), async c =>
    proxy(() => client.get(`/api/users/${c.req.param('id')}`, tok(c)), c));

  r.patch('/admin/api/users/:id/suspend', authMiddleware(), async c =>
    proxy(() => client.patch(`/api/users/${c.req.param('id')}/suspend`, tok(c), undefined), c));

  r.patch('/admin/api/users/:id/reinstate', authMiddleware(), async c =>
    proxy(() => client.patch(`/api/users/${c.req.param('id')}/reinstate`, tok(c), undefined), c));

  r.patch('/admin/api/users/:id/approve', authMiddleware(), async c =>
    proxy(() => client.patch(`/api/users/${c.req.param('id')}/approve`, tok(c), undefined), c));

  return r;
}
```

- [ ] **Step 4: Create `apps/admin/src/presentation/invoices-router.ts`**

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';

type Ctx = Parameters<Parameters<Hono['get']>[1]>[0];
const tok = (c: Ctx) => c.req.header('Authorization')?.replace('Bearer ', '') ?? '';

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 404 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

export function buildInvoicesRouter(client: ServiceClient): Hono {
  const r = new Hono();

  r.get('/admin/api/invoices', authMiddleware(), async c =>
    proxy(() => client.get(`/api/payments/invoices?${new URLSearchParams(c.req.query() as Record<string, string>)}`, tok(c)), c));

  r.get('/admin/api/invoices/:id', authMiddleware(), async c =>
    proxy(() => client.get(`/api/payments/invoices/${c.req.param('id')}`, tok(c)), c));

  r.patch('/admin/api/invoices/:id/extend', authMiddleware(), async c =>
    proxy(() => client.patch(`/api/payments/invoices/${c.req.param('id')}/extend`, tok(c), await c.req.json()), c));

  r.patch('/admin/api/invoices/:id/cancel', authMiddleware(), async c =>
    proxy(() => client.patch(`/api/payments/invoices/${c.req.param('id')}/cancel`, tok(c), await c.req.json()), c));

  return r;
}
```

- [ ] **Step 5: Create `apps/admin/src/presentation/fulfilments-router.ts`**

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';

type Ctx = Parameters<Parameters<Hono['get']>[1]>[0];
const tok = (c: Ctx) => c.req.header('Authorization')?.replace('Bearer ', '') ?? '';

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 404 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

export function buildFulfilmentsRouter(client: ServiceClient): Hono {
  const r = new Hono();

  r.get('/admin/api/fulfilments', authMiddleware(), async c =>
    proxy(() => client.get('/api/shipping/fulfilments', tok(c)), c));

  r.get('/admin/api/fulfilments/:id', authMiddleware(), async c =>
    proxy(() => client.get(`/api/shipping/fulfilments/${c.req.param('id')}`, tok(c)), c));

  r.patch('/admin/api/fulfilments/:id/dispatch', authMiddleware(), async c =>
    proxy(() => client.patch(`/api/shipping/fulfilments/${c.req.param('id')}/dispatch`, tok(c), await c.req.json()), c));

  r.patch('/admin/api/fulfilments/:id/collect', authMiddleware(), async c =>
    proxy(() => client.patch(`/api/shipping/fulfilments/${c.req.param('id')}/collect`, tok(c), undefined), c));

  return r;
}
```

- [ ] **Step 6: Create `apps/admin/src/presentation/reports-router.ts`**

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';

type Ctx = Parameters<Parameters<Hono['get']>[1]>[0];
const tok = (c: Ctx) => c.req.header('Authorization')?.replace('Bearer ', '') ?? '';

async function proxy(fn: () => Promise<unknown>, c: Ctx): Promise<Response> {
  try {
    return c.json(await fn());
  } catch (err) {
    if (err instanceof ServiceError) return c.json(err.body, err.status as 400 | 500);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
}

export function buildReportsRouter(client: ServiceClient): Hono {
  const r = new Hono();

  r.get('/admin/api/reports/auction-results', authMiddleware(), async c =>
    proxy(() => client.get(`/api/auctions/reports/results?${new URLSearchParams(c.req.query() as Record<string, string>)}`, tok(c)), c));

  r.get('/admin/api/reports/revenue', authMiddleware(), async c =>
    proxy(() => client.get(`/api/payments/reports/revenue?${new URLSearchParams(c.req.query() as Record<string, string>)}`, tok(c)), c));

  r.get('/admin/api/reports/unsold-lots', authMiddleware(), async c =>
    proxy(() => client.get('/api/auctions/reports/unsold', tok(c)), c));

  return r;
}
```

- [ ] **Step 7: Run all tests to verify pass**

```bash
npx vitest run
```

Expected: 16 passed

- [ ] **Step 8: Create `apps/admin/src/main.ts`**

```typescript
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { ServiceClient } from './infrastructure/service-client';
import { buildLotsRouter } from './presentation/lots-router';
import { buildCategoriesRouter } from './presentation/categories-router';
import { buildAuctionsRouter } from './presentation/auctions-router';
import { buildUsersRouter } from './presentation/users-router';
import { buildInvoicesRouter } from './presentation/invoices-router';
import { buildFulfilmentsRouter } from './presentation/fulfilments-router';
import { buildReportsRouter } from './presentation/reports-router';

const PORT = Number(process.env['PORT'] ?? 3005);

const catalogue = new ServiceClient(process.env['CATALOGUE_SERVICE_URL'] ?? 'http://catalogue-service:3001');
const auction   = new ServiceClient(process.env['AUCTION_SERVICE_URL']   ?? 'http://auction-service:3002');
const user      = new ServiceClient(process.env['USER_SERVICE_URL']      ?? 'http://user-service:3000');
const payment   = new ServiceClient(process.env['PAYMENT_SERVICE_URL']   ?? 'http://payment-service:3003');
const shipping  = new ServiceClient(process.env['SHIPPING_SERVICE_URL']  ?? 'http://shipping-service:3004');

const app = new Hono();
app.route('/', buildLotsRouter(catalogue));
app.route('/', buildCategoriesRouter(catalogue));
app.route('/', buildAuctionsRouter(auction));
app.route('/', buildUsersRouter(user));
app.route('/', buildInvoicesRouter(payment));
app.route('/', buildFulfilmentsRouter(shipping));
app.route('/', buildReportsRouter(auction));

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Admin service running on port ${PORT}`);
});
```

- [ ] **Step 9: Commit**

```bash
git add apps/admin/src/
git commit -m "feat(admin): users, invoices, fulfilments, reports routers + main.ts wired"
```

---

## Self-Review

| Requirement | Task |
|---|---|
| Lot CRUD + image upload/delete/reorder (6 routes) | Task 3 |
| Category CRUD (4 routes) | Task 3 |
| Auction schedule/reschedule/cancel/list/detail (5 routes) | Task 3 |
| User list/detail/suspend/reinstate/approve (5 routes) | Task 4 |
| Invoice list/detail/extend/cancel (4 routes) | Task 4 |
| Fulfilment list/detail/dispatch/collect (4 routes) | Task 4 |
| Reports: auction-results, revenue, unsold-lots (3 routes) | Task 4 |
| Admin JWT forwarded on every downstream call | Tasks 3, 4 |
| Downstream error status codes propagated unchanged | Tasks 2, 3, 4 |
| No database — pure proxy | All tasks |
| `role: ADMIN` enforced on every route | Tasks 3, 4 |

**31 endpoints, 16 tests, 4 tasks.** Lean by design — no business logic means no deep test coverage needed beyond the proxy contract verified in Task 2.
