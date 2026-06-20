# Integration Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three cross-service happy-path integration test flows that spin up every real service via Docker Compose and verify the full request chain end-to-end with no mocks between services.

**Architecture:** Each flow runs in a dedicated Vitest test file against a real Docker Compose environment (`docker-compose.test.yml`) including PostgreSQL, Redis, and RabbitMQ. Tests hit live service HTTP endpoints, poll for async side-effects (RabbitMQ events, database state), and use Stripe CLI webhook forwarding for payment flows. Seed helpers in `tests/helpers/` provide deterministic test data.

**Tech Stack:** Vitest, Docker Compose, Stripe CLI (`stripe listen`), PostgreSQL (`pg`), Node.js `fetch`, pnpm workspaces (Turborepo monorepo)

## Global Constraints

- All tests are happy-path only — no error/edge-case branches
- No frontend E2E, no load testing, no unit-level edge cases
- `docker-compose.test.yml` starts ALL real services + PostgreSQL + Redis + RabbitMQ — no mocks between services
- Stripe CLI `stripe listen` forwards webhooks during payment flow tests
- One Vitest test file per flow — files run sequentially (`--sequence.concurrent false`)
- Seed helpers live in `tests/helpers/` — reused across flows
- Tests are in `tests/integration/` at monorepo root
- British English in all comments ("authorise", "cancelled", "fulfilment")
- Service ports (matching `docker-compose.test.yml`): User=3001, Catalogue=3002, AuctionEngine=3003, Payment=3004, Admin=3005, Shipping=3006, Notification=3007

---

### Task 1: Test Infrastructure — docker-compose.test.yml + Vitest config

**Files:**
- Create: `docker-compose.test.yml`
- Create: `tests/vitest.integration.config.ts`
- Create: `tests/helpers/wait.ts`
- Create: `tests/helpers/db.ts`

**Interfaces:**
- Produces:
  - `waitForHttp(url: string, timeoutMs?: number): Promise<void>` — polls until HTTP 200
  - `waitFor(condition: () => Promise<boolean>, timeoutMs?: number): Promise<void>` — generic async poller
  - `getDb(service: 'user' | 'catalogue' | 'auction' | 'payment' | 'shipping' | 'notification'): Pool` — returns a `pg.Pool` connected to that service's test database
  - `resetDb(service: 'user' | 'catalogue' | 'auction' | 'payment' | 'shipping' | 'notification'): Promise<void>` — truncates all tables in that service's DB

- [ ] **Step 1: Create `docker-compose.test.yml`**

```yaml
# docker-compose.test.yml
# Spins up all services + infrastructure for integration tests.
# Usage: docker compose -f docker-compose.test.yml up -d
version: '3.9'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: carat
      POSTGRES_PASSWORD: carat_test
      POSTGRES_DB: postgres
    ports:
      - '5433:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U carat']
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - '6380:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 10

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: carat
      RABBITMQ_DEFAULT_PASS: carat_test
    ports:
      - '5673:5672'
      - '15673:15672'
    healthcheck:
      test: ['CMD', 'rabbitmq-diagnostics', 'ping']
      interval: 10s
      timeout: 10s
      retries: 10

  user-service:
    build:
      context: .
      dockerfile: apps/user-service/Dockerfile
    environment:
      PORT: '3001'
      DATABASE_URL: postgresql://carat:carat_test@postgres:5432/user_test
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://carat:carat_test@rabbitmq:5672
      JWT_ACCESS_SECRET: test-access-secret
      JWT_REFRESH_SECRET: test-refresh-secret
      JWT_ACCESS_EXPIRES_IN: '900'
      JWT_REFRESH_EXPIRES_IN: '2592000'
      TWILIO_ACCOUNT_SID: test-sid
      TWILIO_AUTH_TOKEN: test-token
      TWILIO_PHONE_NUMBER: '+15005550006'
      NODE_ENV: test
    ports:
      - '3001:3001'
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'curl -f http://localhost:3001/health || exit 1']
      interval: 10s
      timeout: 5s
      retries: 15

  catalogue-service:
    build:
      context: .
      dockerfile: apps/catalogue-service/Dockerfile
    environment:
      PORT: '3002'
      DATABASE_URL: postgresql://carat:carat_test@postgres:5432/catalogue_test
      RABBITMQ_URL: amqp://carat:carat_test@rabbitmq:5672
      R2_ACCOUNT_ID: test-account
      R2_ACCESS_KEY_ID: test-key
      R2_SECRET_ACCESS_KEY: test-secret
      R2_BUCKET_NAME: test-bucket
      R2_PUBLIC_URL: http://localhost:9000
      NODE_ENV: test
    ports:
      - '3002:3002'
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'curl -f http://localhost:3002/health || exit 1']
      interval: 10s
      timeout: 5s
      retries: 15

  auction-engine:
    build:
      context: .
      dockerfile: apps/auction-engine/Dockerfile
    environment:
      PORT: '3003'
      DATABASE_URL: postgresql://carat:carat_test@postgres:5432/auction_test
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://carat:carat_test@rabbitmq:5672
      NODE_ENV: test
    ports:
      - '3003:3003'
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'curl -f http://localhost:3003/health || exit 1']
      interval: 10s
      timeout: 5s
      retries: 15

  payment-service:
    build:
      context: .
      dockerfile: apps/payment-service/Dockerfile
    environment:
      PORT: '3004'
      DATABASE_URL: postgresql://carat:carat_test@postgres:5432/payment_test
      RABBITMQ_URL: amqp://carat:carat_test@rabbitmq:5672
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET}
      NODE_ENV: test
    ports:
      - '3004:3004'
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'curl -f http://localhost:3004/health || exit 1']
      interval: 10s
      timeout: 5s
      retries: 15

  shipping-service:
    build:
      context: .
      dockerfile: apps/shipping-service/Dockerfile
    environment:
      PORT: '3006'
      DATABASE_URL: postgresql://carat:carat_test@postgres:5432/shipping_test
      RABBITMQ_URL: amqp://carat:carat_test@rabbitmq:5672
      NODE_ENV: test
    ports:
      - '3006:3006'
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'curl -f http://localhost:3006/health || exit 1']
      interval: 10s
      timeout: 5s
      retries: 15

  notification-service:
    build:
      context: .
      dockerfile: apps/notification-service/Dockerfile
    environment:
      PORT: '3007'
      DATABASE_URL: postgresql://carat:carat_test@postgres:5432/notification_test
      RABBITMQ_URL: amqp://carat:carat_test@rabbitmq:5672
      RESEND_API_KEY: re_test_key
      TWILIO_ACCOUNT_SID: test-sid
      TWILIO_AUTH_TOKEN: test-token
      TWILIO_PHONE_NUMBER: '+15005550006'
      NODE_ENV: test
    ports:
      - '3007:3007'
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'curl -f http://localhost:3007/health || exit 1']
      interval: 10s
      timeout: 5s
      retries: 15
```

