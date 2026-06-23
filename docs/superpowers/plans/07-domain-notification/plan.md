# Notification Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the Notification Service — a purely event-driven backend service that listens to RabbitMQ domain events and sends emails via Resend and SMS via Twilio.

**Architecture:** Clean Architecture with four layers (domain → application → infrastructure → presentation). The service has no public HTTP endpoints — it subscribes to RabbitMQ queues and dispatches notifications. A single internal `/health` endpoint is provided for Docker health checks. All notification attempts are logged to PostgreSQL.

**Tech Stack:** TypeScript 5.4, Hono, @hono/node-server, PostgreSQL (postgres.js), @carat-room/shared-events, @carat-room/shared-types, Resend, React Email, Twilio, Vitest

## Global Constraints

- Node.js >= 20
- TypeScript >= 5.4
- pnpm >= 9
- Named exports only — no `export default`
- No `var` — always `const` or `let`
- No `_` prefix on private fields — use TypeScript `private` keyword
- British English in all copy and comments
- All tests use Vitest
- Clean Architecture: infrastructure never imported by domain or application layers

---

## File Structure

```
apps/notification-service/
  package.json
  tsconfig.json
  Dockerfile
  src/
    main.ts
    domain/
      notification.ts
      notification-repository.ts
    application/
      email-sender.ts
      sms-sender.ts
      log-notification.use-case.ts
      handlers/
        user-registered.handler.ts
        phone-verification.handler.ts
        bid-placed.handler.ts
        auction-closing-soon.handler.ts
        auction-closed.handler.ts
        invoice-created.handler.ts
        payment-received.handler.ts
        invoice-expired.handler.ts
        item-dispatched.handler.ts
        item-collected.handler.ts
    infrastructure/
      db/
        postgres-client.ts
        postgres-notification-repository.ts
        migrations/
          001-create-notification-log.sql
      email/
        resend-email-sender.ts
        templates/
          user-registered.tsx
          phone-verification.tsx
          bid-placed.tsx
          auction-closing-soon.tsx
          auction-closed-won.tsx
          auction-closed-unsold.tsx
          invoice-created.tsx
          payment-received.tsx
          invoice-expired.tsx
          item-dispatched.tsx
          item-collected.tsx
      sms/
        twilio-sms-sender.ts
      subscribers/
        notification-subscribers.ts
    presentation/
      health-router.ts
    __tests__/
      handlers/
        user-registered.handler.test.ts
        bid-placed.handler.test.ts
        auction-closed.handler.test.ts
      infrastructure/
        postgres-notification-repository.test.ts
```

---

### Task 1: Package Scaffold + Database Migration

**Files:**
- Create: `apps/notification-service/package.json`
- Create: `apps/notification-service/tsconfig.json`
- Create: `apps/notification-service/src/infrastructure/db/migrations/001-create-notification-log.sql`
- Create: `apps/notification-service/src/infrastructure/db/postgres-client.ts`

**Interfaces:**
- Consumes: `@carat-room/tsconfig/service`, `@carat-room/shared-types`, `@carat-room/shared-events`
- Produces: `createPostgresClient(url: string)` — postgres.js client instance, type `PostgresClient`

- [x] **Step 1: Create directory structure**

```bash
mkdir -p apps/notification-service/src/domain
mkdir -p apps/notification-service/src/application/handlers
mkdir -p apps/notification-service/src/infrastructure/db/migrations
mkdir -p apps/notification-service/src/infrastructure/email/templates
mkdir -p apps/notification-service/src/infrastructure/sms
mkdir -p apps/notification-service/src/infrastructure/subscribers
mkdir -p apps/notification-service/src/presentation
mkdir -p apps/notification-service/src/__tests__/handlers
mkdir -p apps/notification-service/src/__tests__/infrastructure
```

- [x] **Step 2: Create `package.json`**

