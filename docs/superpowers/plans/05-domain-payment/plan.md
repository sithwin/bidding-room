# Payment Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Payment Service — invoice generation triggered by `AuctionClosed` events, Stripe Checkout session creation, webhook handling, and BullMQ-driven payment window expiry.

**Architecture:** Clean Architecture (domain → application → infrastructure → presentation); infrastructure implements interfaces defined in the domain/application layers. Stripe Checkout hosted page handles all card data — no PCI scope. BullMQ manages the 3-day payment window; a delayed job marks unpaid invoices `EXPIRED` and publishes the event.

**Tech Stack:** Hono, postgres.js, Stripe Node SDK (`stripe`), BullMQ + ioredis, amqplib, `@carat-room/shared-types`, `@carat-room/shared-events`, `@carat-room/shared-auth`, Vitest.

## Global Constraints

- Node.js 20, TypeScript 5.4, strict mode
- Hono for HTTP — no Express
- postgres.js for DB — no ORM
- Vitest for all tests — no Jest
- Named exports only — no `export default` (exception: `vitest.config.ts`)
- Single quotes for strings
- `const`/`let` only — no `var`
- Clean Architecture: domain ← application ← infrastructure ← presentation
- Service port: **3003**, DB: **`carat_payment`**
- RabbitMQ topic exchange: `carat.events`
- Payment window: configurable via `PAYMENT_WINDOW_HOURS` env var (default `72`)
- Stripe webhook: verify signature before processing — `STRIPE_WEBHOOK_SECRET` env var
- `payment_events.stripe_event_id` unique constraint ensures idempotency
- All API responses: `{ data: T }` (success) or `{ error: { code, message } }` (error)
- Auth: RS256 JWT via `@carat-room/shared-auth` `authMiddleware`
- British English in all copy

---

## File Map

```
apps/payment/
  package.json
  tsconfig.json
  vitest.config.ts
  Dockerfile
  migrations/
    001_create_payment.sql
  src/
    domain/
      invoice.ts                        — Invoice class, InvoiceStatus enum
      invoice.test.ts                   — 4 unit tests
      invoice-repository.ts             — InvoiceRepository interface
    application/
      stripe-client.ts                  — StripeClient interface + types
      expiry-scheduler.ts               — ExpiryScheduler interface
      get-invoice-use-case.ts
      create-checkout-session-use-case.ts
      handle-webhook-use-case.ts
      create-invoice-use-case.ts        — called by RabbitMQ consumer
      expire-invoice-use-case.ts        — called by BullMQ worker
      use-cases.test.ts                 — 8 mock tests (all 5 use cases)
    infrastructure/
      db.ts
      postgres-invoice-repository.ts
      postgres-invoice-repository.test.ts — 5 integration tests
      stripe-adapter.ts                 — StripeAdapter implements StripeClient
      stripe-adapter.test.ts            — 2 tests
      bullmq-expiry-scheduler.ts        — BullMQExpiryScheduler implements ExpiryScheduler
      bullmq-expiry-scheduler.test.ts   — 2 tests
      auction-closed-consumer.ts        — RabbitMQ consumer: auction.closed → CreateInvoice
      payment-event-publisher.ts        — publishes InvoiceCreated / PaymentReceived / InvoiceExpired
    presentation/
      payment-router.ts                 — 3 routes
      payment-router.test.ts            — 5 route tests
    main.ts                             — wires all layers, BullMQ worker, RabbitMQ consumer

apps/user-portal/
  src/app/account/invoices/[id]/
    page.tsx                            — Server component: fetch + render invoice
    InvoiceDetail.tsx                   — Client component: Pay Now button
```

**Total tests: 26**

---

### Task 1: Scaffold — Package, Config, Migration

**Files:**
- Create: `apps/payment/package.json`
- Create: `apps/payment/tsconfig.json`
- Create: `apps/payment/vitest.config.ts`
- Create: `apps/payment/migrations/001_create_payment.sql`
- Create: `apps/payment/Dockerfile`

**Interfaces:**
- Produces: runnable TypeScript service scaffold; DB schema for all subsequent tasks

- [ ] **Step 1: Create `apps/payment/package.json`**

```json
{
  "name": "@carat-room/payment",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc --build",
    "start": "node dist/main.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate": "tsx scripts/migrate.ts"
  },
  "dependencies": {
    "@carat-room/shared-auth": "workspace:*",
    "@carat-room/shared-events": "workspace:*",
    "@carat-room/shared-types": "workspace:*",
    "@hono/node-server": "^1.12.0",
    "bullmq": "^5.12.0",
    "hono": "^4.4.0",
    "ioredis": "^5.4.1",
    "postgres": "^3.4.4",
    "stripe": "^16.2.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.15.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `apps/payment/tsconfig.json`**

```json
{
  "extends": "@carat-room/tsconfig/service.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `apps/payment/vitest.config.ts`**

```typescript
export default {
  test: {
    environment: 'node',
  },
};
```

- [ ] **Step 4: Create `apps/payment/migrations/001_create_payment.sql`**

```sql
CREATE TABLE invoices (
  id                    UUID PRIMARY KEY,
  lot_id                UUID NOT NULL,
  winner_user_id        UUID NOT NULL,
  amount                NUMERIC(12,2) NOT NULL,
  currency              TEXT NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('AWAITING_PAYMENT','PAID','EXPIRED','CANCELLED')),
  stripe_checkout_id    TEXT,
  stripe_payment_intent TEXT,
  due_at                TIMESTAMPTZ NOT NULL,
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID REFERENCES invoices(id),
  stripe_event_id  TEXT UNIQUE NOT NULL,
  event_type       TEXT NOT NULL,
  payload          JSONB NOT NULL,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX invoices_winner_user_id_idx ON invoices (winner_user_id);
CREATE INDEX invoices_lot_id_idx ON invoices (lot_id);
```

- [ ] **Step 5: Create `apps/payment/Dockerfile`**

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
EXPOSE 3003
CMD ["node", "dist/main.js"]
```

- [ ] **Step 6: Commit**

```bash
git add apps/payment/
git commit -m "feat(payment): scaffold package, tsconfig, migration"
```

---

### Task 2: Domain — Invoice Entity

**Files:**
- Create: `apps/payment/src/domain/invoice.ts`
- Create: `apps/payment/src/domain/invoice-repository.ts`
- Test: `apps/payment/src/domain/invoice.test.ts`

**Interfaces:**
- Produces:
  - `InvoiceStatus` enum — used by all subsequent tasks
  - `Invoice` class — constructed via `new Invoice(props: InvoiceProps)`
  - `InvoiceRepository` interface — implemented in Task 3
  - `invoice.isOwnedBy(userId: string): boolean`
  - `invoice.isAwaitingPayment(): boolean`

- [ ] **Step 1: Write the failing tests**

Create `apps/payment/src/domain/invoice.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Invoice, InvoiceStatus } from './invoice';

function buildInvoice(overrides: Partial<ConstructorParameters<typeof Invoice>[0]> = {}): Invoice {
  return new Invoice({
    id: 'inv-1',
    lotId: 'lot-1',
    winnerUserId: 'user-1',
    amount: 1500.00,
    currency: 'AUD',
    status: InvoiceStatus.AwaitingPayment,
    stripeCheckoutId: null,
    stripePaymentIntent: null,
    dueAt: new Date('2026-06-23T00:00:00Z'),
    paidAt: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
    ...overrides,
  });
}