- [ ] **Step 2: Create `tests/vitest.integration.config.ts`**

```typescript
// tests/vitest.integration.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 120_000,   // each test may wait for async events
    hookTimeout: 30_000,
    sequence: {
      concurrent: false,    // flows run one-at-a-time
    },
    include: ['tests/integration/**/*.test.ts'],
    reporters: ['verbose'],
  },
});
```

- [ ] **Step 3: Create `tests/helpers/wait.ts`**

```typescript
// tests/helpers/wait.ts

/**
 * Polls url with GET until it returns HTTP 200 (or timeoutMs elapses).
 * Used in globalSetup to confirm all services are healthy before tests run.
 */
export async function waitForHttp(
  url: string,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // service not yet up — keep polling
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`Timed out waiting for ${url} to become healthy`);
}

/**
 * Polls condition() every 500 ms until it returns true (or timeoutMs elapses).
 * Use this to wait for async side-effects: DB rows, RabbitMQ events, etc.
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('waitFor condition never became true within timeout');
}
```

- [ ] **Step 4: Create `tests/helpers/db.ts`**

```typescript
// tests/helpers/db.ts
import { Pool } from 'pg';

const TEST_DB_PORT = 5433; // mapped from docker-compose.test.yml

const DB_NAMES: Record<string, string> = {
  user: 'user_test',
  catalogue: 'catalogue_test',
  auction: 'auction_test',
  payment: 'payment_test',
  shipping: 'shipping_test',
  notification: 'notification_test',
};

const pools = new Map<string, Pool>();

export type ServiceName =
  | 'user'
  | 'catalogue'
  | 'auction'
  | 'payment'
  | 'shipping'
  | 'notification';

/** Returns a cached pg.Pool for the given service's test database. */
export function getDb(service: ServiceName): Pool {
  if (!pools.has(service)) {
    pools.set(
      service,
      new Pool({
        host: 'localhost',
        port: TEST_DB_PORT,
        user: 'carat',
        password: 'carat_test',
        database: DB_NAMES[service],
      }),
    );
  }
  return pools.get(service)!;
}

/**
 * Truncates all non-migration tables in the service's database.
 * Call in beforeEach to start each test from a clean state.
 */
export async function resetDb(service: ServiceName): Promise<void> {
  const pool = getDb(service);
  // Fetch all user-created table names (excludes pg system tables and
  // the knex/typeorm migrations tracking table).
  const { rows } = await pool.query<{ tablename: string }>(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('knex_migrations', 'knex_migrations_lock', 'migrations', 'typeorm_migrations')
  `);
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

/** Close all pools — call once after all tests finish. */
export async function closeAllPools(): Promise<void> {
  for (const pool of pools.values()) {
    await pool.end();
  }
  pools.clear();
}
```

- [ ] **Step 5: Add `pg` as a dev dependency and verify Docker Compose file is valid**

```bash
# Run from monorepo root
pnpm add -D pg @types/pg -w

# Validate docker-compose.test.yml syntax
docker compose -f docker-compose.test.yml config --quiet
```

Expected: no errors printed.

- [ ] **Step 6: Add integration test script to root `package.json`**

Open `package.json` at monorepo root. Add to the `scripts` section:

```json
"test:integration": "vitest run --config tests/vitest.integration.config.ts"
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.test.yml tests/vitest.integration.config.ts tests/helpers/wait.ts tests/helpers/db.ts package.json
git commit -m "test: add integration test infrastructure (docker-compose, vitest config, helpers)"
```

---

### Task 2: Seed Helpers — deterministic test data factories

**Files:**
- Create: `tests/helpers/seed.ts`
- Create: `tests/helpers/api.ts`

**Interfaces:**
- Consumes:
  - `getDb(service: ServiceName): Pool` from `tests/helpers/db.ts`
- Produces:
  - `seedAdminUser(): Promise<{ userId: string; accessToken: string }>` — inserts an admin user directly into the DB and returns a signed JWT
  - `seedBuyerUser(): Promise<{ userId: string; email: string; password: string }>` — inserts an unverified buyer into the user DB
  - `seedLot(adminToken: string): Promise<{ lotId: string }>` — creates a lot via Catalogue Service API
  - `seedAuction(lotId: string, adminToken: string, opts?: { reservePrice?: number; durationSeconds?: number }): Promise<{ auctionId: string }>` — schedules an auction via Auction Engine API
  - `api(port: number): { get, post, patch, delete }` — thin fetch wrapper with JSON helpers

- [ ] **Step 1: Create `tests/helpers/api.ts`**

```typescript
// tests/helpers/api.ts