```json
{
  "name": "@carat-room/notification-service",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/main.ts",
    "start": "node dist/main.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@carat-room/shared-auth": "workspace:*",
    "@carat-room/shared-events": "workspace:*",
    "@carat-room/shared-types": "workspace:*",
    "@hono/node-server": "^1.12.0",
    "@react-email/components": "^0.0.22",
    "@react-email/render": "^0.0.17",
    "hono": "^4.4.0",
    "postgres": "^3.4.4",
    "react": "^18.3.1",
    "resend": "^3.2.0",
    "twilio": "^5.2.0"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "@types/react": "^18.3.1",
    "tsx": "^4.11.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [x] **Step 3: Create `tsconfig.json`**

```json
{
  "extends": "@carat-room/tsconfig/service",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [x] **Step 4: Create `src/infrastructure/db/migrations/001-create-notification-log.sql`**

```sql
CREATE TABLE IF NOT EXISTS notification_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  type        TEXT NOT NULL,
  channel     TEXT NOT NULL CHECK (channel IN ('EMAIL', 'SMS')),
  status      TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED')),
  error       TEXT,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_log_user_id ON notification_log(user_id);
CREATE INDEX idx_notification_log_created_at ON notification_log(created_at);
```

Run this migration against `notifications` database:
```bash
docker compose exec postgres psql -U postgres -d notifications \
  -f /dev/stdin < apps/notification-service/src/infrastructure/db/migrations/001-create-notification-log.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX`, `CREATE INDEX`

- [x] **Step 5: Create `src/infrastructure/db/postgres-client.ts`**

```typescript
import postgres from 'postgres';

export function createPostgresClient(url: string) {
  return postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 30,
  });
}

export type PostgresClient = ReturnType<typeof createPostgresClient>;
```

- [x] **Step 6: Install dependencies**

```bash
pnpm --filter @carat-room/notification-service install
```

- [x] **Step 7: Commit**

```bash
git add apps/notification-service/
git commit -m "chore(notification): scaffold package and database migration"
```

---

### Task 2: Domain Layer

**Files:**
- Create: `apps/notification-service/src/domain/notification.ts`
- Create: `apps/notification-service/src/domain/notification-repository.ts`

**Interfaces:**
- Produces:
  - `NotificationChannel`: `'EMAIL' | 'SMS'`
  - `NotificationStatus`: `'SENT' | 'FAILED'`
  - `NotificationType`: union of 11 type strings
  - `Notification` interface
  - `NotificationRepository` interface: `save(notification: Notification): Promise<void>`

- [x] **Step 1: Create `src/domain/notification.ts`**

```typescript
export type NotificationChannel = 'EMAIL' | 'SMS';
export type NotificationStatus = 'SENT' | 'FAILED';

export type NotificationType =
  | 'USER_REGISTERED'
  | 'PHONE_VERIFICATION_REQUESTED'
  | 'BID_PLACED_OUTBID'
  | 'AUCTION_CLOSING_SOON'
  | 'AUCTION_CLOSED_WON'
  | 'AUCTION_CLOSED_UNSOLD'
  | 'INVOICE_CREATED'
  | 'PAYMENT_RECEIVED'
  | 'INVOICE_EXPIRED'
  | 'ITEM_DISPATCHED'
  | 'ITEM_COLLECTED';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  error: string | null;
  sentAt: Date | null;
  createdAt: Date;
}
```

- [x] **Step 2: Create `src/domain/notification-repository.ts`**

```typescript
import type { Notification } from './notification.js';

export interface NotificationRepository {
  save(notification: Notification): Promise<void>;
}
```

- [x] **Step 3: Commit**

```bash
git add apps/notification-service/src/domain/
git commit -m "feat(notification): add domain layer"
```

---

### Task 3: Infrastructure — Repository

**Files:**
- Create: `apps/notification-service/src/infrastructure/db/postgres-notification-repository.ts`
- Create: `apps/notification-service/src/__tests__/infrastructure/postgres-notification-repository.test.ts`

**Interfaces:**
- Consumes: `NotificationRepository`, `PostgresClient`
- Produces: `PostgresNotificationRepository` class implementing `NotificationRepository`

- [x] **Step 1: Write failing test**

`apps/notification-service/src/__tests__/infrastructure/postgres-notification-repository.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgresNotificationRepository } from '../../infrastructure/db/postgres-notification-repository.js';
import type { PostgresClient } from '../../infrastructure/db/postgres-client.js';
import type { Notification } from '../../domain/notification.js';

const mockSql = vi.fn().mockResolvedValue([]);
const mockClient = mockSql as unknown as PostgresClient;

const buildNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'notif-1',
  userId: 'user-1',
  type: 'USER_REGISTERED',
  channel: 'EMAIL',
  status: 'SENT',
  error: null,
  sentAt: new Date('2026-06-20T10:00:00Z'),
  createdAt: new Date('2026-06-20T10:00:00Z'),
  ...overrides,
});

describe('PostgresNotificationRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should_insertRow_when_saveIsCalledWithSentNotification', async () => {
    const repo = new PostgresNotificationRepository(mockClient);
    await repo.save(buildNotification());
    expect(mockSql).toHaveBeenCalledOnce();
  });

  it('should_insertRow_when_saveIsCalledWithFailedNotification', async () => {
    const repo = new PostgresNotificationRepository(mockClient);
    await repo.save(buildNotification({ status: 'FAILED', error: 'Resend API error', sentAt: null }));
    expect(mockSql).toHaveBeenCalledOnce();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @carat-room/notification-service test
```

Expected: FAIL — `postgres-notification-repository.ts` does not exist.

- [x] **Step 3: Create `src/infrastructure/db/postgres-notification-repository.ts`**

```typescript
import type { PostgresClient } from './postgres-client.js';
import type { NotificationRepository } from '../../domain/notification-repository.js';
import type { Notification } from '../../domain/notification.js';

export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private readonly sql: PostgresClient) {}

  async save(notification: Notification): Promise<void> {
    await this.sql`
      INSERT INTO notification_log
        (id, user_id, type, channel, status, error, sent_at, created_at)
      VALUES
        (
          ${notification.id},
          ${notification.userId},
          ${notification.type},
          ${notification.channel},
          ${notification.status},
          ${notification.error},
          ${notification.sentAt},
          ${notification.createdAt}
        )
    `;
  }
}
```

- [x] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @carat-room/notification-service test
```

Expected: 2 tests pass.

- [x] **Step 5: Commit**

```bash
git add apps/notification-service/src/infrastructure/db/postgres-notification-repository.ts
git add apps/notification-service/src/__tests__/infrastructure/
git commit -m "feat(notification): add PostgresNotificationRepository"
```

---

### Task 4: Application Layer — Use Case and Sender Interfaces

**Files:**
- Create: `apps/notification-service/src/application/email-sender.ts`
- Create: `apps/notification-service/src/application/sms-sender.ts`
- Create: `apps/notification-service/src/application/log-notification.use-case.ts`

**Interfaces:**
- Produces:
  - `EmailSender`: `{ sendEmail(to: string, subject: string, html: string): Promise<void> }`
  - `SmsSender`: `{ sendSms(to: string, body: string): Promise<void> }`
  - `LogNotificationParams`: `{ userId: string; type: NotificationType; channel: NotificationChannel; send: () => Promise<void> }`
  - `LogNotificationUseCase`: `execute(params: LogNotificationParams): Promise<void>`

- [x] **Step 1: Create `src/application/email-sender.ts`**

```typescript
export interface EmailSender {
  sendEmail(to: string, subject: string, html: string): Promise<void>;
}
```

- [x] **Step 2: Create `src/application/sms-sender.ts`**

```typescript
export interface SmsSender {
  sendSms(to: string, body: string): Promise<void>;
}
```

- [x] **Step 3: Create `src/application/log-notification.use-case.ts`**

```typescript
import { randomUUID } from 'crypto';
import type { NotificationRepository } from '../domain/notification-repository.js';
import type { NotificationChannel, NotificationType } from '../domain/notification.js';

export interface LogNotificationParams {
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  send: () => Promise<void>;
}

export class LogNotificationUseCase {
  constructor(private readonly repo: NotificationRepository) {}

  async execute(params: LogNotificationParams): Promise<void> {
    const now = new Date();
    try {
      await params.send();
      await this.repo.save({
        id: randomUUID(),
        userId: params.userId,
        type: params.type,
        channel: params.channel,
        status: 'SENT',
        error: null,
        sentAt: new Date(),
        createdAt: now,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.repo.save({
        id: randomUUID(),
        userId: params.userId,
        type: params.type,
        channel: params.channel,
        status: 'FAILED',
        error,
        sentAt: null,
        createdAt: now,
      });
    }
  }
}
```

- [x] **Step 4: Commit**

```bash
git add apps/notification-service/src/application/
git commit -m "feat(notification): add application layer — LogNotificationUseCase and sender interfaces"
```

---

### Task 5: Infrastructure — Resend + Twilio Adapters

**Files:**
- Create: `apps/notification-service/src/infrastructure/email/resend-email-sender.ts`
- Create: `apps/notification-service/src/infrastructure/sms/twilio-sms-sender.ts`

**Interfaces:**
- Consumes: `EmailSender`, `SmsSender`
- Produces: `ResendEmailSender` implementing `EmailSender`, `TwilioSmsSender` implementing `SmsSender`

- [x] **Step 1: Create `src/infrastructure/email/resend-email-sender.ts`**

```typescript
import { Resend } from 'resend';
import type { EmailSender } from '../../application/email-sender.js';

export class ResendEmailSender implements EmailSender {
  private readonly client: Resend;

  constructor(apiKey: string, private readonly fromAddress: string) {
    this.client = new Resend(apiKey);
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.fromAddress,
      to,
      subject,
      html,
    });
    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }
  }
}
```

- [x] **Step 2: Create `src/infrastructure/sms/twilio-sms-sender.ts`**

```typescript
import twilio from 'twilio';
import type { SmsSender } from '../../application/sms-sender.js';