describe('Invoice', () => {
  it('should_returnTrue_when_isOwnedByMatchesWinnerUserId', () => {
    const invoice = buildInvoice({ winnerUserId: 'user-abc' });

    const result = invoice.isOwnedBy('user-abc');

    expect(result).toBe(true);
  });

  it('should_returnFalse_when_isOwnedByDoesNotMatchWinnerUserId', () => {
    const invoice = buildInvoice({ winnerUserId: 'user-abc' });

    const result = invoice.isOwnedBy('user-xyz');

    expect(result).toBe(false);
  });

  it('should_returnTrue_when_statusIsAwaitingPayment', () => {
    const invoice = buildInvoice({ status: InvoiceStatus.AwaitingPayment });

    expect(invoice.isAwaitingPayment()).toBe(true);
  });

  it('should_returnFalse_when_statusIsPaid', () => {
    const invoice = buildInvoice({ status: InvoiceStatus.Paid });

    expect(invoice.isAwaitingPayment()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/payment
npx vitest run src/domain/invoice.test.ts
```

Expected: FAIL — `Cannot find module './invoice'`

- [ ] **Step 3: Create `apps/payment/src/domain/invoice.ts`**

```typescript
export enum InvoiceStatus {
  AwaitingPayment = 'AWAITING_PAYMENT',
  Paid = 'PAID',
  Expired = 'EXPIRED',
  Cancelled = 'CANCELLED',
}

export interface InvoiceProps {
  id: string;
  lotId: string;
  winnerUserId: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  stripeCheckoutId: string | null;
  stripePaymentIntent: string | null;
  dueAt: Date;
  paidAt: Date | null;
  createdAt: Date;
}

export class Invoice {
  readonly id: string;
  readonly lotId: string;
  readonly winnerUserId: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: InvoiceStatus;
  readonly stripeCheckoutId: string | null;
  readonly stripePaymentIntent: string | null;
  readonly dueAt: Date;
  readonly paidAt: Date | null;
  readonly createdAt: Date;

  constructor(props: InvoiceProps) {
    this.id = props.id;
    this.lotId = props.lotId;
    this.winnerUserId = props.winnerUserId;
    this.amount = props.amount;
    this.currency = props.currency;
    this.status = props.status;
    this.stripeCheckoutId = props.stripeCheckoutId;
    this.stripePaymentIntent = props.stripePaymentIntent;
    this.dueAt = props.dueAt;
    this.paidAt = props.paidAt;
    this.createdAt = props.createdAt;
  }

  isOwnedBy(userId: string): boolean {
    return this.winnerUserId === userId;
  }

  isAwaitingPayment(): boolean {
    return this.status === InvoiceStatus.AwaitingPayment;
  }
}
```

- [ ] **Step 4: Create `apps/payment/src/domain/invoice-repository.ts`**

```typescript
import { Invoice } from './invoice';

export interface InvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  findByLotId(lotId: string): Promise<Invoice | null>;
  save(invoice: Invoice): Promise<void>;
  isPaymentEventProcessed(stripeEventId: string): Promise<boolean>;
  savePaymentEvent(params: {
    invoiceId: string;
    stripeEventId: string;
    eventType: string;
    payload: unknown;
  }): Promise<void>;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/domain/invoice.test.ts
```

Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add apps/payment/src/domain/
git commit -m "feat(payment): Invoice domain entity and repository interface"
```

---

### Task 3: Infrastructure — PostgresInvoiceRepository

**Files:**
- Create: `apps/payment/src/infrastructure/db.ts`
- Create: `apps/payment/src/infrastructure/postgres-invoice-repository.ts`
- Test: `apps/payment/src/infrastructure/postgres-invoice-repository.test.ts`

**Interfaces:**
- Consumes: `Invoice`, `InvoiceStatus`, `InvoiceRepository` from Task 2
- Produces:
  - `createDb(url: string): Db` — postgres.js instance
  - `PostgresInvoiceRepository` implements `InvoiceRepository`

**Setup:** Integration tests require a `carat_payment_test` database. Run the migration SQL from Task 1 against it before running tests. Set `TEST_DATABASE_URL=postgres://localhost/carat_payment_test` in your environment.

- [ ] **Step 1: Write the failing tests**

Create `apps/payment/src/infrastructure/postgres-invoice-repository.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { createDb } from './db';
import { PostgresInvoiceRepository } from './postgres-invoice-repository';
import { Invoice, InvoiceStatus } from '../domain/invoice';

const db = createDb(process.env['TEST_DATABASE_URL'] ?? 'postgres://localhost/carat_payment_test');
const repo = new PostgresInvoiceRepository(db);

function buildInvoice(overrides: Partial<ConstructorParameters<typeof Invoice>[0]> = {}): Invoice {
  return new Invoice({
    id: 'inv-test-1',
    lotId: 'lot-1',
    winnerUserId: 'user-1',
    amount: 500.00,
    currency: 'AUD',
    status: InvoiceStatus.AwaitingPayment,
    stripeCheckoutId: null,
    stripePaymentIntent: null,
    dueAt: new Date('2026-06-23T00:00:00Z'),
    paidAt: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
    ...overrides,
  });
}

afterEach(async () => {
  await db`DELETE FROM payment_events`;
  await db`DELETE FROM invoices`;
});

describe('PostgresInvoiceRepository', () => {
  it('should_saveAndFindById_when_invoiceSaved', async () => {
    const invoice = buildInvoice();
    await repo.save(invoice);

    const found = await repo.findById('inv-test-1');

    expect(found).not.toBeNull();
    expect(found!.id).toBe('inv-test-1');
    expect(found!.amount).toBe(500.00);
    expect(found!.status).toBe(InvoiceStatus.AwaitingPayment);
  });

  it('should_returnNull_when_invoiceNotFound', async () => {
    const found = await repo.findById('does-not-exist');

    expect(found).toBeNull();
  });

  it('should_findByLotId_when_invoiceExists', async () => {
    await repo.save(buildInvoice({ lotId: 'lot-xyz' }));

    const found = await repo.findByLotId('lot-xyz');

    expect(found).not.toBeNull();
    expect(found!.lotId).toBe('lot-xyz');
  });

  it('should_updateInvoiceStatus_when_savedWithNewStatus', async () => {
    const invoice = buildInvoice();
    await repo.save(invoice);

    const paidInvoice = new Invoice({
      ...invoice,
      status: InvoiceStatus.Paid,
      stripePaymentIntent: 'pi_test_abc',
      paidAt: new Date('2026-06-21T10:00:00Z'),
    });
    await repo.save(paidInvoice);

    const found = await repo.findById('inv-test-1');
    expect(found!.status).toBe(InvoiceStatus.Paid);
    expect(found!.stripePaymentIntent).toBe('pi_test_abc');
  });

  it('should_detectDuplicateStripeEvent_when_eventAlreadySaved', async () => {
    const invoice = buildInvoice();
    await repo.save(invoice);
    await repo.savePaymentEvent({
      invoiceId: 'inv-test-1',
      stripeEventId: 'evt_123',
      eventType: 'checkout.session.completed',
      payload: { test: true },
    });

    const isDuplicate = await repo.isPaymentEventProcessed('evt_123');

    expect(isDuplicate).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/infrastructure/postgres-invoice-repository.test.ts
```

Expected: FAIL — `Cannot find module './db'`

- [ ] **Step 3: Create `apps/payment/src/infrastructure/db.ts`**

```typescript
import postgres from 'postgres';

export type Db = ReturnType<typeof postgres>;

export function createDb(url: string): Db {
  return postgres(url);
}
```

- [ ] **Step 4: Create `apps/payment/src/infrastructure/postgres-invoice-repository.ts`**

```typescript
import { Invoice, InvoiceStatus } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';
import { Db } from './db';

interface InvoiceRow {
  id: string;
  lot_id: string;
  winner_user_id: string;
  amount: string;
  currency: string;
  status: string;
  stripe_checkout_id: string | null;
  stripe_payment_intent: string | null;
  due_at: Date;
  paid_at: Date | null;
  created_at: Date;
}

function rowToInvoice(row: InvoiceRow): Invoice {
  return new Invoice({
    id: row.id,
    lotId: row.lot_id,
    winnerUserId: row.winner_user_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as InvoiceStatus,
    stripeCheckoutId: row.stripe_checkout_id,
    stripePaymentIntent: row.stripe_payment_intent,
    dueAt: row.due_at,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  });
}

export class PostgresInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Invoice | null> {
    const rows = await this.db<InvoiceRow[]>`
      SELECT * FROM invoices WHERE id = ${id}
    `;
    return rows[0] ? rowToInvoice(rows[0]) : null;
  }

  async findByLotId(lotId: string): Promise<Invoice | null> {
    const rows = await this.db<InvoiceRow[]>`
      SELECT * FROM invoices WHERE lot_id = ${lotId}
    `;
    return rows[0] ? rowToInvoice(rows[0]) : null;
  }

  async save(invoice: Invoice): Promise<void> {
    await this.db`
      INSERT INTO invoices (
        id, lot_id, winner_user_id, amount, currency, status,
        stripe_checkout_id, stripe_payment_intent, due_at, paid_at, created_at
      ) VALUES (
        ${invoice.id}, ${invoice.lotId}, ${invoice.winnerUserId},
        ${invoice.amount}, ${invoice.currency}, ${invoice.status},
        ${invoice.stripeCheckoutId}, ${invoice.stripePaymentIntent},
        ${invoice.dueAt}, ${invoice.paidAt}, ${invoice.createdAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        stripe_checkout_id = EXCLUDED.stripe_checkout_id,
        stripe_payment_intent = EXCLUDED.stripe_payment_intent,
        paid_at = EXCLUDED.paid_at
    `;
  }

  async isPaymentEventProcessed(stripeEventId: string): Promise<boolean> {
    const rows = await this.db`
      SELECT id FROM payment_events WHERE stripe_event_id = ${stripeEventId}
    `;
    return rows.length > 0;
  }

  async savePaymentEvent(params: {
    invoiceId: string;
    stripeEventId: string;
    eventType: string;
    payload: unknown;
  }): Promise<void> {
    await this.db`
      INSERT INTO payment_events (invoice_id, stripe_event_id, event_type, payload)
      VALUES (
        ${params.invoiceId},
        ${params.stripeEventId},
        ${params.eventType},
        ${this.db.json(params.payload as Record<string, unknown>)}
      )
    `;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/infrastructure/postgres-invoice-repository.test.ts
```

Expected: 5 passed

- [ ] **Step 6: Commit**

```bash
git add apps/payment/src/infrastructure/db.ts apps/payment/src/infrastructure/postgres-invoice-repository.ts apps/payment/src/infrastructure/postgres-invoice-repository.test.ts
git commit -m "feat(payment): PostgresInvoiceRepository with idempotent payment event log"
```

---

### Task 4: Application Interfaces + Use Cases

**Files:**
- Create: `apps/payment/src/application/stripe-client.ts`
- Create: `apps/payment/src/application/expiry-scheduler.ts`
- Create: `apps/payment/src/application/get-invoice-use-case.ts`
- Create: `apps/payment/src/application/create-checkout-session-use-case.ts`
- Create: `apps/payment/src/application/handle-webhook-use-case.ts`
- Create: `apps/payment/src/application/create-invoice-use-case.ts`
- Create: `apps/payment/src/application/expire-invoice-use-case.ts`
- Test: `apps/payment/src/application/use-cases.test.ts`

**Interfaces:**
- Consumes: `Invoice`, `InvoiceStatus`, `InvoiceRepository` from Tasks 2–3
- Produces:
  - `StripeClient` interface — implemented in Task 5
  - `ExpiryScheduler` interface — implemented in Task 5
  - All 5 use case classes, each with an `.execute()` method

- [ ] **Step 1: Write the failing tests**

Create `apps/payment/src/application/use-cases.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Invoice, InvoiceStatus } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';
import { StripeClient } from './stripe-client';
import { ExpiryScheduler } from './expiry-scheduler';
import { GetInvoiceUseCase } from './get-invoice-use-case';
import { CreateCheckoutSessionUseCase } from './create-checkout-session-use-case';
import { HandleWebhookUseCase } from './handle-webhook-use-case';
import { CreateInvoiceUseCase } from './create-invoice-use-case';
import { ExpireInvoiceUseCase } from './expire-invoice-use-case';

function buildInvoice(overrides: Partial<ConstructorParameters<typeof Invoice>[0]> = {}): Invoice {
  return new Invoice({
    id: 'inv-1',
    lotId: 'lot-1',
    winnerUserId: 'user-1',
    amount: 800.00,
    currency: 'AUD',
    status: InvoiceStatus.AwaitingPayment,
    stripeCheckoutId: null,
    stripePaymentIntent: null,
    dueAt: new Date('2026-06-23T00:00:00Z'),
    paidAt: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
    ...overrides,
  });
}

const mockRepo: InvoiceRepository = {
  findById: vi.fn(),
  findByLotId: vi.fn(),
  save: vi.fn(),
  isPaymentEventProcessed: vi.fn(),
  savePaymentEvent: vi.fn(),
};

const mockStripe: StripeClient = {
  createCheckoutSession: vi.fn(),
  constructWebhookEvent: vi.fn(),
};

const mockScheduler: ExpiryScheduler = {
  scheduleExpiry: vi.fn(),
  cancelExpiry: vi.fn(),
};

const mockPublish = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GetInvoiceUseCase', () => {
  it('should_returnInvoice_when_userOwnsIt', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(buildInvoice());
    const useCase = new GetInvoiceUseCase(mockRepo);

    const result = await useCase.execute({ invoiceId: 'inv-1', requestingUserId: 'user-1' });

    expect(result).not.toBeNull();
    expect(result!.id).toBe('inv-1');
  });

  it('should_returnNull_when_userDoesNotOwnInvoice', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(buildInvoice({ winnerUserId: 'user-1' }));
    const useCase = new GetInvoiceUseCase(mockRepo);

    const result = await useCase.execute({ invoiceId: 'inv-1', requestingUserId: 'user-other' });

    expect(result).toBeNull();
  });
});

describe('CreateCheckoutSessionUseCase', () => {
  it('should_createStripeSessionAndSaveCheckoutId_when_invoiceIsAwaitingPayment', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(buildInvoice());
    vi.mocked(mockStripe.createCheckoutSession).mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/test',
    });
    const useCase = new CreateCheckoutSessionUseCase(mockRepo, mockStripe, 'https://example.com');

    const result = await useCase.execute({
      invoiceId: 'inv-1',
      requestingUserId: 'user-1',
      lotTitle: 'Gold Ring',
    });

    expect(result).toEqual({ checkoutUrl: 'https://checkout.stripe.com/test' });
    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCheckoutId: 'cs_test_123' }),
    );
  });
});

describe('HandleWebhookUseCase', () => {
  it('should_markInvoicePaid_when_checkoutSessionCompleted', async () => {
    vi.mocked(mockStripe.constructWebhookEvent).mockReturnValue({
      id: 'evt_abc',
      type: 'checkout.session.completed',
      data: { object: { metadata: { invoiceId: 'inv-1' }, payment_intent: 'pi_test' } },
    });
    vi.mocked(mockRepo.isPaymentEventProcessed).mockResolvedValue(false);
    vi.mocked(mockRepo.findById).mockResolvedValue(buildInvoice());
    const useCase = new HandleWebhookUseCase(mockRepo, mockStripe, mockPublish, mockScheduler);

    await useCase.execute({ rawBody: Buffer.from('{}'), signature: 'sig_test' });

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: InvoiceStatus.Paid }),
    );
    expect(mockPublish).toHaveBeenCalledWith('payment.received', expect.any(Object));
  });

  it('should_skipProcessing_when_stripeEventAlreadyProcessed', async () => {
    vi.mocked(mockStripe.constructWebhookEvent).mockReturnValue({
      id: 'evt_abc',
      type: 'checkout.session.completed',
      data: { object: { metadata: { invoiceId: 'inv-1' }, payment_intent: 'pi_test' } },
    });
    vi.mocked(mockRepo.isPaymentEventProcessed).mockResolvedValue(true);
    const useCase = new HandleWebhookUseCase(mockRepo, mockStripe, mockPublish, mockScheduler);

    await useCase.execute({ rawBody: Buffer.from('{}'), signature: 'sig_test' });

    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});

describe('CreateInvoiceUseCase', () => {
  it('should_createInvoiceAndScheduleExpiry_when_auctionClosedWithWinner', async () => {
    vi.mocked(mockRepo.findByLotId).mockResolvedValue(null);
    const useCase = new CreateInvoiceUseCase(mockRepo, mockScheduler, mockPublish, 72);

    await useCase.execute({
      lotId: 'lot-1',
      winnerUserId: 'user-1',
      amount: 800.00,
      currency: 'AUD',
    });

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lotId: 'lot-1',
        winnerUserId: 'user-1',
        status: InvoiceStatus.AwaitingPayment,
      }),
    );
    expect(mockScheduler.scheduleExpiry).toHaveBeenCalled();
    expect(mockPublish).toHaveBeenCalledWith('payment.invoice.created', expect.any(Object));
  });
});

describe('ExpireInvoiceUseCase', () => {
  it('should_markExpiredAndPublish_when_invoiceIsStillAwaitingPayment', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(buildInvoice());
    const useCase = new ExpireInvoiceUseCase(mockRepo, mockPublish);

    await useCase.execute({ invoiceId: 'inv-1' });

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: InvoiceStatus.Expired }),
    );
    expect(mockPublish).toHaveBeenCalledWith('payment.invoice.expired', expect.any(Object));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/application/use-cases.test.ts
```

Expected: FAIL — `Cannot find module './stripe-client'`

- [ ] **Step 3: Create `apps/payment/src/application/stripe-client.ts`**

```typescript
export interface CheckoutSession {
  id: string;
  url: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface StripeClient {
  createCheckoutSession(params: {
    invoiceId: string;
    amount: number;
    currency: string;
    lotTitle: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession>;
  constructWebhookEvent(payload: Buffer, signature: string): WebhookEvent;
}
```

- [ ] **Step 4: Create `apps/payment/src/application/expiry-scheduler.ts`**

```typescript
export interface ExpiryScheduler {
  scheduleExpiry(invoiceId: string, dueAt: Date): Promise<void>;
  cancelExpiry(invoiceId: string): Promise<void>;
}
```

- [ ] **Step 5: Create `apps/payment/src/application/get-invoice-use-case.ts`**

```typescript
import { Invoice } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';

export class GetInvoiceUseCase {
  constructor(private readonly invoiceRepository: InvoiceRepository) {}

  async execute(params: { invoiceId: string; requestingUserId: string }): Promise<Invoice | null> {
    const invoice = await this.invoiceRepository.findById(params.invoiceId);
    if (!invoice || !invoice.isOwnedBy(params.requestingUserId)) {
      return null;
    }
    return invoice;
  }
}
```

- [ ] **Step 6: Create `apps/payment/src/application/create-checkout-session-use-case.ts`**

```typescript
import { Invoice } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';
import { StripeClient } from './stripe-client';

export class CreateCheckoutSessionUseCase {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly stripeClient: StripeClient,
    private readonly frontendUrl: string,
  ) {}

  async execute(params: {
    invoiceId: string;
    requestingUserId: string;
    lotTitle: string;
  }): Promise<{ checkoutUrl: string } | null> {
    const invoice = await this.invoiceRepository.findById(params.invoiceId);
    if (!invoice || !invoice.isOwnedBy(params.requestingUserId)) {
      return null;
    }
    if (!invoice.isAwaitingPayment()) {
      return null;
    }

    const session = await this.stripeClient.createCheckoutSession({
      invoiceId: invoice.id,
      amount: invoice.amount,
      currency: invoice.currency,
      lotTitle: params.lotTitle,
      successUrl: `${this.frontendUrl}/account/invoices/${invoice.id}?payment=success`,
      cancelUrl: `${this.frontendUrl}/account/invoices/${invoice.id}`,
    });

    const updated = new Invoice({ ...invoice, stripeCheckoutId: session.id });
    await this.invoiceRepository.save(updated);

    return { checkoutUrl: session.url };
  }
}
```

- [ ] **Step 7: Create `apps/payment/src/application/handle-webhook-use-case.ts`**

```typescript
import { Invoice, InvoiceStatus } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';
import { StripeClient } from './stripe-client';
import { ExpiryScheduler } from './expiry-scheduler';

type EventPublisher = (routingKey: string, payload: unknown) => Promise<void>;

export class HandleWebhookUseCase {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly stripeClient: StripeClient,
    private readonly publish: EventPublisher,
    private readonly expiryScheduler: ExpiryScheduler,
  ) {}

  async execute(params: { rawBody: Buffer; signature: string }): Promise<void> {
    const event = this.stripeClient.constructWebhookEvent(params.rawBody, params.signature);

    const isProcessed = await this.invoiceRepository.isPaymentEventProcessed(event.id);
    if (isProcessed) {
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as {
        metadata: { invoiceId: string };
        payment_intent: string;
      };
      const invoiceId = session.metadata.invoiceId;

      const invoice = await this.invoiceRepository.findById(invoiceId);
      if (!invoice || !invoice.isAwaitingPayment()) {
        return;
      }

      const paidInvoice = new Invoice({
        ...invoice,
        status: InvoiceStatus.Paid,
        stripePaymentIntent: session.payment_intent,
        paidAt: new Date(),
      });

      await this.invoiceRepository.save(paidInvoice);
      await this.invoiceRepository.savePaymentEvent({
        invoiceId,
        stripeEventId: event.id,
        eventType: event.type,
        payload: event.data.object,
      });
      await this.expiryScheduler.cancelExpiry(invoiceId);
      await this.publish('payment.received', {
        invoiceId,
        lotId: paidInvoice.lotId,
        winnerUserId: paidInvoice.winnerUserId,
        amount: paidInvoice.amount,
        currency: paidInvoice.currency,
        paidAt: paidInvoice.paidAt!.toISOString(),
      });
    }
  }
}
```

- [ ] **Step 8: Create `apps/payment/src/application/create-invoice-use-case.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Invoice, InvoiceStatus } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';
import { ExpiryScheduler } from './expiry-scheduler';

type EventPublisher = (routingKey: string, payload: unknown) => Promise<void>;

export class CreateInvoiceUseCase {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly expiryScheduler: ExpiryScheduler,
    private readonly publish: EventPublisher,
    private readonly paymentWindowHours: number,
  ) {}

  async execute(params: {
    lotId: string;
    winnerUserId: string;
    amount: number;
    currency: string;
  }): Promise<void> {
    const existing = await this.invoiceRepository.findByLotId(params.lotId);
    if (existing) {
      return;
    }

    const now = new Date();
    const dueAt = new Date(now.getTime() + this.paymentWindowHours * 60 * 60 * 1000);

    const invoice = new Invoice({
      id: uuidv4(),
      lotId: params.lotId,
      winnerUserId: params.winnerUserId,
      amount: params.amount,
      currency: params.currency,
      status: InvoiceStatus.AwaitingPayment,
      stripeCheckoutId: null,
      stripePaymentIntent: null,
      dueAt,
      paidAt: null,
      createdAt: now,
    });

    await this.invoiceRepository.save(invoice);
    await this.expiryScheduler.scheduleExpiry(invoice.id, invoice.dueAt);
    await this.publish('payment.invoice.created', {
      invoiceId: invoice.id,
      lotId: invoice.lotId,
      winnerUserId: invoice.winnerUserId,
      amount: invoice.amount,
      currency: invoice.currency,
      dueAt: invoice.dueAt.toISOString(),
    });
  }
}
```

- [ ] **Step 9: Create `apps/payment/src/application/expire-invoice-use-case.ts`**

```typescript
import { Invoice, InvoiceStatus } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';

type EventPublisher = (routingKey: string, payload: unknown) => Promise<void>;

export class ExpireInvoiceUseCase {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly publish: EventPublisher,
  ) {}

  async execute(params: { invoiceId: string }): Promise<void> {
    const invoice = await this.invoiceRepository.findById(params.invoiceId);
    if (!invoice || !invoice.isAwaitingPayment()) {
      return;
    }

    const expired = new Invoice({ ...invoice, status: InvoiceStatus.Expired });
    await this.invoiceRepository.save(expired);
    await this.publish('payment.invoice.expired', {
      invoiceId: expired.id,
      lotId: expired.lotId,
      winnerUserId: expired.winnerUserId,
    });
  }
}
```

- [ ] **Step 10: Run tests to verify they pass**

```bash
npx vitest run src/application/use-cases.test.ts
```

Expected: 8 passed

- [ ] **Step 11: Commit**

```bash
git add apps/payment/src/application/
git commit -m "feat(payment): StripeClient + ExpiryScheduler interfaces, all 5 use cases"
```

---

### Task 5: Infrastructure Adapters — StripeAdapter + BullMQExpiryScheduler

**Files:**
- Create: `apps/payment/src/infrastructure/stripe-adapter.ts`
- Create: `apps/payment/src/infrastructure/stripe-adapter.test.ts`
- Create: `apps/payment/src/infrastructure/bullmq-expiry-scheduler.ts`
- Create: `apps/payment/src/infrastructure/bullmq-expiry-scheduler.test.ts`

**Interfaces:**
- Consumes: `StripeClient`, `CheckoutSession`, `WebhookEvent` from Task 4; `ExpiryScheduler` from Task 4
- Produces:
  - `StripeAdapter` implements `StripeClient`
  - `BullMQExpiryScheduler` implements `ExpiryScheduler`

- [ ] **Step 1: Write the failing tests**

Create `apps/payment/src/infrastructure/stripe-adapter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';
import { StripeAdapter } from './stripe-adapter';

vi.mock('stripe');

describe('StripeAdapter', () => {
  let mockStripe: {
    checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
    webhooks: { constructEvent: ReturnType<typeof vi.fn> };
  };
  let adapter: StripeAdapter;

  beforeEach(() => {
    mockStripe = {
      checkout: { sessions: { create: vi.fn() } },
      webhooks: { constructEvent: vi.fn() },
    };
    vi.mocked(Stripe).mockImplementation(() => mockStripe as unknown as Stripe);
    adapter = new StripeAdapter('sk_test_abc', 'whsec_test');
  });

  it('should_returnCheckoutSession_when_created', async () => {
    mockStripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/test',
    });

    const result = await adapter.createCheckoutSession({
      invoiceId: 'inv-1',
      amount: 500.00,
      currency: 'aud',
      lotTitle: 'Sapphire Ring',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });

    expect(result).toEqual({ id: 'cs_test_123', url: 'https://checkout.stripe.com/test' });
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { invoiceId: 'inv-1' } }),
    );
  });

  it('should_constructWebhookEvent_with_rawBodyAndSignature', () => {
    mockStripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_abc',
      type: 'checkout.session.completed',
      data: { object: {} },
    });

    const result = adapter.constructWebhookEvent(Buffer.from('{}'), 'sig_test');

    expect(result.id).toBe('evt_abc');
    expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
      Buffer.from('{}'),
      'sig_test',
      'whsec_test',
    );
  });
});
```

Create `apps/payment/src/infrastructure/bullmq-expiry-scheduler.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Queue } from 'bullmq';
import { BullMQExpiryScheduler } from './bullmq-expiry-scheduler';

vi.mock('bullmq');

describe('BullMQExpiryScheduler', () => {
  it('should_addDelayedJob_when_schedulingExpiry', async () => {
    const mockAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
    vi.mocked(Queue).mockImplementation(
      () => ({ add: mockAdd, getJob: vi.fn().mockResolvedValue(null) }) as unknown as Queue,
    );

    const scheduler = new BullMQExpiryScheduler({ host: 'localhost', port: 6379 });
    const dueAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await scheduler.scheduleExpiry('inv-1', dueAt);

    expect(mockAdd).toHaveBeenCalledWith(
      'expire-invoice',
      { invoiceId: 'inv-1' },
      expect.objectContaining({ jobId: 'expiry:inv-1', delay: expect.any(Number) }),
    );
  });

  it('should_removeJob_when_cancellingExpiry', async () => {
    const mockRemove = vi.fn().mockResolvedValue(undefined);
    const mockGetJob = vi.fn().mockResolvedValue({ remove: mockRemove });
    vi.mocked(Queue).mockImplementation(
      () => ({ add: vi.fn(), getJob: mockGetJob }) as unknown as Queue,
    );

    const scheduler = new BullMQExpiryScheduler({ host: 'localhost', port: 6379 });

    await scheduler.cancelExpiry('inv-1');

    expect(mockGetJob).toHaveBeenCalledWith('expiry:inv-1');
    expect(mockRemove).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/infrastructure/stripe-adapter.test.ts src/infrastructure/bullmq-expiry-scheduler.test.ts
```

Expected: FAIL — `Cannot find module './stripe-adapter'`

- [ ] **Step 3: Create `apps/payment/src/infrastructure/stripe-adapter.ts`**

```typescript
import Stripe from 'stripe';
import { StripeClient, CheckoutSession, WebhookEvent } from '../application/stripe-client';

export class StripeAdapter implements StripeClient {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
  }

  async createCheckoutSession(params: {
    invoiceId: string;
    amount: number;
    currency: string;
    lotTitle: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: params.currency.toLowerCase(),
            unit_amount: Math.round(params.amount * 100),
            product_data: { name: params.lotTitle },
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: { invoiceId: params.invoiceId },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });

    return { id: session.id, url: session.url! };
  }

  constructWebhookEvent(payload: Buffer, signature: string): WebhookEvent {
    const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    return {
      id: event.id,
      type: event.type,
      data: { object: event.data.object as Record<string, unknown> },
    };
  }
}
```

- [ ] **Step 4: Create `apps/payment/src/infrastructure/bullmq-expiry-scheduler.ts`**

```typescript
import { Queue } from 'bullmq';
import { ExpiryScheduler } from '../application/expiry-scheduler';

const QUEUE_NAME = 'invoice-expiry';
const JOB_NAME = 'expire-invoice';

interface RedisOptions {
  host: string;
  port: number;
}

export class BullMQExpiryScheduler implements ExpiryScheduler {
  private readonly queue: Queue;

  constructor(redis: RedisOptions) {
    this.queue = new Queue(QUEUE_NAME, { connection: redis });
  }

  async scheduleExpiry(invoiceId: string, dueAt: Date): Promise<void> {
    const delay = Math.max(0, dueAt.getTime() - Date.now());
    await this.queue.add(
      JOB_NAME,
      { invoiceId },
      { jobId: `expiry:${invoiceId}`, delay },
    );
  }

  async cancelExpiry(invoiceId: string): Promise<void> {
    const job = await this.queue.getJob(`expiry:${invoiceId}`);
    if (job) {
      await job.remove();
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/infrastructure/stripe-adapter.test.ts src/infrastructure/bullmq-expiry-scheduler.test.ts
```

Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add apps/payment/src/infrastructure/stripe-adapter.ts apps/payment/src/infrastructure/stripe-adapter.test.ts apps/payment/src/infrastructure/bullmq-expiry-scheduler.ts apps/payment/src/infrastructure/bullmq-expiry-scheduler.test.ts
git commit -m "feat(payment): StripeAdapter and BullMQExpiryScheduler infrastructure adapters"
```

---

### Task 6: Event Consumer + Publisher

**Files:**
- Create: `apps/payment/src/infrastructure/payment-event-publisher.ts`
- Create: `apps/payment/src/infrastructure/auction-closed-consumer.ts`

**Interfaces:**
- Consumes: `CreateInvoiceUseCase` from Task 4; `EventPublisher`, `EventSubscriber`, `ROUTING_KEYS` from `@carat-room/shared-events` / `@carat-room/shared-types`
- Produces:
  - `createPaymentEventPublisher(publisher): publish fn` — the `publish` callback passed to all use cases
  - `startAuctionClosedConsumer(subscriber, createInvoiceUseCase): Promise<void>` — called in `main.ts`

- [ ] **Step 1: Create `apps/payment/src/infrastructure/payment-event-publisher.ts`**

```typescript
import { EventPublisher } from '@carat-room/shared-events';

export function createPaymentEventPublisher(
  publisher: EventPublisher,
): (routingKey: string, payload: unknown) => Promise<void> {
  return (routingKey: string, payload: unknown) =>
    publisher.publish(routingKey, payload as Record<string, unknown>);
}
```

- [ ] **Step 2: Create `apps/payment/src/infrastructure/auction-closed-consumer.ts`**

```typescript
import { EventSubscriber } from '@carat-room/shared-events';
import { ROUTING_KEYS } from '@carat-room/shared-types';
import { CreateInvoiceUseCase } from '../application/create-invoice-use-case';

interface AuctionClosedPayload {
  lotId: string;
  winnerUserId: string | null;
  highestAmount: number;
  currency: string;
  reserveMet: boolean;
}

export async function startAuctionClosedConsumer(
  subscriber: EventSubscriber,
  createInvoiceUseCase: CreateInvoiceUseCase,
): Promise<void> {
  await subscriber.subscribe(
    ROUTING_KEYS.AUCTION_CLOSED,
    'payment.auction-closed',
    async (payload: unknown) => {
      const event = payload as AuctionClosedPayload;
      if (!event.reserveMet || !event.winnerUserId) {
        return;
      }
      await createInvoiceUseCase.execute({
        lotId: event.lotId,
        winnerUserId: event.winnerUserId,
        amount: event.highestAmount,
        currency: event.currency,
      });
    },
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/payment/src/infrastructure/payment-event-publisher.ts apps/payment/src/infrastructure/auction-closed-consumer.ts
git commit -m "feat(payment): RabbitMQ auction-closed consumer and event publisher"
```

---

### Task 7: Presentation — Hono Router + main.ts

**Files:**
- Create: `apps/payment/src/presentation/payment-router.ts`
- Test: `apps/payment/src/presentation/payment-router.test.ts`
- Create: `apps/payment/src/main.ts`

**Interfaces:**
- Consumes: `GetInvoiceUseCase`, `CreateCheckoutSessionUseCase`, `HandleWebhookUseCase` from Task 4; `authMiddleware`, `JwtPayload` from `@carat-room/shared-auth`
- Produces: `buildPaymentRouter(useCases): Hono` — mounted in `main.ts`

**Important:** The Stripe webhook endpoint (`POST /api/payments/webhooks/stripe`) must NOT have `authMiddleware` — Stripe calls it directly. Signature verification inside `HandleWebhookUseCase` is the security boundary.

- [ ] **Step 1: Write the failing tests**

Create `apps/payment/src/presentation/payment-router.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { buildPaymentRouter } from './payment-router';
import { Invoice, InvoiceStatus } from '../domain/invoice';
import { GetInvoiceUseCase } from '../application/get-invoice-use-case';
import { CreateCheckoutSessionUseCase } from '../application/create-checkout-session-use-case';
import { HandleWebhookUseCase } from '../application/handle-webhook-use-case';

vi.mock('@carat-room/shared-auth', () => ({
  authMiddleware: () => async (
    c: { set: (k: string, v: unknown) => void },
    next: () => Promise<void>,
  ) => {
    c.set('jwtPayload', { sub: 'user-1', role: 'BUYER' });
    await next();
  },
}));

function buildInvoice(): Invoice {
  return new Invoice({
    id: 'inv-1',
    lotId: 'lot-1',
    winnerUserId: 'user-1',
    amount: 800.00,
    currency: 'AUD',
    status: InvoiceStatus.AwaitingPayment,
    stripeCheckoutId: null,
    stripePaymentIntent: null,
    dueAt: new Date('2026-06-23T00:00:00Z'),
    paidAt: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
  });
}

const mockGetInvoice = { execute: vi.fn() } as unknown as GetInvoiceUseCase;
const mockCreateCheckout = { execute: vi.fn() } as unknown as CreateCheckoutSessionUseCase;
const mockHandleWebhook = { execute: vi.fn() } as unknown as HandleWebhookUseCase;

let app: Hono;

beforeEach(() => {
  vi.clearAllMocks();
  app = new Hono().route('/', buildPaymentRouter({
    getInvoice: mockGetInvoice,
    createCheckoutSession: mockCreateCheckout,
    handleWebhook: mockHandleWebhook,
  }));
});

describe('GET /api/payments/invoices/:id', () => {
  it('should_return200WithInvoice_when_userOwnsIt', async () => {
    vi.mocked(mockGetInvoice.execute).mockResolvedValue(buildInvoice());

    const res = await app.request('/api/payments/invoices/inv-1');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { id: string } };
    expect(body.data.id).toBe('inv-1');
  });

  it('should_return404_when_invoiceNotFoundOrNotOwned', async () => {
    vi.mocked(mockGetInvoice.execute).mockResolvedValue(null);

    const res = await app.request('/api/payments/invoices/inv-1');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/payments/invoices/:id/checkout', () => {
  it('should_return200WithCheckoutUrl_when_successful', async () => {
    vi.mocked(mockCreateCheckout.execute).mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.com/test',
    });

    const res = await app.request('/api/payments/invoices/inv-1/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotTitle: 'Gold Ring' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { checkoutUrl: string } };
    expect(body.data.checkoutUrl).toBe('https://checkout.stripe.com/test');
  });

  it('should_return404_when_invoiceNotFound', async () => {
    vi.mocked(mockCreateCheckout.execute).mockResolvedValue(null);

    const res = await app.request('/api/payments/invoices/inv-1/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotTitle: 'Gold Ring' }),
    });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/payments/webhooks/stripe', () => {
  it('should_return200_when_webhookProcessedSuccessfully', async () => {
    vi.mocked(mockHandleWebhook.execute).mockResolvedValue(undefined);

    const res = await app.request('/api/payments/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_test' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });

  it('should_return400_when_webhookSignatureInvalid', async () => {
    vi.mocked(mockHandleWebhook.execute).mockRejectedValue(
      new Error('No signatures found matching'),
    );

    const res = await app.request('/api/payments/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'bad_sig' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/presentation/payment-router.test.ts
```

Expected: FAIL — `Cannot find module './payment-router'`

- [ ] **Step 3: Create `apps/payment/src/presentation/payment-router.ts`**

```typescript
import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '@carat-room/shared-auth';
import { GetInvoiceUseCase } from '../application/get-invoice-use-case';
import { CreateCheckoutSessionUseCase } from '../application/create-checkout-session-use-case';
import { HandleWebhookUseCase } from '../application/handle-webhook-use-case';

interface UseCases {
  getInvoice: Pick<GetInvoiceUseCase, 'execute'>;
  createCheckoutSession: Pick<CreateCheckoutSessionUseCase, 'execute'>;
  handleWebhook: Pick<HandleWebhookUseCase, 'execute'>;
}

export function buildPaymentRouter(useCases: UseCases): Hono {
  const router = new Hono();

  router.get('/api/payments/invoices/:id', authMiddleware(), async (c) => {
    const payload = c.get('jwtPayload') as JwtPayload;
    const invoice = await useCases.getInvoice.execute({
      invoiceId: c.req.param('id'),
      requestingUserId: payload.sub,
    });
    if (!invoice) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }, 404);
    }
    return c.json({ data: invoice });
  });

  router.post('/api/payments/invoices/:id/checkout', authMiddleware(), async (c) => {
    const payload = c.get('jwtPayload') as JwtPayload;
    const body = await c.req.json<{ lotTitle: string }>();
    const result = await useCases.createCheckoutSession.execute({
      invoiceId: c.req.param('id'),
      requestingUserId: payload.sub,
      lotTitle: body.lotTitle,
    });
    if (!result) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Invoice not found or not payable' } }, 404);
    }
    return c.json({ data: result });
  });

  router.post('/api/payments/webhooks/stripe', async (c) => {
    const rawBody = Buffer.from(await c.req.arrayBuffer());
    const signature = c.req.header('stripe-signature') ?? '';
    try {
      await useCases.handleWebhook.execute({ rawBody, signature });
      return c.json({ data: { received: true } });
    } catch {
      return c.json({ error: { code: 'WEBHOOK_ERROR', message: 'Invalid webhook signature' } }, 400);
    }
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/presentation/payment-router.test.ts
```

Expected: 5 passed

- [ ] **Step 5: Create `apps/payment/src/main.ts`**

```typescript
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { Worker } from 'bullmq';
import { createAmqpConnection, EventPublisher, EventSubscriber } from '@carat-room/shared-events';
import { createDb } from './infrastructure/db';
import { PostgresInvoiceRepository } from './infrastructure/postgres-invoice-repository';
import { StripeAdapter } from './infrastructure/stripe-adapter';
import { BullMQExpiryScheduler } from './infrastructure/bullmq-expiry-scheduler';
import { createPaymentEventPublisher } from './infrastructure/payment-event-publisher';
import { startAuctionClosedConsumer } from './infrastructure/auction-closed-consumer';
import { GetInvoiceUseCase } from './application/get-invoice-use-case';
import { CreateCheckoutSessionUseCase } from './application/create-checkout-session-use-case';
import { HandleWebhookUseCase } from './application/handle-webhook-use-case';
import { CreateInvoiceUseCase } from './application/create-invoice-use-case';
import { ExpireInvoiceUseCase } from './application/expire-invoice-use-case';
import { buildPaymentRouter } from './presentation/payment-router';

const PORT = Number(process.env['PORT'] ?? 3003);
const DATABASE_URL = process.env['DATABASE_URL']!;
const RABBITMQ_URL = process.env['RABBITMQ_URL']!;
const REDIS_HOST = process.env['REDIS_HOST'] ?? 'localhost';
const REDIS_PORT = Number(process.env['REDIS_PORT'] ?? 6379);
const STRIPE_SECRET_KEY = process.env['STRIPE_SECRET_KEY']!;
const STRIPE_WEBHOOK_SECRET = process.env['STRIPE_WEBHOOK_SECRET']!;
const FRONTEND_URL = process.env['FRONTEND_URL']!;
const PAYMENT_WINDOW_HOURS = Number(process.env['PAYMENT_WINDOW_HOURS'] ?? 72);

async function main(): Promise<void> {
  const db = createDb(DATABASE_URL);
  const invoiceRepository = new PostgresInvoiceRepository(db);
  const stripeAdapter = new StripeAdapter(STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET);
  const redis = { host: REDIS_HOST, port: REDIS_PORT };
  const expiryScheduler = new BullMQExpiryScheduler(redis);

  const amqp = await createAmqpConnection(RABBITMQ_URL);
  const eventPublisher = new EventPublisher(amqp);
  const publish = createPaymentEventPublisher(eventPublisher);

  const createInvoiceUseCase = new CreateInvoiceUseCase(
    invoiceRepository, expiryScheduler, publish, PAYMENT_WINDOW_HOURS,
  );
  const expireInvoiceUseCase = new ExpireInvoiceUseCase(invoiceRepository, publish);
  const getInvoiceUseCase = new GetInvoiceUseCase(invoiceRepository);
  const createCheckoutSessionUseCase = new CreateCheckoutSessionUseCase(
    invoiceRepository, stripeAdapter, FRONTEND_URL,
  );
  const handleWebhookUseCase = new HandleWebhookUseCase(
    invoiceRepository, stripeAdapter, publish, expiryScheduler,
  );

  const eventSubscriber = new EventSubscriber(amqp);
  await startAuctionClosedConsumer(eventSubscriber, createInvoiceUseCase);

  new Worker(
    'invoice-expiry',
    async (job) => {
      const { invoiceId } = job.data as { invoiceId: string };
      await expireInvoiceUseCase.execute({ invoiceId });
    },
    { connection: redis },
  );

  const app = new Hono();
  app.route('/', buildPaymentRouter({
    getInvoice: getInvoiceUseCase,
    createCheckoutSession: createCheckoutSessionUseCase,
    handleWebhook: handleWebhookUseCase,
  }));

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`Payment service running on port ${PORT}`);
  });
}

main();
```

- [ ] **Step 6: Run all tests**

```bash
npx vitest run
```

Expected: 26 passed

- [ ] **Step 7: Commit**

```bash
git add apps/payment/src/presentation/ apps/payment/src/main.ts
git commit -m "feat(payment): Hono router, main.ts, BullMQ expiry worker wired"
```

---

### Task 8: Frontend — Invoice Page

**Files:**
- Create: `apps/user-portal/src/app/account/invoices/[id]/page.tsx`
- Create: `apps/user-portal/src/app/account/invoices/[id]/InvoiceDetail.tsx`

**Interfaces:**
- Consumes: `GET /api/payments/invoices/:id` → `{ data: Invoice }`, `POST /api/payments/invoices/:id/checkout` → `{ data: { checkoutUrl: string } }`
- Produces: Invoice detail page — shows amount, status, due date, and a Pay Now button that redirects to Stripe Checkout. On return from Stripe with `?payment=success`, shows a confirmation banner.

**Note:** `page.tsx` is a Next.js App Router Server Component. `InvoiceDetail.tsx` is a Client Component (`'use client'`) — it handles the interactive Pay Now button. Access token is read from the `access_token` cookie by the server component and forwarded as a Bearer token to the Payment Service.

- [ ] **Step 1: Create `apps/user-portal/src/app/account/invoices/[id]/page.tsx`**

```typescript
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { InvoiceDetail } from './InvoiceDetail';

interface Invoice {
  id: string;
  lotId: string;
  amount: number;
  currency: string;
  status: 'AWAITING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  dueAt: string;
  paidAt: string | null;
  createdAt: string;
}

async function getInvoice(id: string): Promise<Invoice | null> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('access_token')?.value;
  if (!accessToken) {
    return null;
  }

  const res = await fetch(
    `${process.env['PAYMENT_SERVICE_URL']}/api/payments/invoices/${id}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    return null;
  }

  const body = await res.json() as { data: Invoice };
  return body.data;
}

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { payment?: string };
}) {
  const invoice = await getInvoice(params.id);

  if (!invoice) {
    redirect('/account/login');
  }

  const paymentSuccess = searchParams.payment === 'success';

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Invoice</h1>
      <InvoiceDetail invoice={invoice} paymentSuccess={paymentSuccess} />
    </main>
  );
}
```

- [ ] **Step 2: Create `apps/user-portal/src/app/account/invoices/[id]/InvoiceDetail.tsx`**

```typescript
'use client';

import { useState } from 'react';

interface Invoice {
  id: string;
  lotId: string;
  amount: number;
  currency: string;
  status: 'AWAITING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  dueAt: string;
  paidAt: string | null;
}

interface Props {
  invoice: Invoice;
  paymentSuccess: boolean;
}

const STATUS_LABELS: Record<Invoice['status'], string> = {
  AWAITING_PAYMENT: 'Awaiting Payment',
  PAID: 'Paid',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

const STATUS_COLOURS: Record<Invoice['status'], string> = {
  AWAITING_PAYMENT: 'text-yellow-600',
  PAID: 'text-green-600',
  EXPIRED: 'text-red-600',
  CANCELLED: 'text-gray-500',
};

export function InvoiceDetail({ invoice, paymentSuccess }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formattedAmount = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: invoice.currency,
  }).format(invoice.amount);

  const formattedDueAt = new Intl.DateTimeFormat('en', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(invoice.dueAt));

  async function handlePayNow() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/invoices/${invoice.id}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotTitle: `Lot ${invoice.lotId}` }),
      });
      if (!res.ok) {
        setError('Unable to create checkout session. Please try again.');
        return;
      }
      const body = await res.json() as { data: { checkoutUrl: string } };
      window.location.href = body.data.checkoutUrl;
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {paymentSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium">Payment confirmed. Thank you!</p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Status</span>
          <span className={`font-medium ${STATUS_COLOURS[invoice.status]}`}>
            {STATUS_LABELS[invoice.status]}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-600">Amount Due</span>
          <span className="text-xl font-semibold">{formattedAmount}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-600">Payment Due By</span>
          <span>{formattedDueAt}</span>
        </div>

        {invoice.paidAt && (
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Paid At</span>
            <span>
              {new Intl.DateTimeFormat('en', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(invoice.paidAt))}
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}

      {invoice.status === 'AWAITING_PAYMENT' && !paymentSuccess && (
        <button
          onClick={handlePayNow}
          disabled={isLoading}
          className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Redirecting to payment...' : 'Pay Now'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/user-portal/src/app/account/invoices/
git commit -m "feat(payment): invoice detail page with Stripe Checkout redirect"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| `invoices` + `payment_events` tables | Task 1 |
| `AWAITING_PAYMENT → PAID → EXPIRED` lifecycle | Tasks 2, 4 |
| Stripe Checkout hosted page — no card data through service | Tasks 4, 5 |
| Webhook signature verified before processing | Tasks 4, 5 |
| `payment_events.stripe_event_id` unique — idempotency | Task 3 |
| 3-day window via BullMQ delayed job | Tasks 4, 5 |
| Consumes `AuctionClosed` (winner + reserve met only) | Task 6 |
| Publishes `InvoiceCreated`, `PaymentReceived`, `InvoiceExpired` | Tasks 4, 6 |
| `GET /api/payments/invoices/:id` — own only | Task 7 |
| `POST /api/payments/invoices/:id/checkout` | Task 7 |
| `POST /api/payments/webhooks/stripe` — no auth, signature check | Task 7 |
| Frontend: invoice detail + Pay Now → Stripe Checkout | Task 8 |
| Frontend: payment confirmation on `?payment=success` return | Task 8 |

**Total tests: 26** (4 domain + 5 repository + 8 use cases + 4 adapters + 5 routes)

No placeholders. `InvoiceStatus` enum used consistently throughout. `StripeClient` and `ExpiryScheduler` interfaces defined in Task 4 before use in Tasks 5–7.