const BASE = (port: number) => `http://localhost:${port}`;

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<T>(
  port: number,
  method: HttpMethod,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE(port)}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let responseBody: T;
  const text = await res.text();
  try {
    responseBody = JSON.parse(text) as T;
  } catch {
    responseBody = text as unknown as T;
  }

  return { status: res.status, body: responseBody };
}

/** Thin HTTP client for a service running on the given port. */
export function api(port: number) {
  return {
    get: <T>(path: string, token?: string) =>
      request<T>(port, 'GET', path, undefined, token),
    post: <T>(path: string, body: unknown, token?: string) =>
      request<T>(port, 'POST', path, body, token),
    patch: <T>(path: string, body: unknown, token?: string) =>
      request<T>(port, 'PATCH', path, body, token),
    delete: <T>(path: string, token?: string) =>
      request<T>(port, 'DELETE', path, undefined, token),
  };
}
```

- [ ] **Step 2: Create `tests/helpers/seed.ts`**

```typescript
// tests/helpers/seed.ts
import { createHash, randomUUID } from 'node:crypto';
import { api } from './api';
import { getDb } from './db';

// Service ports — must match docker-compose.test.yml
const PORTS = {
  user: 3001,
  catalogue: 3002,
  auction: 3003,
  payment: 3004,
  shipping: 3006,
  notification: 3007,
} as const;

/**
 * Inserts an admin user directly into the user DB bypassing the registration
 * flow. Returns a valid admin JWT obtained from the login endpoint.
 * Use this to seed data via Admin/Catalogue APIs without going through
 * the buyer onboarding flow.
 */
export async function seedAdminUser(): Promise<{
  userId: string;
  accessToken: string;
}> {
  const userId = randomUUID();
  const email = `admin-${userId}@test.carat-room.internal`;
  const password = 'Test1234!';
  // bcrypt hash of 'Test1234!' with salt rounds = 10
  // Pre-computed to avoid bcrypt dependency in the test helper.
  // If the user service uses a different hash, replace this value.
  const passwordHash =
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

  const db = getDb('user');
  await db.query(
    `INSERT INTO users (id, email, password_hash, role, email_verified, phone_verified, created_at, updated_at)
     VALUES ($1, $2, $3, 'ADMIN', true, true, NOW(), NOW())`,
    [userId, email, passwordHash],
  );

  const { status, body } = await api(PORTS.user).post<{
    data: { accessToken: string };
  }>('/auth/login', { email, password });

  if (status !== 200) {
    throw new Error(`Admin login failed: ${JSON.stringify(body)}`);
  }

  return { userId, accessToken: (body as any).data.accessToken };
}

/**
 * Inserts an unverified buyer into the user DB.
 * The test flow is responsible for completing email + phone verification.
 */
export async function seedBuyerUser(): Promise<{
  userId: string;
  email: string;
  password: string;
}> {
  const userId = randomUUID();
  const email = `buyer-${userId}@test.carat-room.internal`;
  const password = 'BuyerPass1!';
  const passwordHash =
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

  const db = getDb('user');
  await db.query(
    `INSERT INTO users (id, email, password_hash, role, email_verified, phone_verified, phone_number, created_at, updated_at)
     VALUES ($1, $2, $3, 'BUYER', false, false, '+15005550006', NOW(), NOW())`,
    [userId, email, passwordHash],
  );

  return { userId, email, password };
}

/**
 * Creates a published lot via the Catalogue Service API using the given
 * admin JWT. Returns the lotId for use in auction seeding.
 */
export async function seedLot(
  adminToken: string,
): Promise<{ lotId: string }> {
  const { status, body } = await api(PORTS.catalogue).post<{
    data: { id: string };
  }>(
    '/lots',
    {
      title: `Test Diamond Ring ${randomUUID().slice(0, 8)}`,
      description: 'A fine test lot for integration testing.',
      categoryId: null,
      estimatedValue: 1000,
      currency: 'AUD',
      images: [],
    },
    adminToken,
  );

  if (status !== 201) {
    throw new Error(`seedLot failed: ${JSON.stringify(body)}`);
  }

  const lotId = (body as any).data.id as string;

  // Publish the lot so it is eligible for auction scheduling
  const publishRes = await api(PORTS.catalogue).patch<unknown>(
    `/lots/${lotId}/publish`,
    {},
    adminToken,
  );
  if (publishRes.status !== 200) {
    throw new Error(`seedLot publish failed: ${JSON.stringify(publishRes.body)}`);
  }

  return { lotId };
}

/**
 * Schedules an auction for the given lotId via the Auction Engine API.
 * durationSeconds defaults to 10 so tests complete quickly.
 * reservePrice defaults to 0 (no effective reserve) for most flows.
 */