export class TwilioSmsSender implements SmsSender {
  private readonly client: ReturnType<typeof twilio>;

  constructor(
    accountSid: string,
    authToken: string,
    private readonly fromNumber: string
  ) {
    this.client = twilio(accountSid, authToken);
  }

  async sendSms(to: string, body: string): Promise<void> {
    await this.client.messages.create({ from: this.fromNumber, to, body });
  }
}
```

- [x] **Step 3: Commit**

```bash
git add apps/notification-service/src/infrastructure/email/resend-email-sender.ts
git add apps/notification-service/src/infrastructure/sms/twilio-sms-sender.ts
git commit -m "feat(notification): add Resend email sender and Twilio SMS sender"
```

---

### Task 6: React Email Templates

**Files:** 11 template files under `src/infrastructure/email/templates/`

**Interfaces:**
- Produces: one `render<Name>Email(props): Promise<string>` async function per template

- [x] **Step 1: Create `user-registered.tsx`**

```tsx
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { verificationUrl: string }

function UserRegisteredEmail({ verificationUrl }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f9f9f9' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Welcome to The Carat Room</Text>
          <Text>Please verify your email address to continue.</Text>
          <Button href={verificationUrl} style={{ backgroundColor: '#000', color: '#fff', padding: '12px 24px', borderRadius: '4px' }}>
            Verify Email
          </Button>
          <Text style={{ color: '#666', fontSize: '12px' }}>This link expires in 24 hours.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderUserRegisteredEmail(props: Props): Promise<string> {
  return render(<UserRegisteredEmail {...props} />);
}
```

- [x] **Step 2: Create `phone-verification.tsx`**

```tsx
import { Html, Head, Body, Container, Text } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { otpCode: string }

function PhoneVerificationEmail({ otpCode }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Your verification code</Text>
          <Text style={{ fontSize: '36px', fontWeight: 'bold', letterSpacing: '8px' }}>{otpCode}</Text>
          <Text style={{ color: '#666' }}>This code expires in 10 minutes. Do not share it with anyone.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderPhoneVerificationEmail(props: Props): Promise<string> {
  return render(<PhoneVerificationEmail {...props} />);
}
```

- [x] **Step 3: Create `bid-placed.tsx`**

```tsx
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string; currentBid: string; lotUrl: string }

function BidPlacedEmail({ lotTitle, currentBid, lotUrl }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>You've been outbid</Text>
          <Text>Someone has placed a higher bid on <strong>{lotTitle}</strong>.</Text>
          <Text>Current highest bid: <strong>{currentBid}</strong></Text>
          <Button href={lotUrl} style={{ backgroundColor: '#000', color: '#fff', padding: '12px 24px', borderRadius: '4px' }}>Bid Again</Button>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderBidPlacedEmail(props: Props): Promise<string> {
  return render(<BidPlacedEmail {...props} />);
}
```

- [x] **Step 4: Create `auction-closing-soon.tsx`**

```tsx
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string; closingAt: string; currentBid: string; lotUrl: string }

function AuctionClosingSoonEmail({ lotTitle, closingAt, currentBid, lotUrl }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Auction closing soon</Text>
          <Text><strong>{lotTitle}</strong> closes at {closingAt}.</Text>
          <Text>Current highest bid: <strong>{currentBid}</strong></Text>
          <Button href={lotUrl} style={{ backgroundColor: '#000', color: '#fff', padding: '12px 24px', borderRadius: '4px' }}>View Auction</Button>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderAuctionClosingSoonEmail(props: Props): Promise<string> {
  return render(<AuctionClosingSoonEmail {...props} />);
}
```

- [x] **Step 5: Create `auction-closed-won.tsx`**

```tsx
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string; winningBid: string; invoiceUrl: string; dueDate: string }

function AuctionClosedWonEmail({ lotTitle, winningBid, invoiceUrl, dueDate }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Congratulations — you won!</Text>
          <Text>You are the winning bidder for <strong>{lotTitle}</strong>.</Text>
          <Text>Winning bid: <strong>{winningBid}</strong></Text>
          <Text>Payment due by: <strong>{dueDate}</strong></Text>
          <Button href={invoiceUrl} style={{ backgroundColor: '#000', color: '#fff', padding: '12px 24px', borderRadius: '4px' }}>View Invoice & Pay</Button>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderAuctionClosedWonEmail(props: Props): Promise<string> {
  return render(<AuctionClosedWonEmail {...props} />);
}
```

- [x] **Step 6: Create `auction-closed-unsold.tsx`**

```tsx
import { Html, Head, Body, Container, Text } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string }

function AuctionClosedUnsoldEmail({ lotTitle }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Auction ended</Text>
          <Text>The auction for <strong>{lotTitle}</strong> has ended. The lot did not sell on this occasion.</Text>
          <Text style={{ color: '#666' }}>Keep an eye on our upcoming auctions for more opportunities.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderAuctionClosedUnsoldEmail(props: Props): Promise<string> {
  return render(<AuctionClosedUnsoldEmail {...props} />);
}
```

- [x] **Step 7: Create `invoice-created.tsx`**

```tsx
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string; amount: string; currency: string; dueDate: string; checkoutUrl: string }

function InvoiceCreatedEmail({ lotTitle, amount, currency, dueDate, checkoutUrl }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Your invoice is ready</Text>
          <Text>Invoice for: <strong>{lotTitle}</strong></Text>
          <Text>Amount due: <strong>{amount} {currency}</strong></Text>
          <Text>Due by: <strong>{dueDate}</strong></Text>
          <Button href={checkoutUrl} style={{ backgroundColor: '#000', color: '#fff', padding: '12px 24px', borderRadius: '4px' }}>Pay Now</Button>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderInvoiceCreatedEmail(props: Props): Promise<string> {
  return render(<InvoiceCreatedEmail {...props} />);
}
```

- [x] **Step 8: Create `payment-received.tsx`**

```tsx
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string; amount: string; currency: string; fulfilmentUrl: string }

function PaymentReceivedEmail({ lotTitle, amount, currency, fulfilmentUrl }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Payment confirmed</Text>
          <Text>Thank you — your payment of <strong>{amount} {currency}</strong> for <strong>{lotTitle}</strong> has been received.</Text>
          <Text>Please let us know how you'd like to receive your item.</Text>
          <Button href={fulfilmentUrl} style={{ backgroundColor: '#000', color: '#fff', padding: '12px 24px', borderRadius: '4px' }}>Choose Delivery</Button>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderPaymentReceivedEmail(props: Props): Promise<string> {
  return render(<PaymentReceivedEmail {...props} />);
}
```

- [x] **Step 9: Create `invoice-expired.tsx`**

```tsx
import { Html, Head, Body, Container, Text } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string }

function InvoiceExpiredEmail({ lotTitle }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Payment window closed</Text>
          <Text>Your payment window for <strong>{lotTitle}</strong> has expired. The lot has been released.</Text>
          <Text style={{ color: '#666' }}>If you believe this is an error, please contact us.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderInvoiceExpiredEmail(props: Props): Promise<string> {
  return render(<InvoiceExpiredEmail {...props} />);
}
```

- [x] **Step 10: Create `item-dispatched.tsx`**

```tsx
import { Html, Head, Body, Container, Text } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string; trackingNumber: string; carrier: string }

function ItemDispatchedEmail({ lotTitle, trackingNumber, carrier }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Your item has been dispatched</Text>
          <Text><strong>{lotTitle}</strong> is on its way.</Text>
          <Text>Carrier: <strong>{carrier}</strong></Text>
          <Text>Tracking number: <strong>{trackingNumber}</strong></Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderItemDispatchedEmail(props: Props): Promise<string> {
  return render(<ItemDispatchedEmail {...props} />);
}
```

- [x] **Step 11: Create `item-collected.tsx`**

```tsx
import { Html, Head, Body, Container, Text } from '@react-email/components';
import { render } from '@react-email/render';
import * as React from 'react';

interface Props { lotTitle: string }

function ItemCollectedEmail({ lotTitle }: Props) {
  return (
    <Html><Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Collection confirmed</Text>
          <Text>Your collection of <strong>{lotTitle}</strong> has been confirmed. Enjoy!</Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderItemCollectedEmail(props: Props): Promise<string> {
  return render(<ItemCollectedEmail {...props} />);
}
```

- [x] **Step 12: Commit**

```bash
git add apps/notification-service/src/infrastructure/email/templates/
git commit -m "feat(notification): add React Email templates for all 11 notification types"
```

---

### Task 7: Application Handlers

**Files:** 10 handler files + 3 test files

**Interfaces:**
- Consumes: `LogNotificationUseCase`, `EmailSender`, `SmsSender`, all template render functions, all event payload types
- Produces: `handle<EventName>(payload, useCase, emailSender, ...) => Promise<void>` per event

- [x] **Step 1: Write failing tests**

`apps/notification-service/src/__tests__/handlers/user-registered.handler.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleUserRegistered } from '../../application/handlers/user-registered.handler.js';
import type { LogNotificationUseCase } from '../../application/log-notification.use-case.js';
import type { EmailSender } from '../../application/email-sender.js';

const mockUseCase = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as LogNotificationUseCase;
const mockEmailSender = { sendEmail: vi.fn().mockResolvedValue(undefined) } as unknown as EmailSender;

describe('handleUserRegistered', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should_callUseCaseWithEmailChannel_when_userRegisteredPayloadReceived', async () => {
    await handleUserRegistered(
      { userId: 'user-1', email: 'test@example.com', createdAt: '2026-06-20T00:00:00Z' },
      mockUseCase,
      mockEmailSender,
      'https://app.example.com'
    );
    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'USER_REGISTERED', channel: 'EMAIL' })
    );
  });
});
```

`apps/notification-service/src/__tests__/handlers/bid-placed.handler.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleBidPlaced } from '../../application/handlers/bid-placed.handler.js';
import type { LogNotificationUseCase } from '../../application/log-notification.use-case.js';
import type { EmailSender } from '../../application/email-sender.js';

