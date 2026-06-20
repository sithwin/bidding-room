# Shared Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three shared packages — `shared-types`, `shared-events`, and `shared-auth` — that every domain service imports before it can be built.

**Architecture:** Three independent packages under `packages/` in the Turborepo monorepo. `shared-types` defines all domain types and event payloads. `shared-events` wraps amqplib with typed publish/subscribe helpers. `shared-auth` provides a Hono middleware that validates RS256 JWTs and attaches decoded claims to the request context.

**Tech Stack:** TypeScript 5.4, amqplib, hono, jose (JWT verification), vitest

## Global Constraints

- Node.js >= 20
- TypeScript >= 5.4
- pnpm >= 9
- Named exports only — no `export default`
- No `var` — always `const` or `let`
- No `_` prefix on private fields — use TypeScript `private` keyword
- British English in all copy and comments
- All tests use vitest

---

## File Structure

```
packages/
  shared-types/
    package.json
    tsconfig.json
    src/
      index.ts                  — re-exports everything
      domain/
        user.ts                 — User, UserStatus, UserRole types
        lot.ts                  — Lot, LotCondition, LotImage types
        auction.ts              — LotAuctionStatus, Bid, LotStatus types
        payment.ts              — Invoice, InvoiceStatus types
        shipping.ts             — Fulfilment, FulfilmentMethod, FulfilmentStatus, ShippingAddress, CollectionSlot types
      events/
        user-events.ts          — UserRegisteredPayload, PhoneVerificationRequestedPayload
        auction-events.ts       — BidPlacedPayload, AuctionClosingSoonPayload, AuctionClosedPayload
        payment-events.ts       — InvoiceCreatedPayload, PaymentReceivedPayload, InvoiceExpiredPayload
        shipping-events.ts      — ItemDispatchedPayload, ItemCollectedPayload
        index.ts                — re-exports all event types + ROUTING_KEYS const

  shared-events/
    package.json
    tsconfig.json
    src/
      index.ts                  — re-exports EventPublisher, EventSubscriber, createAmqpConnection
      connection.ts             — createAmqpConnection — shared AMQP connection factory
      publisher.ts              — EventPublisher class
      subscriber.ts             — EventSubscriber class
      __tests__/
        publisher.test.ts
        subscriber.test.ts

  shared-auth/
    package.json
    tsconfig.json
    src/
      index.ts                  — re-exports authMiddleware, verifyJwt, JwtPayload
      verify.ts                 — verifyJwt(token, publicKey): Promise<JwtPayload>
      middleware.ts             — authMiddleware Hono middleware
      __tests__/
        verify.test.ts
        middleware.test.ts
```

---

### Task 1: `shared-types` Package