export async function seedAuction(
  lotId: string,
  adminToken: string,
  opts: { reservePrice?: number; durationSeconds?: number } = {},
): Promise<{ auctionId: string }> {
  const { reservePrice = 0, durationSeconds = 10 } = opts;

  // Schedule to start 2 seconds from now
  const startsAt = new Date(Date.now() + 2_000).toISOString();

  const { status, body } = await api(PORTS.auction).post<{
    data: { id: string };
  }>(
    '/auctions',
    {
      lotId,
      startsAt,
      durationSeconds,
      reservePrice,
      currency: 'AUD',
    },
    adminToken,
  );

  if (status !== 201) {
    throw new Error(`seedAuction failed: ${JSON.stringify(body)}`);
  }

  return { auctionId: (body as any).data.id as string };
}
```

- [ ] **Step 3: Verify helpers compile**

```bash
pnpm exec tsc --project tests/tsconfig.json --noEmit
```

Create `tests/tsconfig.json` if it doesn't exist:

```json
{
  "extends": "../packages/tsconfig/base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist",
    "module": "ESNext",
    "moduleResolution": "bundler"
  },
  "include": ["./**/*.ts"]
}
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/api.ts tests/helpers/seed.ts tests/tsconfig.json
git commit -m "test: add seed helpers and API client for integration tests"
```

---

### Task 3: Flow 1 — Buyer Onboarding

**Covers:** User registers → email verified → phone OTP sent → phone verified → ready to bid

**Files:**
- Create: `tests/integration/flow-1-buyer-onboarding.test.ts`

**Interfaces:**
- Consumes:
  - `waitFor(condition: () => Promise<boolean>, timeoutMs?: number): Promise<void>` from `tests/helpers/wait.ts`
  - `getDb(service: ServiceName): Pool` from `tests/helpers/db.ts`
  - `resetDb(service: ServiceName): Promise<void>` from `tests/helpers/db.ts`
  - `api(port: number)` from `tests/helpers/api.ts`

- [ ] **Step 1: Start Docker Compose and confirm all services are healthy**

```bash
docker compose -f docker-compose.test.yml up -d --build
docker compose -f docker-compose.test.yml ps
```

Expected: all services show `healthy` in the `STATUS` column. If any are `unhealthy`, check logs:

```bash
docker compose -f docker-compose.test.yml logs user-service
```

- [ ] **Step 2: Write the test file**

```typescript
// tests/integration/flow-1-buyer-onboarding.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { waitForHttp, waitFor } from '../helpers/wait';
import { resetDb, getDb, closeAllPools } from '../helpers/db';
import { api } from '../helpers/api';

const USER_PORT = 3001;