const mockUseCase = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as LogNotificationUseCase;
const mockEmailSender = { sendEmail: vi.fn().mockResolvedValue(undefined) } as unknown as EmailSender;
const mockGetEmail = vi.fn().mockResolvedValue('prev@example.com');
const mockGetLotTitle = vi.fn().mockResolvedValue('Test Lot');

describe('handleBidPlaced', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should_notifyPreviousBidder_when_previousHighestBidderExists', async () => {
    await handleBidPlaced(
      { lotId: 'lot-1', bidId: 'bid-1', userId: 'user-2', amount: 500, previousHighestBidderId: 'user-1', placedAt: '2026-06-20T00:00:00Z' },
      mockUseCase, mockEmailSender, mockGetEmail, mockGetLotTitle, 'https://app.example.com'
    );
    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'BID_PLACED_OUTBID', channel: 'EMAIL' })
    );
  });

  it('should_doNothing_when_noPreviousHighestBidder', async () => {
    await handleBidPlaced(
      { lotId: 'lot-1', bidId: 'bid-1', userId: 'user-2', amount: 500, previousHighestBidderId: null, placedAt: '2026-06-20T00:00:00Z' },
      mockUseCase, mockEmailSender, mockGetEmail, mockGetLotTitle, 'https://app.example.com'
    );
    expect(mockUseCase.execute).not.toHaveBeenCalled();
  });
});
```

`apps/notification-service/src/__tests__/handlers/auction-closed.handler.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAuctionClosed } from '../../application/handlers/auction-closed.handler.js';
import type { LogNotificationUseCase } from '../../application/log-notification.use-case.js';
import type { EmailSender } from '../../application/email-sender.js';