**Files:**
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/domain/user.ts`
- Create: `packages/shared-types/src/domain/lot.ts`
- Create: `packages/shared-types/src/domain/auction.ts`
- Create: `packages/shared-types/src/domain/payment.ts`
- Create: `packages/shared-types/src/domain/shipping.ts`
- Create: `packages/shared-types/src/events/user-events.ts`
- Create: `packages/shared-types/src/events/auction-events.ts`
- Create: `packages/shared-types/src/events/payment-events.ts`
- Create: `packages/shared-types/src/events/shipping-events.ts`
- Create: `packages/shared-types/src/events/index.ts`
- Create: `packages/shared-types/src/index.ts`

**Interfaces:**
- Consumes: `@carat-room/tsconfig/service` (from 00-infrastructure Task 2)
- Produces:
  - `User`, `UserStatus`, `UserRole` from `@carat-room/shared-types`
  - `Lot`, `LotCondition`, `LotImage` from `@carat-room/shared-types`
  - `LotAuctionStatus`, `Bid`, `LotStatus` from `@carat-room/shared-types`
  - `Invoice`, `InvoiceStatus` from `@carat-room/shared-types`
  - `Fulfilment`, `FulfilmentMethod`, `FulfilmentStatus`, `ShippingAddress`, `CollectionSlot` from `@carat-room/shared-types`
  - All event payload types and `ROUTING_KEYS` const, `RoutingKey` type from `@carat-room/shared-types`

- [ ] **Step 1: Create package scaffold**

```bash
mkdir -p packages/shared-types/src/domain packages/shared-types/src/events
```

`packages/shared-types/package.json`:
```json
{
  "name": "@carat-room/shared-types",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "typescript": "^5.4.0"
  }
}
```

`packages/shared-types/tsconfig.json`:
```json
{
  "extends": "@carat-room/tsconfig/service",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Create `src/domain/user.ts`**

```typescript
export type UserStatus =
  | 'REGISTERED'
  | 'EMAIL_VERIFIED'
  | 'APPROVED_BIDDER'
  | 'SUSPENDED';

export type UserRole = 'BUYER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  role: UserRole;
  country: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
```

- [ ] **Step 3: Create `src/domain/lot.ts`**

```typescript
export type LotCondition = 'NEW' | 'EXCELLENT' | 'VERY_GOOD' | 'GOOD';

export interface LotImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  displayOrder: number;
  isPrimary: boolean;
}

export interface Lot {
  id: string;
  title: string;
  description: string | null;
  categoryId: string;
  condition: LotCondition | null;
  estimatedValue: number | null;
  images: LotImage[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
```

- [ ] **Step 4: Create `src/domain/auction.ts`**

```typescript
export type LotAuctionStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'LIVE'
  | 'CLOSING'
  | 'CLOSED'
  | 'SOLD'
  | 'UNSOLD';

export interface Bid {
  id: string;
  lotId: string;
  userId: string;
  amount: number;
  placedAt: string; // ISO 8601
}

export interface LotStatus {
  lotId: string;
  status: LotAuctionStatus;
  currentHighestBid: number | null;
  bidCount: number;
  endAt: string;            // ISO 8601
  winnerUserId: string | null;
  updatedAt: string;        // ISO 8601
}
```

- [ ] **Step 5: Create `src/domain/payment.ts`**

```typescript
export type InvoiceStatus =
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'EXPIRED'
  | 'CANCELLED';

export interface Invoice {
  id: string;
  lotId: string;
  winnerUserId: string;
  amount: number;
  currency: string;          // ISO 4217
  status: InvoiceStatus;
  stripeCheckoutId: string | null;
  stripePaymentIntent: string | null;
  dueAt: string;             // ISO 8601
  paidAt: string | null;     // ISO 8601
  createdAt: string;         // ISO 8601
}
```

- [ ] **Step 6: Create `src/domain/shipping.ts`**

```typescript
export type FulfilmentMethod = 'SHIP' | 'COLLECT';

export type FulfilmentStatus =
  | 'PENDING_CHOICE'
  | 'PENDING_DISPATCH'
  | 'DISPATCHED'
  | 'COLLECTED';

export interface ShippingAddress {
  id: string;
  fulfilmentId: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postcode: string;
  country: string;           // ISO 3166-1 alpha-2
}

export interface CollectionSlot {
  id: string;
  fulfilmentId: string;
  location: string;
  date: string;              // YYYY-MM-DD
  timeSlot: string;          // e.g. '10:00-11:00'
}

export interface Fulfilment {
  id: string;
  lotId: string;
  userId: string;
  method: FulfilmentMethod | null;
  status: FulfilmentStatus;
  createdAt: string;         // ISO 8601
  updatedAt: string;         // ISO 8601
}
```

- [ ] **Step 7: Create `src/events/user-events.ts`**

```typescript
export interface UserRegisteredPayload {
  userId: string;
  email: string;
  createdAt: string; // ISO 8601
}

export interface PhoneVerificationRequestedPayload {
  userId: string;
  phone: string;
  otpCode: string;
}
```

- [ ] **Step 8: Create `src/events/auction-events.ts`**

```typescript
export interface BidPlacedPayload {
  lotId: string;
  bidId: string;
  userId: string;
  amount: number;
  previousHighestBidderId: string | null;
  placedAt: string; // ISO 8601
}

export interface AuctionClosingSoonPayload {
  lotId: string;
  endAt: string;            // ISO 8601
  activeBidderIds: string[];
}

export interface AuctionClosedPayload {
  lotId: string;
  highestBidId: string | null;
  highestAmount: number | null;
  reserveMet: boolean;
  winnerUserId: string | null;
  closedAt: string;         // ISO 8601
}
```

- [ ] **Step 9: Create `src/events/payment-events.ts`**

```typescript
export interface InvoiceCreatedPayload {
  invoiceId: string;
  lotId: string;
  winnerUserId: string;
  amount: number;
  currency: string;
  dueAt: string;  // ISO 8601
}

export interface PaymentReceivedPayload {
  invoiceId: string;
  lotId: string;
  winnerUserId: string;
  amount: number;
  currency: string;
  paidAt: string; // ISO 8601
}

export interface InvoiceExpiredPayload {
  invoiceId: string;
  lotId: string;
  winnerUserId: string;
  expiredAt: string; // ISO 8601
}
```

- [ ] **Step 10: Create `src/events/shipping-events.ts`**

```typescript
export interface ItemDispatchedPayload {
  fulfilmentId: string;
  lotId: string;
  userId: string;
  trackingNumber: string;
  carrier: string;
  dispatchedAt: string; // ISO 8601
}

export interface ItemCollectedPayload {
  fulfilmentId: string;
  lotId: string;
  userId: string;
  collectedAt: string; // ISO 8601
}
```

- [ ] **Step 11: Create `src/events/index.ts`**

```typescript
export type { UserRegisteredPayload, PhoneVerificationRequestedPayload } from './user-events.js';
export type { BidPlacedPayload, AuctionClosingSoonPayload, AuctionClosedPayload } from './auction-events.js';
export type { InvoiceCreatedPayload, PaymentReceivedPayload, InvoiceExpiredPayload } from './payment-events.js';
export type { ItemDispatchedPayload, ItemCollectedPayload } from './shipping-events.js';

export const ROUTING_KEYS = {
  USER_REGISTERED: 'user.registered',
  USER_PHONE_VERIFICATION_REQUESTED: 'user.phone.verification.requested',
  AUCTION_BID_PLACED: 'auction.bid.placed',
  AUCTION_CLOSING_SOON: 'auction.closing.soon',
  AUCTION_CLOSED: 'auction.closed',
  PAYMENT_INVOICE_CREATED: 'payment.invoice.created',
  PAYMENT_RECEIVED: 'payment.received',
  PAYMENT_INVOICE_EXPIRED: 'payment.invoice.expired',
  SHIPPING_ITEM_DISPATCHED: 'shipping.item.dispatched',
  SHIPPING_ITEM_COLLECTED: 'shipping.item.collected',
} as const;

export type RoutingKey = typeof ROUTING_KEYS[keyof typeof ROUTING_KEYS];
```

- [ ] **Step 12: Create `src/index.ts`**

```typescript
export type { User, UserStatus, UserRole } from './domain/user.js';
export type { Lot, LotCondition, LotImage } from './domain/lot.js';
export type { LotAuctionStatus, Bid, LotStatus } from './domain/auction.js';
export type { Invoice, InvoiceStatus } from './domain/payment.js';
export type {
  Fulfilment,
  FulfilmentMethod,
  FulfilmentStatus,
  ShippingAddress,
  CollectionSlot,
} from './domain/shipping.js';
export type {
  UserRegisteredPayload,
  PhoneVerificationRequestedPayload,
  BidPlacedPayload,
  AuctionClosingSoonPayload,
  AuctionClosedPayload,
  InvoiceCreatedPayload,
  PaymentReceivedPayload,
  InvoiceExpiredPayload,
  ItemDispatchedPayload,
  ItemCollectedPayload,
} from './events/index.js';
export { ROUTING_KEYS } from './events/index.js';
export type { RoutingKey } from './events/index.js';
```

- [ ] **Step 13: Build and verify**

```bash
pnpm --filter @carat-room/shared-types build
```

Expected: `dist/` created, zero TypeScript errors.

- [ ] **Step 14: Commit**

```bash
git add packages/shared-types/
git commit -m "feat: add shared-types package — domain types and event payloads"
```

---

### Task 2: `shared-events` Package

**Files:**
- Create: `packages/shared-events/package.json`
- Create: `packages/shared-events/tsconfig.json`
- Create: `packages/shared-events/src/connection.ts`
- Create: `packages/shared-events/src/publisher.ts`
- Create: `packages/shared-events/src/subscriber.ts`
- Create: `packages/shared-events/src/index.ts`
- Create: `packages/shared-events/src/__tests__/publisher.test.ts`
- Create: `packages/shared-events/src/__tests__/subscriber.test.ts`

**Interfaces:**
- Consumes: `@carat-room/shared-types` — `RoutingKey`
- Produces:
  - `createAmqpConnection(url: string): Promise<Connection>` from `@carat-room/shared-events`
  - `EventPublisher` class: `publish<T>(routingKey: RoutingKey, payload: T): Promise<void>`, `close(): Promise<void>`
  - `EventSubscriber` class: `subscribe<T>(queue: string, handler: (payload: T) => Promise<void>): Promise<void>`, `close(): Promise<void>`

- [ ] **Step 1: Create package scaffold**

```bash
mkdir -p packages/shared-events/src/__tests__
```

`packages/shared-events/package.json`:
```json
{
  "name": "@carat-room/shared-events",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run"
  },
  "dependencies": {
    "amqplib": "^0.10.4"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "@carat-room/shared-types": "workspace:*",
    "@types/amqplib": "^0.10.5",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

`packages/shared-events/tsconfig.json`:
```json
{
  "extends": "@carat-room/tsconfig/service",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write failing test for `EventPublisher`**

`packages/shared-events/src/__tests__/publisher.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventPublisher } from '../publisher.js';
import type { Channel, Connection } from 'amqplib';

const mockChannel = {
  assertExchange: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockReturnValue(true),
  close: vi.fn().mockResolvedValue(undefined),
} as unknown as Channel;

const mockConnection = {
  createChannel: vi.fn().mockResolvedValue(mockChannel),
} as unknown as Connection;

describe('EventPublisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_publishMessageToExchange_when_publishIsCalled', async () => {
    const publisher = new EventPublisher(mockConnection);
    await publisher.publish('user.registered', {
      userId: 'user-1',
      email: 'test@example.com',
      createdAt: '2026-06-20T00:00:00Z',
    });

    expect(mockChannel.publish).toHaveBeenCalledWith(
      'carat.events',
      'user.registered',
      expect.any(Buffer),
      { persistent: true, contentType: 'application/json' }
    );
  });

  it('should_serialisePayloadAsJson_when_publishIsCalled', async () => {
    const publisher = new EventPublisher(mockConnection);
    const payload = { userId: 'user-1', email: 'test@example.com', createdAt: '2026-06-20T00:00:00Z' };
    await publisher.publish('user.registered', payload);

    const publishCall = (mockChannel.publish as ReturnType<typeof vi.fn>).mock.calls[0];
    const buffer = publishCall[2] as Buffer;
    expect(JSON.parse(buffer.toString())).toEqual(payload);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @carat-room/shared-events test
```

Expected: FAIL — `publisher.ts` does not exist yet.

- [ ] **Step 4: Create `src/connection.ts`**

```typescript
import amqplib from 'amqplib';
import type { Connection } from 'amqplib';

export async function createAmqpConnection(url: string): Promise<Connection> {
  const connection = await amqplib.connect(url);
  connection.on('error', (err: Error) => {
    console.error('[RabbitMQ] Connection error:', err.message);
  });
  return connection;
}
```

- [ ] **Step 5: Create `src/publisher.ts`**

```typescript
import type { Connection, Channel } from 'amqplib';
import type { RoutingKey } from '@carat-room/shared-types';

const EXCHANGE = 'carat.events';

export class EventPublisher {
  private channel: Channel | null = null;

  constructor(private readonly connection: Connection) {}

  async publish<T>(routingKey: RoutingKey, payload: T): Promise<void> {
    const channel = await this.getChannel();
    const buffer = Buffer.from(JSON.stringify(payload));
    channel.publish(EXCHANGE, routingKey, buffer, {
      persistent: true,
      contentType: 'application/json',
    });
  }

  async close(): Promise<void> {
    await this.channel?.close();
    this.channel = null;
  }

  private async getChannel(): Promise<Channel> {
    if (!this.channel) {
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    }
    return this.channel;
  }
}
```

- [ ] **Step 6: Run publisher tests — verify they pass**

```bash
pnpm --filter @carat-room/shared-events test
```

Expected: 2 tests pass.

- [ ] **Step 7: Write failing test for `EventSubscriber`**

`packages/shared-events/src/__tests__/subscriber.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventSubscriber } from '../subscriber.js';
import type { Channel, Connection, ConsumeMessage } from 'amqplib';

const mockChannel = {
  assertQueue: vi.fn().mockResolvedValue(undefined),
  prefetch: vi.fn().mockResolvedValue(undefined),
  consume: vi.fn().mockResolvedValue(undefined),
  ack: vi.fn(),
  nack: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
} as unknown as Channel;

const mockConnection = {
  createChannel: vi.fn().mockResolvedValue(mockChannel),
} as unknown as Connection;

describe('EventSubscriber', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_assertQueueAndStartConsuming_when_subscribeIsCalled', async () => {
    const subscriber = new EventSubscriber(mockConnection);
    await subscriber.subscribe('notification.user.registered', vi.fn().mockResolvedValue(undefined));

    expect(mockChannel.assertQueue).toHaveBeenCalledWith(
      'notification.user.registered',
      { durable: true }
    );
    expect(mockChannel.consume).toHaveBeenCalledWith(
      'notification.user.registered',
      expect.any(Function)
    );
  });

  it('should_callHandlerWithParsedPayload_when_messageIsReceived', async () => {
    const subscriber = new EventSubscriber(mockConnection);
    const handler = vi.fn().mockResolvedValue(undefined);
    let capturedConsumer: ((msg: ConsumeMessage | null) => Promise<void>) | null = null;

    (mockChannel.consume as ReturnType<typeof vi.fn>).mockImplementation(
      (_queue: string, consumer: (msg: ConsumeMessage | null) => Promise<void>) => {
        capturedConsumer = consumer;
        return Promise.resolve(undefined);
      }
    );

    await subscriber.subscribe('notification.user.registered', handler);

    const payload = { userId: 'user-1', email: 'test@example.com', createdAt: '2026-06-20T00:00:00Z' };
    const fakeMsg = { content: Buffer.from(JSON.stringify(payload)) } as ConsumeMessage;
    await capturedConsumer!(fakeMsg);

    expect(handler).toHaveBeenCalledWith(payload);
    expect(mockChannel.ack).toHaveBeenCalledWith(fakeMsg);
  });

  it('should_nackMessage_when_handlerThrows', async () => {
    const subscriber = new EventSubscriber(mockConnection);
    const handler = vi.fn().mockRejectedValue(new Error('handler failed'));
    let capturedConsumer: ((msg: ConsumeMessage | null) => Promise<void>) | null = null;

    (mockChannel.consume as ReturnType<typeof vi.fn>).mockImplementation(
      (_queue: string, consumer: (msg: ConsumeMessage | null) => Promise<void>) => {
        capturedConsumer = consumer;
        return Promise.resolve(undefined);
      }
    );

    await subscriber.subscribe('notification.user.registered', handler);

    const fakeMsg = { content: Buffer.from(JSON.stringify({ userId: 'user-1' })) } as ConsumeMessage;
    await capturedConsumer!(fakeMsg);

    expect(mockChannel.nack).toHaveBeenCalledWith(fakeMsg, false, false);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

```bash
pnpm --filter @carat-room/shared-events test
```

Expected: subscriber tests FAIL — `subscriber.ts` does not exist. Publisher tests still pass.

- [ ] **Step 9: Create `src/subscriber.ts`**

```typescript
import type { Connection, Channel, ConsumeMessage } from 'amqplib';

export class EventSubscriber {
  private channel: Channel | null = null;

  constructor(private readonly connection: Connection) {}

  async subscribe<T>(
    queue: string,
    handler: (payload: T) => Promise<void>
  ): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertQueue(queue, { durable: true });
    await channel.prefetch(1);

    await channel.consume(queue, async (msg: ConsumeMessage | null) => {
      if (!msg) return;
      try {
        const payload = JSON.parse(msg.content.toString()) as T;
        await handler(payload);
        channel.ack(msg);
      } catch (err) {
        console.error(`[EventSubscriber] Failed to process message on queue "${queue}":`, err);
        channel.nack(msg, false, false);
      }
    });
  }

  async close(): Promise<void> {
    await this.channel?.close();
    this.channel = null;
  }

  private async getChannel(): Promise<Channel> {
    if (!this.channel) {
      this.channel = await this.connection.createChannel();
    }
    return this.channel;
  }
}
```

- [ ] **Step 10: Create `src/index.ts`**

```typescript
export { createAmqpConnection } from './connection.js';
export { EventPublisher } from './publisher.js';
export { EventSubscriber } from './subscriber.js';
```

- [ ] **Step 11: Run all tests — verify they pass**

```bash
pnpm --filter @carat-room/shared-events test
```

Expected: 5 tests pass.

- [ ] **Step 12: Build**

```bash
pnpm --filter @carat-room/shared-events build
```

Expected: `dist/` created, no TypeScript errors.

- [ ] **Step 13: Commit**

```bash
git add packages/shared-events/
git commit -m "feat: add shared-events package — typed RabbitMQ publisher and subscriber"
```

---

### Task 3: `shared-auth` Package

**Files:**
- Create: `packages/shared-auth/package.json`
- Create: `packages/shared-auth/tsconfig.json`
- Create: `packages/shared-auth/src/verify.ts`
- Create: `packages/shared-auth/src/middleware.ts`
- Create: `packages/shared-auth/src/index.ts`
- Create: `packages/shared-auth/src/__tests__/verify.test.ts`
- Create: `packages/shared-auth/src/__tests__/middleware.test.ts`

**Interfaces:**
- Consumes: `hono` (Context, MiddlewareHandler types), `jose` (JWT verification), `@carat-room/shared-types` (UserStatus, UserRole)
- Produces:
  - `JwtPayload`: `{ userId: string; email: string; verificationStatus: UserStatus; role: UserRole }`
  - `verifyJwt(token: string, publicKeyPem: string): Promise<JwtPayload>` from `@carat-room/shared-auth`
  - `authMiddleware(publicKey: string, options?: { adminOnly?: boolean }): MiddlewareHandler` — attaches payload to `c.get('jwtPayload')`, returns 401 if missing/invalid, 403 if `adminOnly` and role is not `ADMIN`

- [ ] **Step 1: Create package scaffold**

```bash
mkdir -p packages/shared-auth/src/__tests__
```

`packages/shared-auth/package.json`:
```json
{
  "name": "@carat-room/shared-auth",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run"
  },
  "dependencies": {
    "hono": "^4.4.0",
    "jose": "^5.3.0"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "@carat-room/shared-types": "workspace:*",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

`packages/shared-auth/tsconfig.json`:
```json
{
  "extends": "@carat-room/tsconfig/service",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write failing test for `verifyJwt`**

`packages/shared-auth/src/__tests__/verify.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { SignJWT, generateKeyPair, exportSPKI } from 'jose';
import { verifyJwt } from '../verify.js';

async function buildKeys() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicKeyPem = await exportSPKI(publicKey);
  return { privateKey, publicKeyPem };
}

describe('verifyJwt', () => {
  it('should_returnPayload_when_tokenIsValid', async () => {
    const { privateKey, publicKeyPem } = await buildKeys();

    const token = await new SignJWT({
      userId: 'user-123',
      email: 'test@example.com',
      verificationStatus: 'APPROVED_BIDDER',
      role: 'BUYER',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    const payload = await verifyJwt(token, publicKeyPem);

    expect(payload.userId).toBe('user-123');
    expect(payload.email).toBe('test@example.com');
    expect(payload.verificationStatus).toBe('APPROVED_BIDDER');
    expect(payload.role).toBe('BUYER');
  });

  it('should_throwError_when_tokenIsExpired', async () => {
    const { privateKey, publicKeyPem } = await buildKeys();

    const token = await new SignJWT({
      userId: 'user-123',
      email: 'test@example.com',
      verificationStatus: 'APPROVED_BIDDER',
      role: 'BUYER',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('-1s')
      .sign(privateKey);

    await expect(verifyJwt(token, publicKeyPem)).rejects.toThrow();
  });

  it('should_throwError_when_tokenSignatureIsInvalid', async () => {
    const { publicKeyPem } = await buildKeys();
    const { privateKey: otherKey } = await buildKeys();

    const token = await new SignJWT({
      userId: 'user-123',
      email: 'test@example.com',
      verificationStatus: 'APPROVED_BIDDER',
      role: 'BUYER',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(otherKey);

    await expect(verifyJwt(token, publicKeyPem)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @carat-room/shared-auth test
```

Expected: FAIL — `verify.ts` does not exist yet.

- [ ] **Step 4: Create `src/verify.ts`**

```typescript
import { importSPKI, jwtVerify } from 'jose';
import type { UserStatus, UserRole } from '@carat-room/shared-types';

export interface JwtPayload {
  userId: string;
  email: string;
  verificationStatus: UserStatus;
  role: UserRole;
}

export async function verifyJwt(token: string, publicKeyPem: string): Promise<JwtPayload> {
  const publicKey = await importSPKI(publicKeyPem, 'RS256');
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });

  return {
    userId: payload['userId'] as string,
    email: payload['email'] as string,
    verificationStatus: payload['verificationStatus'] as UserStatus,
    role: payload['role'] as UserRole,
  };
}
```

- [ ] **Step 5: Run verify tests — verify they pass**

```bash
pnpm --filter @carat-room/shared-auth test
```

Expected: 3 tests pass.

- [ ] **Step 6: Write failing test for `authMiddleware`**

`packages/shared-auth/src/__tests__/middleware.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { SignJWT, generateKeyPair, exportSPKI } from 'jose';
import { authMiddleware } from '../middleware.js';
import type { JwtPayload } from '../verify.js';

async function buildKeys() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicKeyPem = await exportSPKI(publicKey);
  return { privateKey, publicKeyPem };
}

async function makeToken(privateKey: CryptoKey, overrides: Partial<JwtPayload> = {}) {
  return new SignJWT({
    userId: 'user-123',
    email: 'test@example.com',
    verificationStatus: 'APPROVED_BIDDER',
    role: 'BUYER',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(privateKey);
}

describe('authMiddleware', () => {
  it('should_attachJwtPayloadToContext_when_tokenIsValid', async () => {
    const { privateKey, publicKeyPem } = await buildKeys();
    const token = await makeToken(privateKey);

    const app = new Hono();
    app.use('*', authMiddleware(publicKeyPem));
    app.get('/test', (c) => {
      const payload = c.get('jwtPayload') as JwtPayload;
      return c.json({ userId: payload.userId });
    });

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string };
    expect(body.userId).toBe('user-123');
  });

  it('should_return401_when_authorizationHeaderIsMissing', async () => {
    const { publicKeyPem } = await buildKeys();

    const app = new Hono();
    app.use('*', authMiddleware(publicKeyPem));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(401);
  });

  it('should_return401_when_tokenIsInvalid', async () => {
    const { publicKeyPem } = await buildKeys();

    const app = new Hono();
    app.use('*', authMiddleware(publicKeyPem));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer not-a-valid-token' },
    });
    expect(res.status).toBe(401);
  });

  it('should_return403_when_roleIsNotAdmin_and_adminOnlyIsTrue', async () => {
    const { privateKey, publicKeyPem } = await buildKeys();
    const token = await makeToken(privateKey, { role: 'BUYER' });

    const app = new Hono();
    app.use('*', authMiddleware(publicKeyPem, { adminOnly: true }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

```bash
pnpm --filter @carat-room/shared-auth test
```

Expected: middleware tests FAIL — `middleware.ts` does not exist. Verify tests still pass.

- [ ] **Step 8: Create `src/middleware.ts`**

```typescript
import type { MiddlewareHandler } from 'hono';
import { verifyJwt } from './verify.js';
import type { JwtPayload } from './verify.js';

interface AuthOptions {
  adminOnly?: boolean;
}

export function authMiddleware(publicKey: string, options: AuthOptions = {}): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json(
        { error: { code: 'UNAUTHORISED', message: 'Missing or invalid authorisation header' } },
        401
      );
    }

    const token = authHeader.slice(7);
    let payload: JwtPayload;

    try {
      payload = await verifyJwt(token, publicKey);
    } catch {
      return c.json(
        { error: { code: 'UNAUTHORISED', message: 'Invalid or expired token' } },
        401
      );
    }

    if (options.adminOnly && payload.role !== 'ADMIN') {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        403
      );
    }

    c.set('jwtPayload', payload);
    await next();
  };
}
```

- [ ] **Step 9: Create `src/index.ts`**

```typescript
export { verifyJwt } from './verify.js';
export type { JwtPayload } from './verify.js';
export { authMiddleware } from './middleware.js';
```

- [ ] **Step 10: Run all tests — verify they pass**

```bash
pnpm --filter @carat-room/shared-auth test
```

Expected: 7 tests pass.

- [ ] **Step 11: Build**

```bash
pnpm --filter @carat-room/shared-auth build
```

Expected: `dist/` created, no TypeScript errors.

- [ ] **Step 12: Commit**

```bash
git add packages/shared-auth/
git commit -m "feat: add shared-auth package — JWT verification and Hono middleware"
```

---

### Task 4: Wire Packages into Turborepo and Verify

**Files:**
- Create/Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Produces: `pnpm turbo build` and `pnpm turbo test` run across all three packages from the repo root

- [ ] **Step 1: Ensure `pnpm-workspace.yaml` includes both directories**

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 2: Install all dependencies from root**

```bash
pnpm install
```

Expected: resolves `@carat-room/tsconfig`, `@carat-room/shared-types` as workspace dependencies with no errors.

- [ ] **Step 3: Build all packages from root**

```bash
pnpm turbo build
```

Expected: builds in order — `tsconfig` → `shared-types` → (`shared-events` and `shared-auth` in parallel). Zero errors.

- [ ] **Step 4: Run all tests from root**

```bash
pnpm turbo test
```

Expected: `shared-events` — 5 tests pass. `shared-auth` — 7 tests pass. `shared-types` — no tests (types-only package, correct).

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml
git commit -m "chore: verify all shared packages build and test cleanly via Turborepo"
```

---

## Acceptance Criteria

- [ ] `pnpm turbo build` builds all three packages without errors in correct dependency order
- [ ] `pnpm turbo test` — 12 tests total: 5 in `shared-events`, 7 in `shared-auth`
- [ ] `@carat-room/shared-types` exports all domain types: `User`, `Lot`, `LotAuctionStatus`, `Bid`, `LotStatus`, `Invoice`, `Fulfilment`, `ShippingAddress`, `CollectionSlot`, and all event payload types
- [ ] `ROUTING_KEYS` const values match the 10 routing keys in `infra/rabbitmq/definitions.json` exactly
- [ ] `EventPublisher.publish` serialises payload as JSON and publishes to `carat.events` exchange with `persistent: true`
- [ ] `EventSubscriber.subscribe` parses JSON payload, acks message on success, nacks (no requeue) on handler error
- [ ] `verifyJwt` throws on expired token and on token signed with a different private key
- [ ] `authMiddleware` returns 401 for missing `Authorization` header, 401 for invalid token, 403 for non-admin on `adminOnly: true` route, attaches `JwtPayload` to `c.get('jwtPayload')` on success