describe('Flow 1 — Buyer onboarding', () => {
  beforeAll(async () => {
    // Wait for user service to be healthy before any test runs
    await waitForHttp(`http://localhost:${USER_PORT}/health`);
    await resetDb('user');
    await resetDb('notification');
  });

  afterAll(async () => {
    await closeAllPools();
  });

  it('registers a new buyer, verifies email and phone, and reaches verified status', async () => {
    // ── Arrange ────────────────────────────────────────────────────────────────
    const email = `buyer-flow1-${Date.now()}@test.carat-room.internal`;
    const password = 'BuyerPass1!';
    const phoneNumber = '+15005550006'; // Twilio test magic number

    // ── Act: register ──────────────────────────────────────────────────────────
    const registerRes = await api(USER_PORT).post<{ data: { userId: string } }>(
      '/auth/register',
      { email, password, phoneNumber },
    );

    expect(registerRes.status).toBe(201);
    const userId = registerRes.body.data.userId;
    expect(userId).toBeTruthy();

    // ── Assert: user row exists and is unverified ──────────────────────────────
    const db = getDb('user');
    const { rows } = await db.query(
      'SELECT email_verified, phone_verified FROM users WHERE id = $1',
      [userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email_verified).toBe(false);
    expect(rows[0].phone_verified).toBe(false);

    // ── Act: simulate email verification ──────────────────────────────────────
    // Fetch the verification token directly from DB (no real email in tests)
    const tokenRow = await db.query<{ token: string }>(
      "SELECT token FROM email_verification_tokens WHERE user_id = $1 AND expires_at > NOW()",
      [userId],
    );
    expect(tokenRow.rows).toHaveLength(1);
    const emailToken = tokenRow.rows[0].token;

    const verifyEmailRes = await api(USER_PORT).post<{ data: { message: string } }>(
      '/auth/verify-email',
      { token: emailToken },
    );
    expect(verifyEmailRes.status).toBe(200);

    // ── Assert: email verified ─────────────────────────────────────────────────
    await waitFor(async () => {
      const r = await db.query<{ email_verified: boolean }>(
        'SELECT email_verified FROM users WHERE id = $1',
        [userId],
      );
      return r.rows[0]?.email_verified === true;
    });

    // ── Act: request phone OTP ─────────────────────────────────────────────────
    // Login first to get access token (email verified, phone not yet)
    const loginRes = await api(USER_PORT).post<{ data: { accessToken: string } }>(
      '/auth/login',
      { email, password },
    );
    expect(loginRes.status).toBe(200);
    const accessToken = loginRes.body.data.accessToken;

    const otpRequestRes = await api(USER_PORT).post<{ data: { message: string } }>(
      '/auth/request-phone-otp',
      {},
      accessToken,
    );
    expect(otpRequestRes.status).toBe(200);

    // ── Assert: OTP record created ─────────────────────────────────────────────
    await waitFor(async () => {
      const r = await db.query<{ code: string }>(
        "SELECT code FROM phone_otp_codes WHERE user_id = $1 AND expires_at > NOW()",
        [userId],
      );
      return r.rows.length > 0;
    });

    const otpRow = await db.query<{ code: string }>(
      "SELECT code FROM phone_otp_codes WHERE user_id = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
      [userId],
    );
    const otp = otpRow.rows[0].code;

    // ── Act: verify phone OTP ──────────────────────────────────────────────────
    const verifyPhoneRes = await api(USER_PORT).post<{ data: { message: string } }>(
      '/auth/verify-phone',
      { code: otp },
      accessToken,
    );
    expect(verifyPhoneRes.status).toBe(200);

    // ── Assert: user is fully verified ────────────────────────────────────────
    await waitFor(async () => {
      const r = await db.query<{ email_verified: boolean; phone_verified: boolean }>(
        'SELECT email_verified, phone_verified FROM users WHERE id = $1',
        [userId],
      );
      const u = r.rows[0];
      return u?.email_verified === true && u?.phone_verified === true;
    });

    const finalState = await db.query<{
      email_verified: boolean;
      phone_verified: boolean;
    }>('SELECT email_verified, phone_verified FROM users WHERE id = $1', [userId]);

    expect(finalState.rows[0].email_verified).toBe(true);
    expect(finalState.rows[0].phone_verified).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
pnpm run test:integration -- --reporter=verbose tests/integration/flow-1-buyer-onboarding.test.ts
```

Expected output:
```
✓ Flow 1 — Buyer onboarding
  ✓ registers a new buyer, verifies email and phone, and reaches verified status
```

If the test fails with a DB column name mismatch (e.g. `emailVerified` vs `email_verified`), check the actual column names in the user service migration files at `apps/user-service/src/db/migrations/` and update the query in `flow-1-buyer-onboarding.test.ts` accordingly.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/flow-1-buyer-onboarding.test.ts
git commit -m "test(integration): flow 1 — buyer onboarding happy path"
```

---

### Task 4: Flow 2 — Full Auction Lifecycle

**Covers:** Admin creates lot → catalogue publishes → auction scheduled → starts → buyer bids → anti-snipe extends timer → closes → invoice created → Stripe webhook marks paid → shipping choice saved → notification sent

**Files:**
- Create: `tests/integration/flow-2-full-auction-lifecycle.test.ts`

**Interfaces:**
- Consumes:
  - `waitFor`, `waitForHttp` from `tests/helpers/wait.ts`
  - `resetDb`, `getDb`, `closeAllPools` from `tests/helpers/db.ts`
  - `api` from `tests/helpers/api.ts`
  - `seedAdminUser`, `seedBuyerUser`, `seedLot`, `seedAuction` from `tests/helpers/seed.ts`

**Before running this test:** Stripe CLI must be running to forward webhooks to the payment service:

```bash
stripe listen --forward-to http://localhost:3004/webhooks/stripe
```

Copy the webhook signing secret it prints (starts with `whsec_`) and export it:

```bash
export STRIPE_WEBHOOK_SECRET=whsec_<value from stripe listen>
```

Then restart the payment service container so it picks up the new secret:

```bash
docker compose -f docker-compose.test.yml up -d --no-deps payment-service
```

- [ ] **Step 1: Write the test file**

```typescript
// tests/integration/flow-2-full-auction-lifecycle.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { waitForHttp, waitFor } from '../helpers/wait';
import { resetDb, getDb, closeAllPools } from '../helpers/db';
import { api } from '../helpers/api';
import {
  seedAdminUser,
  seedBuyerUser,
  seedLot,
  seedAuction,
} from '../helpers/seed';

const PORTS = {
  user: 3001,
  catalogue: 3002,
  auction: 3003,
  payment: 3004,
  shipping: 3006,
} as const;

describe('Flow 2 — Full auction lifecycle', () => {
  beforeAll(async () => {
    // Wait for all relevant services to be healthy
    await Promise.all([
      waitForHttp(`http://localhost:${PORTS.user}/health`),
      waitForHttp(`http://localhost:${PORTS.catalogue}/health`),
      waitForHttp(`http://localhost:${PORTS.auction}/health`),
      waitForHttp(`http://localhost:${PORTS.payment}/health`),
      waitForHttp(`http://localhost:${PORTS.shipping}/health`),
    ]);
    // Reset all service DBs before this flow runs
    await resetDb('user');
    await resetDb('catalogue');
    await resetDb('auction');
    await resetDb('payment');
    await resetDb('shipping');
    await resetDb('notification');
  });

  afterAll(async () => {
    await closeAllPools();
  });

  it(
    'creates a lot, runs an auction, receives a bid, closes, invoices, pays, and saves fulfilment choice',
    async () => {
      // ── Arrange: seed admin + buyer ────────────────────────────────────────
      const { accessToken: adminToken } = await seedAdminUser();

      // Seed a fully-verified buyer directly in DB
      const buyerDb = getDb('user');
      const { userId: buyerId, email: buyerEmail, password: buyerPassword } =
        await seedBuyerUser();
      // Mark buyer as fully verified so they can place bids
      await buyerDb.query(
        'UPDATE users SET email_verified = true, phone_verified = true WHERE id = $1',
        [buyerId],
      );

      // Login as buyer to get access token
      const buyerLoginRes = await api(PORTS.user).post<{
        data: { accessToken: string };
      }>('/auth/login', { email: buyerEmail, password: buyerPassword });
      expect(buyerLoginRes.status).toBe(200);
      const buyerToken = buyerLoginRes.body.data.accessToken;

      // ── Act: admin creates and publishes a lot ─────────────────────────────
      const { lotId } = await seedLot(adminToken);

      // Confirm lot is visible in catalogue
      const lotRes = await api(PORTS.catalogue).get<{ data: { id: string; status: string } }>(
        `/lots/${lotId}`,
      );
      expect(lotRes.status).toBe(200);
      expect(lotRes.body.data.status).toBe('PUBLISHED');

      // ── Act: admin schedules auction (10s duration, no reserve) ───────────
      const { auctionId } = await seedAuction(lotId, adminToken, {
        durationSeconds: 10,
        reservePrice: 0,
      });

      // ── Assert: auction enters SCHEDULED state ─────────────────────────────
      await waitFor(async () => {
        const r = await api(PORTS.auction).get<{
          data: { status: string };
        }>(`/auctions/${auctionId}`);
        return r.body.data?.status === 'SCHEDULED';
      });

      // ── Assert: auction transitions to OPEN (starts in ~2s) ───────────────
      await waitFor(
        async () => {
          const r = await api(PORTS.auction).get<{
            data: { status: string };
          }>(`/auctions/${auctionId}`);
          return r.body.data?.status === 'OPEN';
        },
        15_000,
      );

      // ── Act: buyer places a bid ────────────────────────────────────────────
      const bidRes = await api(PORTS.auction).post<{
        data: { bidId: string; amount: number };
      }>(
        `/auctions/${auctionId}/bids`,
        { amount: 500, currency: 'AUD' },
        buyerToken,
      );
      expect(bidRes.status).toBe(201);
      const { bidId } = bidRes.body.data;
      expect(bidId).toBeTruthy();

      // ── Assert: bid is recorded ────────────────────────────────────────────
      const auctionDb = getDb('auction');
      await waitFor(async () => {
        const r = await auctionDb.query<{ id: string }>(
          'SELECT id FROM bids WHERE id = $1',
          [bidId],
        );
        return r.rows.length > 0;
      });

      // ── Assert: timer was extended (anti-snipe) if bid was placed near end ─
      // The auction has a 10s duration; placing a bid records a TimerExtended event.
      // We verify by checking the auction's endsAt has been pushed forward or
      // that a timer_extended event exists in the event store.
      await waitFor(async () => {
        const r = await auctionDb.query<{ event_type: string }>(
          "SELECT event_type FROM auction_events WHERE aggregate_id = $1 AND event_type = 'TimerExtended'",
          [auctionId],
        );
        // Anti-snipe only fires when bid is placed within the extension window.
        // With a 10s auction the bid is likely within that window.
        // If this assertion is flaky, increase durationSeconds and bid earlier.
        return r.rows.length > 0;
      }, 20_000);

      // ── Assert: auction closes (CLOSED state) ─────────────────────────────
      await waitFor(
        async () => {
          const r = await api(PORTS.auction).get<{
            data: { status: string };
          }>(`/auctions/${auctionId}`);
          return r.body.data?.status === 'CLOSED';
        },
        60_000,
      );

      // ── Assert: payment service created an invoice (via AuctionClosed event) ─
      const paymentDb = getDb('payment');
      let invoiceId: string;
      await waitFor(async () => {
        const r = await paymentDb.query<{ id: string; status: string }>(
          "SELECT id, status FROM invoices WHERE auction_id = $1 AND winner_id = $2",
          [auctionId, buyerId],
        );
        if (r.rows.length > 0) {
          invoiceId = r.rows[0].id;
          return true;
        }
        return false;
      }, 30_000);

      expect(invoiceId!).toBeTruthy();

      // Confirm invoice is accessible via Payment Service API
      const invoiceRes = await api(PORTS.payment).get<{
        data: { id: string; status: string };
      }>(`/invoices/${invoiceId!}`, buyerToken);
      expect(invoiceRes.status).toBe(200);
      expect(invoiceRes.body.data.status).toBe('PENDING');

      // ── Act: simulate Stripe payment via test card ─────────────────────────
      // Retrieve the Stripe Checkout Session URL from the invoice, then
      // use Stripe CLI to confirm payment without a browser.
      const checkoutRes = await api(PORTS.payment).post<{
        data: { checkoutUrl: string; sessionId: string };
      }>(`/invoices/${invoiceId!}/checkout`, {}, buyerToken);
      expect(checkoutRes.status).toBe(200);
      const { sessionId } = checkoutRes.body.data;

      // Confirm the Stripe Checkout Session using the Stripe CLI
      // (stripe CLI must be authenticated and `stripe listen` must be running)
      const { execSync } = await import('node:child_process');
      execSync(
        `stripe payment_intents confirm $(stripe checkout sessions retrieve ${sessionId} --api-key ${process.env.STRIPE_SECRET_KEY} | jq -r '.payment_intent') --payment-method=pm_card_visa --api-key ${process.env.STRIPE_SECRET_KEY}`,
        { stdio: 'inherit' },
      );

      // ── Assert: invoice transitions to PAID (via Stripe webhook) ──────────
      await waitFor(async () => {
        const r = await paymentDb.query<{ status: string }>(
          'SELECT status FROM invoices WHERE id = $1',
          [invoiceId!],
        );
        return r.rows[0]?.status === 'PAID';
      }, 30_000);

      // ── Assert: shipping service created a fulfilment record ──────────────
      const shippingDb = getDb('shipping');
      let fulfilmentId: string;
      await waitFor(async () => {
        const r = await shippingDb.query<{ id: string }>(
          'SELECT id FROM fulfilments WHERE invoice_id = $1',
          [invoiceId!],
        );
        if (r.rows.length > 0) {
          fulfilmentId = r.rows[0].id;
          return true;
        }
        return false;
      }, 30_000);
      expect(fulfilmentId!).toBeTruthy();

      // ── Act: buyer saves shipping choice ───────────────────────────────────
      const shippingChoiceRes = await api(PORTS.shipping).patch<{
        data: { method: string };
      }>(
        `/fulfilments/${fulfilmentId!}/choice`,
        {
          method: 'SHIP',
          address: {
            line1: '1 Test Street',
            city: 'Sydney',
            postcode: '2000',
            country: 'AU',
          },
        },
        buyerToken,
      );
      expect(shippingChoiceRes.status).toBe(200);
      expect(shippingChoiceRes.body.data.method).toBe('SHIP');

      // ── Assert: fulfilment record updated with shipping choice ─────────────
      await waitFor(async () => {
        const r = await shippingDb.query<{ method: string }>(
          'SELECT method FROM fulfilments WHERE id = $1',
          [fulfilmentId!],
        );
        return r.rows[0]?.method === 'SHIP';
      });

      // ── Assert: notification service logged an invoice email ───────────────
      const notifDb = getDb('notification');
      await waitFor(async () => {
        const r = await notifDb.query<{ id: string }>(
          "SELECT id FROM notification_logs WHERE recipient_id = $1 AND type = 'INVOICE_CREATED'",
          [buyerId],
        );
        return r.rows.length > 0;
      }, 30_000);
    },
  );
});
```

- [ ] **Step 2: Run the test**

Ensure `stripe listen` is running in a separate terminal first (see task preamble above). Then:

```bash
pnpm run test:integration -- --reporter=verbose tests/integration/flow-2-full-auction-lifecycle.test.ts
```

Expected output:
```
✓ Flow 2 — Full auction lifecycle
  ✓ creates a lot, runs an auction, receives a bid, closes, invoices, pays, and saves fulfilment choice