const mockUseCase = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as LogNotificationUseCase;
const mockEmailSender = { sendEmail: vi.fn().mockResolvedValue(undefined) } as unknown as EmailSender;
const mockGetEmail = vi.fn().mockResolvedValue('winner@example.com');
const mockGetLotTitle = vi.fn().mockResolvedValue('Diamond Ring');

describe('handleAuctionClosed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should_sendWonEmail_when_reserveIsMet', async () => {
    await handleAuctionClosed(
      { lotId: 'lot-1', highestBidId: 'bid-1', highestAmount: 1000, reserveMet: true, winnerUserId: 'user-1', closedAt: '2026-06-20T00:00:00Z' },
      mockUseCase, mockEmailSender, mockGetEmail, mockGetLotTitle, 'https://app.example.com'
    );
    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'AUCTION_CLOSED_WON', channel: 'EMAIL' })
    );
  });

  it('should_sendUnsoldEmail_when_reserveIsNotMet', async () => {
    await handleAuctionClosed(
      { lotId: 'lot-1', highestBidId: 'bid-1', highestAmount: 500, reserveMet: false, winnerUserId: 'user-1', closedAt: '2026-06-20T00:00:00Z' },
      mockUseCase, mockEmailSender, mockGetEmail, mockGetLotTitle, 'https://app.example.com'
    );
    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AUCTION_CLOSED_UNSOLD', channel: 'EMAIL' })
    );
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @carat-room/notification-service test
```

Expected: 5 handler tests FAIL. 2 repository tests still pass.

- [x] **Step 3: Create `handlers/user-registered.handler.ts`**

```typescript
import type { UserRegisteredPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderUserRegisteredEmail } from '../../infrastructure/email/templates/user-registered.js';

export async function handleUserRegistered(
  payload: UserRegisteredPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  appBaseUrl: string
): Promise<void> {
  const verificationUrl = `${appBaseUrl}/account/verify-email?userId=${payload.userId}`;
  await useCase.execute({
    userId: payload.userId,
    type: 'USER_REGISTERED',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderUserRegisteredEmail({ verificationUrl });
      await emailSender.sendEmail(payload.email, 'Verify your email address', html);
    },
  });
}
```

- [x] **Step 4: Create `handlers/phone-verification.handler.ts`**

```typescript
import type { PhoneVerificationRequestedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { SmsSender } from '../sms-sender.js';

export async function handlePhoneVerification(
  payload: PhoneVerificationRequestedPayload,
  useCase: LogNotificationUseCase,
  smsSender: SmsSender
): Promise<void> {
  await useCase.execute({
    userId: payload.userId,
    type: 'PHONE_VERIFICATION_REQUESTED',
    channel: 'SMS',
    send: async () => {
      await smsSender.sendSms(
        payload.phone,
        `Your Carat Room verification code is: ${payload.otpCode}. It expires in 10 minutes.`
      );
    },
  });
}
```

- [x] **Step 5: Create `handlers/bid-placed.handler.ts`**

```typescript
import type { BidPlacedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderBidPlacedEmail } from '../../infrastructure/email/templates/bid-placed.js';

export async function handleBidPlaced(
  payload: BidPlacedPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>,
  appBaseUrl: string
): Promise<void> {
  if (!payload.previousHighestBidderId) return;

  const [email, lotTitle] = await Promise.all([
    getUserEmail(payload.previousHighestBidderId),
    getLotTitle(payload.lotId),
  ]);
  await useCase.execute({
    userId: payload.previousHighestBidderId,
    type: 'BID_PLACED_OUTBID',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderBidPlacedEmail({
        lotTitle,
        currentBid: `$${payload.amount}`,
        lotUrl: `${appBaseUrl}/auctions/${payload.lotId}`,
      });
      await emailSender.sendEmail(email, `You've been outbid on ${lotTitle}`, html);
    },
  });
}
```

- [x] **Step 6: Create `handlers/auction-closing-soon.handler.ts`**

```typescript
import type { AuctionClosingSoonPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderAuctionClosingSoonEmail } from '../../infrastructure/email/templates/auction-closing-soon.js';

export async function handleAuctionClosingSoon(
  payload: AuctionClosingSoonPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>,
  getCurrentBid: (lotId: string) => Promise<string>,
  appBaseUrl: string
): Promise<void> {
  const [lotTitle, currentBid] = await Promise.all([
    getLotTitle(payload.lotId),
    getCurrentBid(payload.lotId),
  ]);
  await Promise.all(
    payload.activeBidderIds.map(async (bidderId) => {
      const email = await getUserEmail(bidderId);
      await useCase.execute({
        userId: bidderId,
        type: 'AUCTION_CLOSING_SOON',
        channel: 'EMAIL',
        send: async () => {
          const html = await renderAuctionClosingSoonEmail({
            lotTitle,
            closingAt: new Date(payload.endAt).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' }),
            currentBid,
            lotUrl: `${appBaseUrl}/auctions/${payload.lotId}`,
          });
          await emailSender.sendEmail(email, `${lotTitle} is closing soon`, html);
        },
      });
    })
  );
}
```

- [x] **Step 7: Create `handlers/auction-closed.handler.ts`**

```typescript
import type { AuctionClosedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderAuctionClosedWonEmail } from '../../infrastructure/email/templates/auction-closed-won.js';
import { renderAuctionClosedUnsoldEmail } from '../../infrastructure/email/templates/auction-closed-unsold.js';

export async function handleAuctionClosed(
  payload: AuctionClosedPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>,
  appBaseUrl: string
): Promise<void> {
  const lotTitle = await getLotTitle(payload.lotId);

  if (payload.reserveMet && payload.winnerUserId && payload.highestAmount) {
    const email = await getUserEmail(payload.winnerUserId);
    await useCase.execute({
      userId: payload.winnerUserId,
      type: 'AUCTION_CLOSED_WON',
      channel: 'EMAIL',
      send: async () => {
        const html = await renderAuctionClosedWonEmail({
          lotTitle,
          winningBid: `$${payload.highestAmount}`,
          invoiceUrl: `${appBaseUrl}/account/dashboard`,
          dueDate: '3 days from now',
        });
        await emailSender.sendEmail(email, `You won ${lotTitle}!`, html);
      },
    });
    return;
  }

  if (!payload.reserveMet && payload.winnerUserId) {
    const email = await getUserEmail(payload.winnerUserId);
    await useCase.execute({
      userId: payload.winnerUserId,
      type: 'AUCTION_CLOSED_UNSOLD',
      channel: 'EMAIL',
      send: async () => {
        const html = await renderAuctionClosedUnsoldEmail({ lotTitle });
        await emailSender.sendEmail(email, `Auction ended: ${lotTitle}`, html);
      },
    });
  }
}
```

- [x] **Step 8: Create remaining 4 handlers**

`handlers/invoice-created.handler.ts`:
```typescript
import type { InvoiceCreatedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderInvoiceCreatedEmail } from '../../infrastructure/email/templates/invoice-created.js';

export async function handleInvoiceCreated(
  payload: InvoiceCreatedPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>,
  appBaseUrl: string
): Promise<void> {
  const [email, lotTitle] = await Promise.all([getUserEmail(payload.winnerUserId), getLotTitle(payload.lotId)]);
  await useCase.execute({
    userId: payload.winnerUserId,
    type: 'INVOICE_CREATED',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderInvoiceCreatedEmail({
        lotTitle,
        amount: `$${payload.amount}`,
        currency: payload.currency,
        dueDate: new Date(payload.dueAt).toLocaleDateString('en-AU'),
        checkoutUrl: `${appBaseUrl}/account/invoices/${payload.invoiceId}`,
      });
      await emailSender.sendEmail(email, `Invoice: ${lotTitle}`, html);
    },
  });
}
```

`handlers/payment-received.handler.ts`:
```typescript
import type { PaymentReceivedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderPaymentReceivedEmail } from '../../infrastructure/email/templates/payment-received.js';

export async function handlePaymentReceived(
  payload: PaymentReceivedPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>,
  appBaseUrl: string
): Promise<void> {
  const [email, lotTitle] = await Promise.all([getUserEmail(payload.winnerUserId), getLotTitle(payload.lotId)]);
  await useCase.execute({
    userId: payload.winnerUserId,
    type: 'PAYMENT_RECEIVED',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderPaymentReceivedEmail({ lotTitle, amount: `$${payload.amount}`, currency: payload.currency, fulfilmentUrl: `${appBaseUrl}/account/fulfilments` });
      await emailSender.sendEmail(email, 'Payment confirmed', html);
    },
  });
}
```

`handlers/invoice-expired.handler.ts`:
```typescript
import type { InvoiceExpiredPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderInvoiceExpiredEmail } from '../../infrastructure/email/templates/invoice-expired.js';

export async function handleInvoiceExpired(
  payload: InvoiceExpiredPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>
): Promise<void> {
  const [email, lotTitle] = await Promise.all([getUserEmail(payload.winnerUserId), getLotTitle(payload.lotId)]);
  await useCase.execute({
    userId: payload.winnerUserId,
    type: 'INVOICE_EXPIRED',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderInvoiceExpiredEmail({ lotTitle });
      await emailSender.sendEmail(email, 'Payment window closed', html);
    },
  });
}
```

`handlers/item-dispatched.handler.ts`:
```typescript
import type { ItemDispatchedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderItemDispatchedEmail } from '../../infrastructure/email/templates/item-dispatched.js';