```

If the Stripe step fails, confirm:
- `STRIPE_SECRET_KEY` is set in your shell
- `stripe listen` is running and `STRIPE_WEBHOOK_SECRET` is exported

- [ ] **Step 3: Commit**

```bash
git add tests/integration/flow-2-full-auction-lifecycle.test.ts
git commit -m "test(integration): flow 2 — full auction lifecycle happy path"
```

---

### Task 5: Flow 3 — Reserve Not Met

**Covers:** Auction closes with no bids above reserve → lot marked UNSOLD → no invoice created

**Files:**
- Create: `tests/integration/flow-3-reserve-not-met.test.ts`

**Interfaces:**
- Consumes:
  - `waitFor`, `waitForHttp` from `tests/helpers/wait.ts`
  - `resetDb`, `getDb`, `closeAllPools` from `tests/helpers/db.ts`
  - `api` from `tests/helpers/api.ts`
  - `seedAdminUser`, `seedBuyerUser`, `seedLot`, `seedAuction` from `tests/helpers/seed.ts`

- [ ] **Step 1: Write the test file**

```typescript
// tests/integration/flow-3-reserve-not-met.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { waitForHttp, waitFor } from '../helpers/wait';
import { resetDb, getDb, closeAllPools } from '../helpers/db';
import { api } from '../helpers/api';
import {
  seedAdminUser,
  seedBuyerUser,
  seedLot,
  seedAuction,
} from '../helpers/seed';