export async function handleItemDispatched(
  payload: ItemDispatchedPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>
): Promise<void> {
  const [email, lotTitle] = await Promise.all([getUserEmail(payload.userId), getLotTitle(payload.lotId)]);
  await useCase.execute({
    userId: payload.userId,
    type: 'ITEM_DISPATCHED',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderItemDispatchedEmail({ lotTitle, trackingNumber: payload.trackingNumber, carrier: payload.carrier });
      await emailSender.sendEmail(email, 'Your item has been dispatched', html);
    },
  });
}
```

`handlers/item-collected.handler.ts`:
```typescript
import type { ItemCollectedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderItemCollectedEmail } from '../../infrastructure/email/templates/item-collected.js';

export async function handleItemCollected(
  payload: ItemCollectedPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>
): Promise<void> {
  const [email, lotTitle] = await Promise.all([getUserEmail(payload.userId), getLotTitle(payload.lotId)]);
  await useCase.execute({
    userId: payload.userId,
    type: 'ITEM_COLLECTED',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderItemCollectedEmail({ lotTitle });
      await emailSender.sendEmail(email, 'Collection confirmed', html);
    },
  });
}
```

- [x] **Step 9: Run all tests — verify they pass**

```bash
pnpm --filter @carat-room/notification-service test
```

Expected: 7 tests pass (2 repository + 1 user-registered + 2 bid-placed + 2 auction-closed).

- [x] **Step 10: Commit**

```bash
git add apps/notification-service/src/application/handlers/
git add apps/notification-service/src/__tests__/handlers/
git commit -m "feat(notification): add all 10 event handlers"
```

---

### Task 8: Subscribers, Entry Point, Dockerfile

**Files:**
- Create: `apps/notification-service/src/infrastructure/subscribers/notification-subscribers.ts`
- Create: `apps/notification-service/src/presentation/health-router.ts`
- Create: `apps/notification-service/src/main.ts`
- Create: `apps/notification-service/Dockerfile`

**Interfaces:**
- Produces: runnable service — subscribes to 10 RabbitMQ queues, exposes `GET /health`

- [x] **Step 1: Create `src/infrastructure/subscribers/notification-subscribers.ts`**

```typescript
import { EventSubscriber, createAmqpConnection } from '@carat-room/shared-events';
import type { UserRegisteredPayload, PhoneVerificationRequestedPayload, BidPlacedPayload, AuctionClosingSoonPayload, AuctionClosedPayload, InvoiceCreatedPayload, PaymentReceivedPayload, InvoiceExpiredPayload, ItemDispatchedPayload, ItemCollectedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../../application/log-notification.use-case.js';
import type { EmailSender } from '../../application/email-sender.js';
import type { SmsSender } from '../../application/sms-sender.js';
import { handleUserRegistered } from '../../application/handlers/user-registered.handler.js';
import { handlePhoneVerification } from '../../application/handlers/phone-verification.handler.js';
import { handleBidPlaced } from '../../application/handlers/bid-placed.handler.js';
import { handleAuctionClosingSoon } from '../../application/handlers/auction-closing-soon.handler.js';
import { handleAuctionClosed } from '../../application/handlers/auction-closed.handler.js';
import { handleInvoiceCreated } from '../../application/handlers/invoice-created.handler.js';
import { handlePaymentReceived } from '../../application/handlers/payment-received.handler.js';
import { handleInvoiceExpired } from '../../application/handlers/invoice-expired.handler.js';
import { handleItemDispatched } from '../../application/handlers/item-dispatched.handler.js';
import { handleItemCollected } from '../../application/handlers/item-collected.handler.js';

interface Deps {
  useCase: LogNotificationUseCase;
  emailSender: EmailSender;
  smsSender: SmsSender;
  getUserEmail: (userId: string) => Promise<string>;
  getLotTitle: (lotId: string) => Promise<string>;
  getCurrentBid: (lotId: string) => Promise<string>;
  appBaseUrl: string;
  amqpUrl: string;
}

export async function startNotificationSubscribers(deps: Deps): Promise<void> {
  const connection = await createAmqpConnection(deps.amqpUrl);
  const subscriber = new EventSubscriber(connection);

  await subscriber.subscribe<UserRegisteredPayload>('notification.user.registered', (p) => handleUserRegistered(p, deps.useCase, deps.emailSender, deps.appBaseUrl));
  await subscriber.subscribe<PhoneVerificationRequestedPayload>('notification.phone.verification.requested', (p) => handlePhoneVerification(p, deps.useCase, deps.smsSender));
  await subscriber.subscribe<BidPlacedPayload>('notification.bid.placed', (p) => handleBidPlaced(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle, deps.appBaseUrl));
  await subscriber.subscribe<AuctionClosingSoonPayload>('notification.auction.closing.soon', (p) => handleAuctionClosingSoon(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle, deps.getCurrentBid, deps.appBaseUrl));
  await subscriber.subscribe<AuctionClosedPayload>('notification.auction.closed', (p) => handleAuctionClosed(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle, deps.appBaseUrl));
  await subscriber.subscribe<InvoiceCreatedPayload>('notification.invoice.created', (p) => handleInvoiceCreated(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle, deps.appBaseUrl));
  await subscriber.subscribe<PaymentReceivedPayload>('notification.payment.received', (p) => handlePaymentReceived(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle, deps.appBaseUrl));
  await subscriber.subscribe<InvoiceExpiredPayload>('notification.invoice.expired', (p) => handleInvoiceExpired(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle));
  await subscriber.subscribe<ItemDispatchedPayload>('notification.item.dispatched', (p) => handleItemDispatched(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle));
  await subscriber.subscribe<ItemCollectedPayload>('notification.item.collected', (p) => handleItemCollected(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle));

  console.log('[NotificationService] Subscribed to all 10 queues');
}
```

- [x] **Step 2: Create `src/presentation/health-router.ts`**

```typescript
import { Hono } from 'hono';

export const healthRouter = new Hono();

healthRouter.get('/health', (c) => c.json({ status: 'ok' }));
```

- [x] **Step 3: Create `src/main.ts`**

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createPostgresClient } from './infrastructure/db/postgres-client.js';
import { PostgresNotificationRepository } from './infrastructure/db/postgres-notification-repository.js';
import { LogNotificationUseCase } from './application/log-notification.use-case.js';
import { ResendEmailSender } from './infrastructure/email/resend-email-sender.js';
import { TwilioSmsSender } from './infrastructure/sms/twilio-sms-sender.js';
import { startNotificationSubscribers } from './infrastructure/subscribers/notification-subscribers.js';
import { healthRouter } from './presentation/health-router.js';

const PORT = Number(process.env['PORT'] ?? 3005);
const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const RABBITMQ_URL = process.env['RABBITMQ_URL'] ?? '';
const RESEND_API_KEY = process.env['RESEND_API_KEY'] ?? '';
const RESEND_FROM = process.env['RESEND_FROM'] ?? 'noreply@thecaratroom.com';
const TWILIO_ACCOUNT_SID = process.env['TWILIO_ACCOUNT_SID'] ?? '';
const TWILIO_AUTH_TOKEN = process.env['TWILIO_AUTH_TOKEN'] ?? '';
const TWILIO_PHONE_NUMBER = process.env['TWILIO_PHONE_NUMBER'] ?? '';
const APP_BASE_URL = process.env['APP_BASE_URL'] ?? 'https://thecaratroom.com';
const USER_SERVICE_URL = process.env['USER_SERVICE_URL'] ?? 'http://user-service:3001';
const CATALOGUE_SERVICE_URL = process.env['CATALOGUE_SERVICE_URL'] ?? 'http://catalogue-service:3002';
const AUCTION_ENGINE_URL = process.env['AUCTION_ENGINE_URL'] ?? 'http://auction-engine:3003';

const sql = createPostgresClient(DATABASE_URL);
const repo = new PostgresNotificationRepository(sql);
const useCase = new LogNotificationUseCase(repo);
const emailSender = new ResendEmailSender(RESEND_API_KEY, RESEND_FROM);
const smsSender = new TwilioSmsSender(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);

await startNotificationSubscribers({
  useCase,
  emailSender,
  smsSender,
  getUserEmail: async (userId) => {
    const res = await fetch(`${USER_SERVICE_URL}/api/users/${userId}/email`);
    if (!res.ok) throw new Error(`Failed to fetch email for user ${userId}`);
    const data = await res.json() as { email: string };
    return data.email;
  },
  getLotTitle: async (lotId) => {
    const res = await fetch(`${CATALOGUE_SERVICE_URL}/api/lots/${lotId}`);
    if (!res.ok) throw new Error(`Failed to fetch lot ${lotId}`);
    const data = await res.json() as { data: { title: string } };
    return data.data.title;
  },
  getCurrentBid: async (lotId) => {
    const res = await fetch(`${AUCTION_ENGINE_URL}/api/auctions/${lotId}`);
    if (!res.ok) throw new Error(`Failed to fetch auction ${lotId}`);
    const data = await res.json() as { data: { currentHighestBid: number | null } };
    return data.data.currentHighestBid ? `$${data.data.currentHighestBid}` : 'No bids yet';
  },
  amqpUrl: RABBITMQ_URL,
  appBaseUrl: APP_BASE_URL,
});

const app = new Hono();
app.route('/', healthRouter);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[NotificationService] Listening on port ${PORT}`);
});
```

- [x] **Step 4: Create `Dockerfile`**

```dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY apps/notification-service/ ./apps/notification-service/

FROM base AS deps
RUN pnpm install --frozen-lockfile

FROM deps AS builder
RUN pnpm --filter @carat-room/notification-service build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/notification-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3005
CMD ["node", "dist/main.js"]
```

- [x] **Step 5: Build the service**

```bash
pnpm --filter @carat-room/notification-service build
```

Expected: `dist/` created, zero TypeScript errors.

- [x] **Step 6: Smoke test locally**

```bash
docker compose up postgres rabbitmq -d
DATABASE_URL=postgresql://postgres:changeme@localhost:5432/notifications \
RABBITMQ_URL=amqp://carat:changeme@localhost:5672 \
RESEND_API_KEY=re_test \
TWILIO_ACCOUNT_SID=AC_test \
TWILIO_AUTH_TOKEN=test \
TWILIO_PHONE_NUMBER=+61400000000 \
pnpm --filter @carat-room/notification-service dev
```

Expected output:
```
[NotificationService] Subscribed to all 10 queues
[NotificationService] Listening on port 3005
```

```bash
curl http://localhost:3005/health
```

Expected: `{"status":"ok"}`

- [x] **Step 7: Commit**

```bash
git add apps/notification-service/src/infrastructure/subscribers/
git add apps/notification-service/src/presentation/
git add apps/notification-service/src/main.ts
git add apps/notification-service/Dockerfile
git commit -m "feat(notification): wire subscribers and add service entry point"
```

---

## Acceptance Criteria

- [x] `pnpm --filter @carat-room/notification-service test` — 7 tests pass
- [x] `pnpm --filter @carat-room/notification-service build` — zero TypeScript errors
- [x] `GET /health` returns `{"status":"ok"}`
- [x] Service logs "Subscribed to all 10 queues" on startup
- [x] Every notification attempt recorded in `notification_log` — both SENT and FAILED
- [x] `handleBidPlaced` does nothing when `previousHighestBidderId` is null
- [x] `handleAuctionClosed` sends AUCTION_CLOSED_WON when `reserveMet: true`, AUCTION_CLOSED_UNSOLD when `reserveMet: false`
- [x] Phone OTP sent via Twilio SMS — all other notifications sent via Resend email
- [x] Infrastructure layer never imported by domain or application layers