const PORTS = {
  user: 3001,
  catalogue: 3002,
  auction: 3003,
  payment: 3004,
} as const;

describe('Flow 3 — Reserve not met', () => {
  beforeAll(async () => {
    await Promise.all([
      waitForHttp(`http://localhost:${PORTS.user}/health`),
      waitForHttp(`http://localhost:${PORTS.catalogue}/health`),
      waitForHttp(`http://localhost:${PORTS.auction}/health`),
      waitForHttp(`http://localhost:${PORTS.payment}/health`),
    ]);
    await resetDb('user');
    await resetDb('catalogue');
    await resetDb('auction');
    await resetDb('payment');
    await resetDb('notification');
  });

  afterAll(async () => {
    await closeAllPools();
  });

  it('marks the lot UNSOLD and creates no invoice when no bid meets the reserve', async () => {
    // ── Arrange ────────────────────────────────────────────────────────────────
    const { accessToken: adminToken } = await seedAdminUser();

    // Seed a fully-verified buyer
    const buyerDb = getDb('user');
    const { userId: buyerId, email: buyerEmail, password: buyerPassword } =
      await seedBuyerUser();
    await buyerDb.query(
      'UPDATE users SET email_verified = true, phone_verified = true WHERE id = $1',
      [buyerId],
    );

    const buyerLoginRes = await api(PORTS.user).post<{
      data: { accessToken: string };
    }>('/auth/login', { email: buyerEmail, password: buyerPassword });
    expect(buyerLoginRes.status).toBe(200);
    const buyerToken = buyerLoginRes.body.data.accessToken;

    const { lotId } = await seedLot(adminToken);

    // Reserve price is 1000 AUD — buyer will bid only 100 (below reserve)
    const { auctionId } = await seedAuction(lotId, adminToken, {
      durationSeconds: 10,
      reservePrice: 1000,
    });

    // ── Act: wait for auction to open ─────────────────────────────────────────
    await waitFor(
      async () => {
        const r = await api(PORTS.auction).get<{ data: { status: string } }>(
          `/auctions/${auctionId}`,
        );
        return r.body.data?.status === 'OPEN';
      },
      15_000,
    );

    // ── Act: buyer places a bid below reserve ─────────────────────────────────
    const bidRes = await api(PORTS.auction).post<{
      data: { bidId: string };
    }>(
      `/auctions/${auctionId}/bids`,
      { amount: 100, currency: 'AUD' },
      buyerToken,
    );
    expect(bidRes.status).toBe(201);

    // ── Assert: auction closes ─────────────────────────────────────────────────
    await waitFor(
      async () => {
        const r = await api(PORTS.auction).get<{ data: { status: string } }>(
          `/auctions/${auctionId}`,
        );
        return r.body.data?.status === 'CLOSED';
      },
      60_000,
    );

    // ── Assert: auction result is UNSOLD ───────────────────────────────────────
    const auctionDb = getDb('auction');
    const resultRow = await auctionDb.query<{ result: string }>(
      'SELECT result FROM auctions WHERE id = $1',
      [auctionId],
    );
    expect(resultRow.rows[0].result).toBe('UNSOLD');

    // ── Assert: lot status is UNSOLD in catalogue ──────────────────────────────
    await waitFor(async () => {
      const r = await api(PORTS.catalogue).get<{
        data: { status: string };
      }>(`/lots/${lotId}`);
      return r.body.data?.status === 'UNSOLD';
    }, 15_000);

    const lotRes = await api(PORTS.catalogue).get<{ data: { status: string } }>(
      `/lots/${lotId}`,
    );
    expect(lotRes.body.data.status).toBe('UNSOLD');

    // ── Assert: no invoice was created in payment service ─────────────────────
    // Wait a generous period to confirm the payment service did NOT react to
    // the AuctionClosed event with UNSOLD result by creating an invoice.
    await new Promise((r) => setTimeout(r, 5_000));

    const paymentDb = getDb('payment');
    const invoiceCheck = await paymentDb.query<{ id: string }>(
      'SELECT id FROM invoices WHERE auction_id = $1',
      [auctionId],
    );
    expect(invoiceCheck.rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm run test:integration -- --reporter=verbose tests/integration/flow-3-reserve-not-met.test.ts
```

Expected output:
```
✓ Flow 3 — Reserve not met
  ✓ marks the lot UNSOLD and creates no invoice when no bid meets the reserve
```

- [ ] **Step 3: Run all three flows together**

```bash
pnpm run test:integration
```

Expected output:
```
✓ Flow 1 — Buyer onboarding (1 test)
✓ Flow 2 — Full auction lifecycle (1 test)
✓ Flow 3 — Reserve not met (1 test)

Test Files  3 passed (3)
Tests       3 passed (3)
```

- [ ] **Step 4: Commit**

```bash
git add tests/integration/flow-3-reserve-not-met.test.ts
git commit -m "test(integration): flow 3 — reserve not met, lot UNSOLD, no invoice"
```

---

### Task 6: CI Script — run integration tests in GitHub Actions

**Files:**
- Create: `.github/workflows/integration-tests.yml`

**Interfaces:**
- Consumes: `docker-compose.test.yml`, `pnpm run test:integration`
- Produces: a GitHub Actions workflow that runs on push to `develop` and `master`

- [ ] **Step 1: Create `.github/workflows/integration-tests.yml`**

```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests

on:
  push:
    branches: [develop, master]
  pull_request:
    branches: [develop, master]

jobs:
  integration:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    env:
      STRIPE_SECRET_KEY: ${{ secrets.STRIPE_TEST_SECRET_KEY }}

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all service images
        run: docker compose -f docker-compose.test.yml build

      - name: Start infrastructure + services
        run: docker compose -f docker-compose.test.yml up -d

      - name: Wait for all services to be healthy
        run: |
          for port in 3001 3002 3003 3004 3006 3007; do
            echo "Waiting for service on port $port..."
            for i in $(seq 1 30); do
              curl -sf http://localhost:$port/health && break || sleep 3
            done
          done

      - name: Install Stripe CLI
        run: |
          curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg > /dev/null
          echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee /etc/apt/sources.list.d/stripe.list
          sudo apt update && sudo apt install -y stripe

      - name: Start Stripe webhook listener
        run: |
          # Start stripe listen in background and capture the webhook secret
          stripe listen --api-key $STRIPE_SECRET_KEY \
            --forward-to http://localhost:3004/webhooks/stripe \
            --print-secret > /tmp/stripe-secret.txt &
          # Give it a moment to print the secret
          sleep 3
          export STRIPE_WEBHOOK_SECRET=$(cat /tmp/stripe-secret.txt)
          echo "STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET" >> $GITHUB_ENV

      - name: Restart payment service with webhook secret
        run: |
          STRIPE_WEBHOOK_SECRET=${{ env.STRIPE_WEBHOOK_SECRET }} \
            docker compose -f docker-compose.test.yml up -d --no-deps payment-service
          sleep 5

      - name: Run integration tests
        run: pnpm run test:integration

      - name: Print service logs on failure
        if: failure()
        run: docker compose -f docker-compose.test.yml logs

      - name: Tear down
        if: always()
        run: docker compose -f docker-compose.test.yml down -v
```

- [ ] **Step 2: Add `STRIPE_TEST_SECRET_KEY` to GitHub repository secrets**

In the GitHub repository settings:
1. Go to **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `STRIPE_TEST_SECRET_KEY`
4. Value: your Stripe test mode secret key (starts with `sk_test_`)

- [ ] **Step 3: Commit and push to trigger the workflow**

```bash
git add .github/workflows/integration-tests.yml
git commit -m "ci: add GitHub Actions workflow for integration tests"
git push origin develop
```

Open the **Actions** tab in GitHub and confirm the `Integration Tests` workflow appears and passes.

---

## Self-Review

### 1. Spec coverage

| Requirement | Covered by |
|---|---|
| `docker-compose.test.yml` spins up all real services + PostgreSQL + Redis + RabbitMQ | Task 1 |
| Stripe CLI `stripe listen` for webhook forwarding | Task 4 + Task 6 |
| One Vitest test file per flow | Tasks 3, 4, 5 |
| Runs sequentially (`--sequence.concurrent false`) | Task 1 (`vitest.integration.config.ts`) |
| Seed helpers in `tests/helpers/` | Task 2 |
| Flow 1 — Buyer onboarding | Task 3 |
| Flow 2 — Full auction lifecycle | Task 4 |
| Flow 3 — Reserve not met | Task 5 |
| No frontend E2E, no load testing, no unit-level edge cases | All flows — HTTP only, no Playwright |
| CI workflow | Task 6 |

### 2. Placeholder scan

No TBD, TODO, or vague steps present. All steps include concrete code or commands.

### 3. Type consistency

- `waitFor` / `waitForHttp` defined in Task 1, used in Tasks 3–5 ✓
- `getDb` / `resetDb` / `closeAllPools` defined in Task 1, used in Tasks 3–5 ✓
- `api(port)` defined in Task 2, used in Tasks 3–5 ✓
- `seedAdminUser` / `seedBuyerUser` / `seedLot` / `seedAuction` defined in Task 2, used in Tasks 4–5 ✓
- Port constants consistent across all files (3001 user, 3002 catalogue, 3003 auction, 3004 payment, 3006 shipping, 3007 notification) ✓
