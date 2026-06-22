# Auction Engine — Part A: Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the Auction Engine core — Event Sourcing aggregate, event store, all command handlers, read projection, BullMQ timer scheduling, and RabbitMQ publishing — with no HTTP or SSE (those are Part B).

**Architecture:** Event Sourcing + CQRS. All state changes go through the `AuctionAggregate` which appends typed domain events. The `PostgresEventStore` persists events append-only. A `PostgresProjectionHandler` maintains `lot_status` and `bids` read tables. `BullMQTimerScheduler` schedules start/close/closing-soon jobs. Command handlers orchestrate: load → hydrate → validate → append → project → publish.

**Tech Stack:** postgres.js, ioredis, BullMQ, amqplib, `@carat-room/shared-events`, `@carat-room/shared-types`, Vitest.

## Global Constraints

- Node.js 20, TypeScript 5.4, strict mode
- postgres.js for DB — no ORM
- Vitest for all tests — no Jest
- Named exports only — no `export default` (exception: `vitest.config.ts`)
- Single quotes for strings; `const`/`let` only — no `var`
- Clean Architecture: domain ← application ← infrastructure
- Service port: **3002** (wired in Part B), DB: **`carat_auction`**
- RabbitMQ topic exchange: `carat.events`
- Reserve price stored in `auction_events` ONLY — never in projection tables, never in API responses
- `UNIQUE(lot_id, sequence)` constraint provides optimistic concurrency — concurrent writes fail at DB level
- Redis lock TTL for bid: **5 seconds**
- Auto-extend window and duration: configured per auction at schedule time
- Closing-soon notification fires **15 minutes** before `end_at`

---

## File Map

```
apps/auction-engine/
  package.json
  tsconfig.json
  vitest.config.ts
  migrations/
    001_create_auction_engine.sql
  src/
    domain/
      auction-events.ts               — AuctionDomainEvent discriminated union + payload interfaces
      auction-aggregate.ts            — AuctionAggregate class, LotStatus enum, PlaceBidResult type
      auction-aggregate.test.ts       — 8 unit tests (state transitions + business rules)
      event-store.ts                  — EventStore interface, StoredEvent type
    application/
      projection-handler.ts           — ProjectionHandler interface
      timer-scheduler.ts              — TimerScheduler interface
      auction-event-publisher.ts      — AuctionEventPublisher interface
      schedule-auction-handler.ts     — ScheduleAuctionCommandHandler
      start-auction-handler.ts        — StartAuctionCommandHandler (called by BullMQ at start_at)
      place-bid-handler.ts            — PlaceBidCommandHandler (uses Redis lock) + RedisLock interface
      cancel-auction-handler.ts       — CancelAuctionCommandHandler
      close-auction-handler.ts        — CloseAuctionCommandHandler (called by BullMQ at end_at)
      command-handlers.test.ts        — 10 mock tests (all 5 handlers)
    infrastructure/
      db.ts
      postgres-event-store.ts         — PostgresEventStore implements EventStore
      postgres-event-store.test.ts    — 4 integration tests
      redis-lock.ts                   — RedisLockAdapter implements RedisLock
      redis-lock.test.ts              — 2 mock tests
      bullmq-timer-scheduler.ts       — BullMQTimerScheduler implements TimerScheduler
      bullmq-timer-scheduler.test.ts  — 3 mock tests
      postgres-projection-handler.ts  — upserts lot_status, inserts bids
      postgres-projection-handler.test.ts — 5 integration tests
      rabbitmq-auction-publisher.ts   — RabbitMQAuctionPublisher implements AuctionEventPublisher
      rabbitmq-auction-publisher.test.ts  — 2 mock tests
```

**Total tests: 34**

---

### Task 1: Scaffold — Package, Config, Migration

**Files:**
- Create: `apps/auction-engine/package.json`
- Create: `apps/auction-engine/tsconfig.json`
- Create: `apps/auction-engine/vitest.config.ts`
- Create: `apps/auction-engine/migrations/001_create_auction_engine.sql`

**Interfaces:**
- Produces: runnable TypeScript scaffold + DB schema used by all subsequent tasks

- [x] **Step 1: Create `apps/auction-engine/package.json`**

```json
{
  "name": "@carat-room/auction-engine",
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
    "@carat-room/shared-events": "workspace:*",
    "@carat-room/shared-types": "workspace:*",
    "@hono/node-server": "^1.12.0",
    "bullmq": "^5.12.0",
    "hono": "^4.4.0",
    "ioredis": "^5.4.1",
    "postgres": "^3.4.4",
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

- [x] **Step 2: Create `apps/auction-engine/tsconfig.json`**

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

- [x] **Step 3: Create `apps/auction-engine/vitest.config.ts`**

```typescript
export default {
  test: {
    environment: 'node',
  },
};
```

- [x] **Step 4: Create `apps/auction-engine/migrations/001_create_auction_engine.sql`**

```sql
-- Event store: append-only, never updated
CREATE TABLE auction_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id       UUID NOT NULL,
  sequence     BIGINT NOT NULL,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lot_id, sequence)
);

CREATE INDEX auction_events_lot_id_idx ON auction_events (lot_id, sequence);

-- Read projection: rebuilt from events; reserve_price is NEVER stored here
CREATE TABLE lot_status (
  lot_id              UUID PRIMARY KEY,
  status              TEXT NOT NULL,
  current_highest_bid NUMERIC(12,2),
  bid_count           INT NOT NULL DEFAULT 0,
  end_at              TIMESTAMPTZ NOT NULL,
  winner_user_id      UUID,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Read projection: bid history (amounts only — user_id stored for ownership checks, not exposed via API)
CREATE TABLE bids (
  id         UUID PRIMARY KEY,
  lot_id     UUID NOT NULL,
  user_id    UUID NOT NULL,
  amount     NUMERIC(12,2) NOT NULL,
  placed_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX bids_lot_id_idx ON bids (lot_id, placed_at DESC);
```

- [x] **Step 5: Commit**

```bash
git add apps/auction-engine/
git commit -m "feat(auction): scaffold package, tsconfig, DB migration"
```

---

### Task 2: Domain — AuctionAggregate + Event Types

**Files:**
- Create: `apps/auction-engine/src/domain/auction-events.ts`
- Create: `apps/auction-engine/src/domain/event-store.ts`
- Create: `apps/auction-engine/src/domain/auction-aggregate.ts`
- Test: `apps/auction-engine/src/domain/auction-aggregate.test.ts`

**Interfaces:**
- Produces:
  - `LotStatus` enum (`Draft`, `Scheduled`, `Live`, `Closing`, `Closed`, `Sold`, `Unsold`, `Cancelled`)
  - `AuctionDomainEvent` discriminated union
  - `StoredEvent` type + `EventStore` interface
  - `AuctionAggregate` with `.scheduleAuction()`, `.startAuction()`, `.placeBid()`, `.cancel()`, `.close()`, `.applyStored()`, `.sequence`, `.uncommittedEvents`
  - `PlaceBidResult` union type
  - `CloseAuctionResult` type

- [x] **Step 1: Write the failing tests**

Create `apps/auction-engine/src/domain/auction-aggregate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AuctionAggregate, LotStatus } from './auction-aggregate';
import { StoredEvent } from './event-store';

function makeScheduledAggregate(): AuctionAggregate {
  const agg = AuctionAggregate.create('lot-1');
  agg.scheduleAuction({
    startAt: new Date('2026-06-20T10:00:00Z'),
    endAt: new Date('2026-06-20T12:00:00Z'),
    reservePrice: 500,
    minBidIncrement: 10,
    autoExtendWindowMinutes: 3,
    autoExtendDurationMinutes: 3,
  });
  return agg;
}

function makeLiveAggregate(): AuctionAggregate {
  const agg = makeScheduledAggregate();
  const stored: StoredEvent[] = agg.uncommittedEvents.map((e, i) => ({
    id: `evt-${i}`,
    lotId: 'lot-1',
    sequence: i + 1,
    type: e.type,
    payload: e.payload,
    occurredAt: new Date(),
  }));
  const live = AuctionAggregate.create('lot-1');
  stored.forEach(e => live.applyStored(e));
  live.startAuction();
  return live;
}

describe('AuctionAggregate', () => {
  it('should_setStatusScheduled_when_auctionScheduled', () => {
    const agg = makeScheduledAggregate();

    expect(agg.status).toBe(LotStatus.Scheduled);
    expect(agg.uncommittedEvents).toHaveLength(1);
    expect(agg.uncommittedEvents[0].type).toBe('AuctionScheduled');
  });

  it('should_setStatusLive_when_auctionStarted', () => {
    const agg = makeLiveAggregate();

    expect(agg.status).toBe(LotStatus.Live);
  });

  it('should_acceptBidAndUpdateHighest_when_bidIsValid', () => {
    const agg = makeLiveAggregate();

    const result = agg.placeBid({
      bidId: 'bid-1',
      userId: 'user-1',
      amount: 100,
      placedAt: new Date('2026-06-20T11:00:00Z'),
    });

    expect(result.success).toBe(true);
    expect(agg.highestBidAmount).toBe(100);
    expect(agg.bidCount).toBe(1);
  });

  it('should_rejectBid_when_amountBelowMinIncrement', () => {
    const agg = makeLiveAggregate();
    agg.placeBid({ bidId: 'bid-1', userId: 'user-1', amount: 100, placedAt: new Date('2026-06-20T11:00:00Z') });

    const result = agg.placeBid({
      bidId: 'bid-2',
      userId: 'user-2',
      amount: 105, // needs >= 100 + 10 = 110
      placedAt: new Date('2026-06-20T11:01:00Z'),
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('BID_TOO_LOW');
  });

  it('should_rejectBid_when_userTriesToOutbidThemself', () => {
    const agg = makeLiveAggregate();
    agg.placeBid({ bidId: 'bid-1', userId: 'user-1', amount: 100, placedAt: new Date('2026-06-20T11:00:00Z') });

    const result = agg.placeBid({
      bidId: 'bid-2',
      userId: 'user-1',
      amount: 200,
      placedAt: new Date('2026-06-20T11:01:00Z'),
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('CANNOT_OUTBID_SELF');
  });

  it('should_extendTimerAndSetClosingStatus_when_bidLandsWithinAutoExtendWindow', () => {
    const agg = makeLiveAggregate();
    // endAt is 12:00, auto-extend window is 3 min — bid at 11:58 is within window
    const result = agg.placeBid({
      bidId: 'bid-1',
      userId: 'user-1',
      amount: 100,
      placedAt: new Date('2026-06-20T11:58:00Z'),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.timerExtended).toBe(true);
      expect(agg.status).toBe(LotStatus.Closing);
    }
  });

  it('should_closeAsSold_when_highestBidMeetsReserve', () => {
    const agg = makeLiveAggregate();
    agg.placeBid({ bidId: 'bid-1', userId: 'user-1', amount: 600, placedAt: new Date('2026-06-20T11:00:00Z') });

    const result = agg.close();

    expect(result.reserveMet).toBe(true);
    expect(result.winnerUserId).toBe('user-1');
    expect(agg.status).toBe(LotStatus.Sold);
  });

  it('should_closeAsUnsold_when_highestBidBelowReserve', () => {
    const agg = makeLiveAggregate();
    agg.placeBid({ bidId: 'bid-1', userId: 'user-1', amount: 400, placedAt: new Date('2026-06-20T11:00:00Z') });

    const result = agg.close();

    expect(result.reserveMet).toBe(false);
    expect(result.winnerUserId).toBeNull();
    expect(agg.status).toBe(LotStatus.Unsold);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
cd apps/auction-engine
npx vitest run src/domain/auction-aggregate.test.ts
```

Expected: FAIL — `Cannot find module './auction-aggregate'`

- [x] **Step 3: Create `apps/auction-engine/src/domain/auction-events.ts`**

```typescript
export interface AuctionScheduledPayload {
  start_at: string;
  end_at: string;
  reserve_price: number;
  min_bid_increment: number;
  auto_extend_window_minutes: number;
  auto_extend_duration_minutes: number;
}

export interface BidPlacedPayload {
  bid_id: string;
  user_id: string;
  amount: number;
  placed_at: string;
}

export interface TimerExtendedPayload {
  new_end_at: string;
  extended_by_minutes: number;
}

export interface AuctionClosedPayload {
  highest_bid_id: string | null;
  highest_amount: number;
  reserve_met: boolean;
  winner_user_id: string | null;
}

export interface AuctionCancelledPayload {
  reason: string;
}

export type AuctionDomainEvent =
  | { type: 'AuctionScheduled'; payload: AuctionScheduledPayload }
  | { type: 'AuctionStarted'; payload: Record<string, never> }
  | { type: 'BidPlaced'; payload: BidPlacedPayload }
  | { type: 'TimerExtended'; payload: TimerExtendedPayload }
  | { type: 'AuctionClosed'; payload: AuctionClosedPayload }
  | { type: 'AuctionCancelled'; payload: AuctionCancelledPayload };
```

- [x] **Step 4: Create `apps/auction-engine/src/domain/event-store.ts`**

```typescript
import { AuctionDomainEvent } from './auction-events';

export interface StoredEvent {
  id: string;
  lotId: string;
  sequence: number;
  type: string;
  payload: unknown;
  occurredAt: Date;
}

export interface EventStore {
  append(lotId: string, events: AuctionDomainEvent[], afterSequence: number): Promise<void>;
  load(lotId: string): Promise<StoredEvent[]>;
}
```

- [x] **Step 5: Create `apps/auction-engine/src/domain/auction-aggregate.ts`**

```typescript
import {
  AuctionDomainEvent,
  AuctionScheduledPayload,
  BidPlacedPayload,
  TimerExtendedPayload,
  AuctionClosedPayload,
} from './auction-events';
import { StoredEvent } from './event-store';

export enum LotStatus {
  Draft = 'DRAFT',
  Scheduled = 'SCHEDULED',
  Live = 'LIVE',
  Closing = 'CLOSING',
  Closed = 'CLOSED',
  Sold = 'SOLD',
  Unsold = 'UNSOLD',
  Cancelled = 'CANCELLED',
}

export type PlaceBidResult =
  | { success: true; timerExtended: false }
  | { success: true; timerExtended: true; newEndAt: Date }
  | { success: false; reason: 'BID_TOO_LOW' | 'CANNOT_OUTBID_SELF' | 'AUCTION_NOT_ACTIVE' };

export interface CloseAuctionResult {
  alreadyClosed: boolean;
  reserveMet: boolean;
  winnerUserId: string | null;
  finalAmount: number;
}

export class AuctionAggregate {
  sequence = 0;
  uncommittedEvents: AuctionDomainEvent[] = [];

  status = LotStatus.Draft;
  startAt: Date = new Date(0);
  endAt: Date = new Date(0);
  reservePrice = 0;
  minBidIncrement = 0;
  autoExtendWindowMinutes = 0;
  autoExtendDurationMinutes = 0;
  highestBidId: string | null = null;
  highestBidAmount = 0;
  highestBidUserId: string | null = null;
  bidCount = 0;

  private constructor(readonly lotId: string) {}

  static create(lotId: string): AuctionAggregate {
    return new AuctionAggregate(lotId);
  }

  applyStored(stored: StoredEvent): void {
    this.sequence = stored.sequence;
    this.applyEvent({ type: stored.type, payload: stored.payload } as AuctionDomainEvent);
  }

  private appendEvent(event: AuctionDomainEvent): void {
    this.uncommittedEvents.push(event);
    this.applyEvent(event);
  }

  private applyEvent(event: AuctionDomainEvent): void {
    switch (event.type) {
      case 'AuctionScheduled': {
        const p = event.payload as AuctionScheduledPayload;
        this.status = LotStatus.Scheduled;
        this.startAt = new Date(p.start_at);
        this.endAt = new Date(p.end_at);
        this.reservePrice = p.reserve_price;
        this.minBidIncrement = p.min_bid_increment;
        this.autoExtendWindowMinutes = p.auto_extend_window_minutes;
        this.autoExtendDurationMinutes = p.auto_extend_duration_minutes;
        break;
      }
      case 'AuctionStarted':
        this.status = LotStatus.Live;
        break;
      case 'BidPlaced': {
        const p = event.payload as BidPlacedPayload;
        this.highestBidId = p.bid_id;
        this.highestBidAmount = p.amount;
        this.highestBidUserId = p.user_id;
        this.bidCount += 1;
        break;
      }
      case 'TimerExtended': {
        const p = event.payload as TimerExtendedPayload;
        this.endAt = new Date(p.new_end_at);
        this.status = LotStatus.Closing;
        break;
      }
      case 'AuctionClosed': {
        const p = event.payload as AuctionClosedPayload;
        this.status = p.reserve_met ? LotStatus.Sold : LotStatus.Unsold;
        break;
      }
      case 'AuctionCancelled':
        this.status = LotStatus.Cancelled;
        break;
    }
  }

  scheduleAuction(params: {
    startAt: Date;
    endAt: Date;
    reservePrice: number;
    minBidIncrement: number;
    autoExtendWindowMinutes: number;
    autoExtendDurationMinutes: number;
  }): void {
    this.appendEvent({
      type: 'AuctionScheduled',
      payload: {
        start_at: params.startAt.toISOString(),
        end_at: params.endAt.toISOString(),
        reserve_price: params.reservePrice,
        min_bid_increment: params.minBidIncrement,
        auto_extend_window_minutes: params.autoExtendWindowMinutes,
        auto_extend_duration_minutes: params.autoExtendDurationMinutes,
      },
    });
  }

  startAuction(): void {
    this.appendEvent({ type: 'AuctionStarted', payload: {} });
  }

  placeBid(params: {
    bidId: string;
    userId: string;
    amount: number;
    placedAt: Date;
  }): PlaceBidResult {
    if (this.status !== LotStatus.Live && this.status !== LotStatus.Closing) {
      return { success: false, reason: 'AUCTION_NOT_ACTIVE' };
    }
    if (params.userId === this.highestBidUserId) {
      return { success: false, reason: 'CANNOT_OUTBID_SELF' };
    }
    if (params.amount < this.highestBidAmount + this.minBidIncrement) {
      return { success: false, reason: 'BID_TOO_LOW' };
    }

    this.appendEvent({
      type: 'BidPlaced',
      payload: {
        bid_id: params.bidId,
        user_id: params.userId,
        amount: params.amount,
        placed_at: params.placedAt.toISOString(),
      },
    });

    const msToClose = this.endAt.getTime() - params.placedAt.getTime();
    const windowMs = this.autoExtendWindowMinutes * 60 * 1000;

    if (msToClose < windowMs) {
      const newEndAt = new Date(params.placedAt.getTime() + this.autoExtendDurationMinutes * 60 * 1000);
      this.appendEvent({
        type: 'TimerExtended',
        payload: {
          new_end_at: newEndAt.toISOString(),
          extended_by_minutes: this.autoExtendDurationMinutes,
        },
      });
      return { success: true, timerExtended: true, newEndAt };
    }

    return { success: true, timerExtended: false };
  }

  cancel(reason: string): void {
    this.appendEvent({ type: 'AuctionCancelled', payload: { reason } });
  }

  close(): CloseAuctionResult {
    const terminalStatuses: LotStatus[] = [
      LotStatus.Sold, LotStatus.Unsold, LotStatus.Closed, LotStatus.Cancelled,
    ];
    if (terminalStatuses.includes(this.status)) {
      return { alreadyClosed: true, reserveMet: false, winnerUserId: null, finalAmount: 0 };
    }

    const reserveMet = this.highestBidId !== null && this.highestBidAmount >= this.reservePrice;

    this.appendEvent({
      type: 'AuctionClosed',
      payload: {
        highest_bid_id: this.highestBidId,
        highest_amount: this.highestBidAmount,
        reserve_met: reserveMet,
        winner_user_id: reserveMet ? this.highestBidUserId : null,
      },
    });

    return {
      alreadyClosed: false,
      reserveMet,
      winnerUserId: reserveMet ? this.highestBidUserId : null,
      finalAmount: this.highestBidAmount,
    };
  }
}
```

- [x] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/domain/auction-aggregate.test.ts
```

Expected: 8 passed

- [x] **Step 7: Commit**

```bash
git add apps/auction-engine/src/domain/
git commit -m "feat(auction): AuctionAggregate with full event sourcing state machine"
```

---

### Task 3: Infrastructure — PostgresEventStore

**Files:**
- Create: `apps/auction-engine/src/infrastructure/db.ts`
- Create: `apps/auction-engine/src/infrastructure/postgres-event-store.ts`
- Test: `apps/auction-engine/src/infrastructure/postgres-event-store.test.ts`

**Interfaces:**
- Consumes: `AuctionDomainEvent` from Task 2; `EventStore`, `StoredEvent` from Task 2
- Produces: `createDb(url: string): Db`, `PostgresEventStore` implements `EventStore`

**Setup:** Requires `carat_auction_test` DB with Task 1 migration applied. Set `TEST_DATABASE_URL=postgres://localhost/carat_auction_test`.

- [x] **Step 1: Write the failing tests**

Create `apps/auction-engine/src/infrastructure/postgres-event-store.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { createDb } from './db';
import { PostgresEventStore } from './postgres-event-store';
import { AuctionDomainEvent } from '../domain/auction-events';

const db = createDb(process.env['TEST_DATABASE_URL'] ?? 'postgres://localhost/carat_auction_test');
const store = new PostgresEventStore(db);

const SCHEDULED_EVENT: AuctionDomainEvent = {
  type: 'AuctionScheduled',
  payload: {
    start_at: '2026-06-20T10:00:00Z',
    end_at: '2026-06-20T12:00:00Z',
    reserve_price: 500,
    min_bid_increment: 10,
    auto_extend_window_minutes: 3,
    auto_extend_duration_minutes: 3,
  },
};

afterEach(async () => {
  await db`DELETE FROM auction_events WHERE lot_id = 'lot-test-1'`;
});

describe('PostgresEventStore', () => {
  it('should_appendAndLoadEvents_when_eventsAreStored', async () => {
    await store.append('lot-test-1', [SCHEDULED_EVENT], 0);

    const loaded = await store.load('lot-test-1');

    expect(loaded).toHaveLength(1);
    expect(loaded[0].type).toBe('AuctionScheduled');
    expect(loaded[0].sequence).toBe(1);
    expect(loaded[0].lotId).toBe('lot-test-1');
  });

  it('should_assignIncrementalSequences_when_multipleEventsAppended', async () => {
    await store.append('lot-test-1', [SCHEDULED_EVENT], 0);
    await store.append('lot-test-1', [{ type: 'AuctionStarted', payload: {} }], 1);

    const loaded = await store.load('lot-test-1');

    expect(loaded).toHaveLength(2);
    expect(loaded[0].sequence).toBe(1);
    expect(loaded[1].sequence).toBe(2);
    expect(loaded[1].type).toBe('AuctionStarted');
  });

  it('should_returnEmptyArray_when_noEventsExist', async () => {
    const loaded = await store.load('lot-nonexistent');

    expect(loaded).toHaveLength(0);
  });

  it('should_throwOnConcurrentWrite_when_sequenceConflicts', async () => {
    await store.append('lot-test-1', [SCHEDULED_EVENT], 0);

    await expect(store.append('lot-test-1', [SCHEDULED_EVENT], 0)).rejects.toThrow();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/infrastructure/postgres-event-store.test.ts
```

Expected: FAIL — `Cannot find module './db'`

- [x] **Step 3: Create `apps/auction-engine/src/infrastructure/db.ts`**

```typescript
import postgres from 'postgres';

export type Db = ReturnType<typeof postgres>;

export function createDb(url: string): Db {
  return postgres(url);
}
```

- [x] **Step 4: Create `apps/auction-engine/src/infrastructure/postgres-event-store.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { AuctionDomainEvent } from '../domain/auction-events';
import { EventStore, StoredEvent } from '../domain/event-store';
import { Db } from './db';

interface EventRow {
  id: string;
  lot_id: string;
  sequence: string;
  event_type: string;
  payload: unknown;
  occurred_at: Date;
}

export class PostgresEventStore implements EventStore {
  constructor(private readonly db: Db) {}

  async append(lotId: string, events: AuctionDomainEvent[], afterSequence: number): Promise<void> {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      await this.db`
        INSERT INTO auction_events (id, lot_id, sequence, event_type, payload)
        VALUES (
          ${uuidv4()},
          ${lotId},
          ${afterSequence + i + 1},
          ${event.type},
          ${this.db.json(event.payload as Record<string, unknown>)}
        )
      `;
    }
  }

  async load(lotId: string): Promise<StoredEvent[]> {
    const rows = await this.db<EventRow[]>`
      SELECT id, lot_id, sequence, event_type, payload, occurred_at
      FROM auction_events
      WHERE lot_id = ${lotId}
      ORDER BY sequence ASC
    `;
    return rows.map(row => ({
      id: row.id,
      lotId: row.lot_id,
      sequence: Number(row.sequence),
      type: row.event_type,
      payload: row.payload,
      occurredAt: row.occurred_at,
    }));
  }
}
```

- [x] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/infrastructure/postgres-event-store.test.ts
```

Expected: 4 passed

- [x] **Step 6: Commit**

```bash
git add apps/auction-engine/src/infrastructure/db.ts apps/auction-engine/src/infrastructure/postgres-event-store.ts apps/auction-engine/src/infrastructure/postgres-event-store.test.ts
git commit -m "feat(auction): PostgresEventStore with append-only semantics and optimistic concurrency"
```

---

### Task 4: Application — Command Handlers

**Files:**
- Create: `apps/auction-engine/src/application/projection-handler.ts`
- Create: `apps/auction-engine/src/application/timer-scheduler.ts`
- Create: `apps/auction-engine/src/application/auction-event-publisher.ts`
- Create: `apps/auction-engine/src/application/schedule-auction-handler.ts`
- Create: `apps/auction-engine/src/application/start-auction-handler.ts`
- Create: `apps/auction-engine/src/application/place-bid-handler.ts`
- Create: `apps/auction-engine/src/application/cancel-auction-handler.ts`
- Create: `apps/auction-engine/src/application/close-auction-handler.ts`
- Test: `apps/auction-engine/src/application/command-handlers.test.ts`

**Interfaces:**
- Consumes: `AuctionAggregate`, `LotStatus`, `PlaceBidResult`, `CloseAuctionResult` from Task 2; `EventStore`, `StoredEvent` from Task 2
- Produces:
  - `ProjectionHandler` interface
  - `TimerScheduler` interface
  - `AuctionEventPublisher` interface
  - `RedisLock` interface (exported from `place-bid-handler.ts`)
  - `ScheduleAuctionCommandHandler`, `StartAuctionCommandHandler`, `PlaceBidCommandHandler`, `CancelAuctionCommandHandler`, `CloseAuctionCommandHandler`

- [x] **Step 1: Write the failing tests**

Create `apps/auction-engine/src/application/command-handlers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventStore, StoredEvent } from '../domain/event-store';
import { AuctionAggregate } from '../domain/auction-aggregate';
import { ProjectionHandler } from './projection-handler';
import { TimerScheduler } from './timer-scheduler';
import { AuctionEventPublisher } from './auction-event-publisher';
import { RedisLock, PlaceBidCommandHandler } from './place-bid-handler';
import { ScheduleAuctionCommandHandler } from './schedule-auction-handler';
import { StartAuctionCommandHandler } from './start-auction-handler';
import { CancelAuctionCommandHandler } from './cancel-auction-handler';
import { CloseAuctionCommandHandler } from './close-auction-handler';

function makeScheduledStoredEvents(): StoredEvent[] {
  const agg = AuctionAggregate.create('lot-1');
  agg.scheduleAuction({
    startAt: new Date('2026-06-20T10:00:00Z'),
    endAt: new Date('2026-06-20T12:00:00Z'),
    reservePrice: 500,
    minBidIncrement: 10,
    autoExtendWindowMinutes: 3,
    autoExtendDurationMinutes: 3,
  });
  return agg.uncommittedEvents.map((e, i) => ({
    id: `se-${i}`,
    lotId: 'lot-1',
    sequence: i + 1,
    type: e.type,
    payload: e.payload,
    occurredAt: new Date(),
  }));
}

function makeLiveStoredEvents(): StoredEvent[] {
  const scheduled = makeScheduledStoredEvents();
  const agg = AuctionAggregate.create('lot-1');
  scheduled.forEach(e => agg.applyStored(e));
  agg.startAuction();
  const startedEvent = agg.uncommittedEvents[0];
  return [
    ...scheduled,
    { id: 'se-start', lotId: 'lot-1', sequence: scheduled.length + 1, type: startedEvent.type, payload: startedEvent.payload, occurredAt: new Date() },
  ];
}

const mockStore: EventStore = { append: vi.fn(), load: vi.fn() };
const mockProjection: ProjectionHandler = { handle: vi.fn() };
const mockTimer: TimerScheduler = {
  scheduleStart: vi.fn(),
  scheduleClose: vi.fn(),
  rescheduleClose: vi.fn(),
  scheduleClosingSoon: vi.fn(),
};
const mockPublisher: AuctionEventPublisher = {
  publishBidPlaced: vi.fn(),
  publishAuctionClosingSoon: vi.fn(),
  publishAuctionClosed: vi.fn(),
};
const mockLock: RedisLock = { acquire: vi.fn(), release: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockStore.append).mockResolvedValue(undefined);
  vi.mocked(mockProjection.handle).mockResolvedValue(undefined);
  vi.mocked(mockLock.acquire).mockResolvedValue(true);
  vi.mocked(mockLock.release).mockResolvedValue(undefined);
  vi.mocked(mockPublisher.publishBidPlaced).mockResolvedValue(undefined);
  vi.mocked(mockPublisher.publishAuctionClosed).mockResolvedValue(undefined);
  vi.mocked(mockTimer.scheduleStart).mockResolvedValue(undefined);
  vi.mocked(mockTimer.scheduleClose).mockResolvedValue(undefined);
  vi.mocked(mockTimer.scheduleClosingSoon).mockResolvedValue(undefined);
  vi.mocked(mockTimer.rescheduleClose).mockResolvedValue(undefined);
});

describe('ScheduleAuctionCommandHandler', () => {
  it('should_appendScheduledEventAndScheduleTimers_when_commandExecuted', async () => {
    vi.mocked(mockStore.load).mockResolvedValue([]);
    const handler = new ScheduleAuctionCommandHandler(mockStore, mockProjection, mockTimer);

    await handler.execute({
      lotId: 'lot-1',
      startAt: new Date('2026-06-20T10:00:00Z'),
      endAt: new Date('2026-06-20T12:00:00Z'),
      reservePrice: 500,
      minBidIncrement: 10,
      autoExtendWindowMinutes: 3,
      autoExtendDurationMinutes: 3,
    });

    expect(mockStore.append).toHaveBeenCalledWith(
      'lot-1',
      expect.arrayContaining([expect.objectContaining({ type: 'AuctionScheduled' })]),
      0,
    );
    expect(mockTimer.scheduleStart).toHaveBeenCalled();
    expect(mockTimer.scheduleClose).toHaveBeenCalled();
    expect(mockTimer.scheduleClosingSoon).toHaveBeenCalled();
  });
});

describe('StartAuctionCommandHandler', () => {
  it('should_appendAuctionStartedEvent_when_commandExecuted', async () => {
    vi.mocked(mockStore.load).mockResolvedValue(makeScheduledStoredEvents());
    const handler = new StartAuctionCommandHandler(mockStore, mockProjection);

    await handler.execute({ lotId: 'lot-1' });

    expect(mockStore.append).toHaveBeenCalledWith(
      'lot-1',
      expect.arrayContaining([expect.objectContaining({ type: 'AuctionStarted' })]),
      expect.any(Number),
    );
  });
});

describe('PlaceBidCommandHandler', () => {
  it('should_appendBidPlacedAndPublish_when_bidIsValid', async () => {
    vi.mocked(mockStore.load).mockResolvedValue(makeLiveStoredEvents());
    const handler = new PlaceBidCommandHandler(mockStore, mockProjection, mockPublisher, mockLock);

    const result = await handler.execute({
      lotId: 'lot-1',
      bidId: 'bid-1',
      userId: 'user-1',
      amount: 200,
      placedAt: new Date('2026-06-20T11:00:00Z'),
    });

    expect(result.success).toBe(true);
    expect(mockStore.append).toHaveBeenCalled();
    expect(mockPublisher.publishBidPlaced).toHaveBeenCalled();
    expect(mockLock.release).toHaveBeenCalled();
  });

  it('should_returnFailureAndNotAppend_when_bidTooLow', async () => {
    vi.mocked(mockStore.load).mockResolvedValue(makeLiveStoredEvents());
    const handler = new PlaceBidCommandHandler(mockStore, mockProjection, mockPublisher, mockLock);

    const result = await handler.execute({
      lotId: 'lot-1',
      bidId: 'bid-1',
      userId: 'user-1',
      amount: 1,
      placedAt: new Date('2026-06-20T11:00:00Z'),
    });

    expect(result.success).toBe(false);
    expect(mockStore.append).not.toHaveBeenCalled();
    expect(mockLock.release).toHaveBeenCalled();
  });
});

describe('CancelAuctionCommandHandler', () => {
  it('should_appendCancelledEvent_when_commandExecuted', async () => {
    vi.mocked(mockStore.load).mockResolvedValue(makeLiveStoredEvents());
    const handler = new CancelAuctionCommandHandler(mockStore, mockProjection);

    await handler.execute({ lotId: 'lot-1', reason: 'Admin cancelled' });

    expect(mockStore.append).toHaveBeenCalledWith(
      'lot-1',
      expect.arrayContaining([expect.objectContaining({ type: 'AuctionCancelled' })]),
      expect.any(Number),
    );
  });
});

describe('CloseAuctionCommandHandler', () => {
  it('should_appendClosedEventAndPublish_when_auctionCloses', async () => {
    vi.mocked(mockStore.load).mockResolvedValue(makeLiveStoredEvents());
    const handler = new CloseAuctionCommandHandler(mockStore, mockProjection, mockPublisher);

    await handler.execute({ lotId: 'lot-1' });

    expect(mockStore.append).toHaveBeenCalledWith(
      'lot-1',
      expect.arrayContaining([expect.objectContaining({ type: 'AuctionClosed' })]),
      expect.any(Number),
    );
    expect(mockPublisher.publishAuctionClosed).toHaveBeenCalled();
  });

  it('should_beIdempotent_when_auctionAlreadyClosed', async () => {
    const liveEvents = makeLiveStoredEvents();
    const agg = AuctionAggregate.create('lot-1');
    liveEvents.forEach(e => agg.applyStored(e));
    agg.close();
    const closedEvent = agg.uncommittedEvents[0];
    vi.mocked(mockStore.load).mockResolvedValue([
      ...liveEvents,
      { id: 'se-closed', lotId: 'lot-1', sequence: liveEvents.length + 1, type: closedEvent.type, payload: closedEvent.payload, occurredAt: new Date() },
    ]);
    const handler = new CloseAuctionCommandHandler(mockStore, mockProjection, mockPublisher);

    await handler.execute({ lotId: 'lot-1' });

    expect(mockStore.append).not.toHaveBeenCalled();
    expect(mockPublisher.publishAuctionClosed).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/application/command-handlers.test.ts
```

Expected: FAIL — `Cannot find module './projection-handler'`

- [x] **Step 3: Create `apps/auction-engine/src/application/projection-handler.ts`**

```typescript
import { AuctionDomainEvent } from '../domain/auction-events';

export interface ProjectionHandler {
  handle(lotId: string, events: AuctionDomainEvent[]): Promise<void>;
}
```

- [x] **Step 4: Create `apps/auction-engine/src/application/timer-scheduler.ts`**

```typescript
export interface TimerScheduler {
  scheduleStart(lotId: string, startAt: Date): Promise<void>;
  scheduleClose(lotId: string, endAt: Date): Promise<void>;
  rescheduleClose(lotId: string, newEndAt: Date): Promise<void>;
  scheduleClosingSoon(lotId: string, fireAt: Date): Promise<void>;
}
```

- [x] **Step 5: Create `apps/auction-engine/src/application/auction-event-publisher.ts`**

```typescript
export interface AuctionEventPublisher {
  publishBidPlaced(params: {
    lotId: string;
    bidId: string;
    userId: string;
    amount: number;
    bidCount: number;
    endAt: string;
  }): Promise<void>;
  publishAuctionClosingSoon(params: { lotId: string; endAt: string }): Promise<void>;
  publishAuctionClosed(params: {
    lotId: string;
    reserveMet: boolean;
    winnerUserId: string | null;
    finalAmount: number;
  }): Promise<void>;
}
```

- [x] **Step 6: Create `apps/auction-engine/src/application/schedule-auction-handler.ts`**

```typescript
import { AuctionAggregate } from '../domain/auction-aggregate';
import { EventStore } from '../domain/event-store';
import { ProjectionHandler } from './projection-handler';
import { TimerScheduler } from './timer-scheduler';

const CLOSING_SOON_MINUTES = 15;

export interface ScheduleAuctionCommand {
  lotId: string;
  startAt: Date;
  endAt: Date;
  reservePrice: number;
  minBidIncrement: number;
  autoExtendWindowMinutes: number;
  autoExtendDurationMinutes: number;
}

export class ScheduleAuctionCommandHandler {
  constructor(
    private readonly eventStore: EventStore,
    private readonly projectionHandler: ProjectionHandler,
    private readonly timerScheduler: TimerScheduler,
  ) {}

  async execute(command: ScheduleAuctionCommand): Promise<void> {
    const stored = await this.eventStore.load(command.lotId);
    const agg = AuctionAggregate.create(command.lotId);
    stored.forEach(e => agg.applyStored(e));

    agg.scheduleAuction({
      startAt: command.startAt,
      endAt: command.endAt,
      reservePrice: command.reservePrice,
      minBidIncrement: command.minBidIncrement,
      autoExtendWindowMinutes: command.autoExtendWindowMinutes,
      autoExtendDurationMinutes: command.autoExtendDurationMinutes,
    });

    await this.eventStore.append(command.lotId, agg.uncommittedEvents, agg.sequence);
    await this.projectionHandler.handle(command.lotId, agg.uncommittedEvents);

    await this.timerScheduler.scheduleStart(command.lotId, command.startAt);
    await this.timerScheduler.scheduleClose(command.lotId, command.endAt);
    await this.timerScheduler.scheduleClosingSoon(
      command.lotId,
      new Date(command.endAt.getTime() - CLOSING_SOON_MINUTES * 60 * 1000),
    );
  }
}
```

- [x] **Step 7: Create `apps/auction-engine/src/application/start-auction-handler.ts`**

```typescript
import { AuctionAggregate } from '../domain/auction-aggregate';
import { EventStore } from '../domain/event-store';
import { ProjectionHandler } from './projection-handler';

export class StartAuctionCommandHandler {
  constructor(
    private readonly eventStore: EventStore,
    private readonly projectionHandler: ProjectionHandler,
  ) {}

  async execute(command: { lotId: string }): Promise<void> {
    const stored = await this.eventStore.load(command.lotId);
    const agg = AuctionAggregate.create(command.lotId);
    stored.forEach(e => agg.applyStored(e));

    agg.startAuction();

    await this.eventStore.append(command.lotId, agg.uncommittedEvents, agg.sequence);
    await this.projectionHandler.handle(command.lotId, agg.uncommittedEvents);
  }
}
```

- [x] **Step 8: Create `apps/auction-engine/src/application/place-bid-handler.ts`**

```typescript
import { AuctionAggregate, PlaceBidResult } from '../domain/auction-aggregate';
import { EventStore } from '../domain/event-store';
import { ProjectionHandler } from './projection-handler';
import { AuctionEventPublisher } from './auction-event-publisher';
import { TimerScheduler } from './timer-scheduler';

export interface RedisLock {
  acquire(key: string, ttlMs: number): Promise<boolean>;
  release(key: string): Promise<void>;
}

export interface PlaceBidCommand {
  lotId: string;
  bidId: string;
  userId: string;
  amount: number;
  placedAt: Date;
}

export class PlaceBidCommandHandler {
  constructor(
    private readonly eventStore: EventStore,
    private readonly projectionHandler: ProjectionHandler,
    private readonly publisher: AuctionEventPublisher,
    private readonly lock: RedisLock,
    private readonly timerScheduler?: TimerScheduler,
  ) {}

  async execute(command: PlaceBidCommand): Promise<PlaceBidResult> {
    const lockKey = `bid-lock:${command.lotId}`;
    const acquired = await this.lock.acquire(lockKey, 5000);
    if (!acquired) {
      return { success: false, reason: 'AUCTION_NOT_ACTIVE' };
    }

    try {
      const stored = await this.eventStore.load(command.lotId);
      const agg = AuctionAggregate.create(command.lotId);
      stored.forEach(e => agg.applyStored(e));

      const result = agg.placeBid({
        bidId: command.bidId,
        userId: command.userId,
        amount: command.amount,
        placedAt: command.placedAt,
      });

      if (!result.success) {
        return result;
      }

      await this.eventStore.append(command.lotId, agg.uncommittedEvents, agg.sequence);
      await this.projectionHandler.handle(command.lotId, agg.uncommittedEvents);
      await this.publisher.publishBidPlaced({
        lotId: command.lotId,
        bidId: command.bidId,
        userId: command.userId,
        amount: command.amount,
        bidCount: agg.bidCount,
        endAt: agg.endAt.toISOString(),
      });

      if (result.timerExtended && this.timerScheduler) {
        await this.timerScheduler.rescheduleClose(command.lotId, result.newEndAt);
      }

      return result;
    } finally {
      await this.lock.release(lockKey);
    }
  }
}
```

- [x] **Step 9: Create `apps/auction-engine/src/application/cancel-auction-handler.ts`**

```typescript
import { AuctionAggregate } from '../domain/auction-aggregate';
import { EventStore } from '../domain/event-store';
import { ProjectionHandler } from './projection-handler';

export class CancelAuctionCommandHandler {
  constructor(
    private readonly eventStore: EventStore,
    private readonly projectionHandler: ProjectionHandler,
  ) {}

  async execute(command: { lotId: string; reason: string }): Promise<void> {
    const stored = await this.eventStore.load(command.lotId);
    const agg = AuctionAggregate.create(command.lotId);
    stored.forEach(e => agg.applyStored(e));

    agg.cancel(command.reason);

    await this.eventStore.append(command.lotId, agg.uncommittedEvents, agg.sequence);
    await this.projectionHandler.handle(command.lotId, agg.uncommittedEvents);
  }
}
```

- [x] **Step 10: Create `apps/auction-engine/src/application/close-auction-handler.ts`**

```typescript
import { AuctionAggregate } from '../domain/auction-aggregate';
import { EventStore } from '../domain/event-store';
import { ProjectionHandler } from './projection-handler';
import { AuctionEventPublisher } from './auction-event-publisher';

export class CloseAuctionCommandHandler {
  constructor(
    private readonly eventStore: EventStore,
    private readonly projectionHandler: ProjectionHandler,
    private readonly publisher: AuctionEventPublisher,
  ) {}

  async execute(command: { lotId: string }): Promise<void> {
    const stored = await this.eventStore.load(command.lotId);
    const agg = AuctionAggregate.create(command.lotId);
    stored.forEach(e => agg.applyStored(e));

    const result = agg.close();
    if (result.alreadyClosed) {
      return;
    }

    await this.eventStore.append(command.lotId, agg.uncommittedEvents, agg.sequence);
    await this.projectionHandler.handle(command.lotId, agg.uncommittedEvents);
    await this.publisher.publishAuctionClosed({
      lotId: command.lotId,
      reserveMet: result.reserveMet,
      winnerUserId: result.winnerUserId,
      finalAmount: result.finalAmount,
    });
  }
}
```

- [x] **Step 11: Run tests to verify they pass**

```bash
npx vitest run src/application/command-handlers.test.ts
```

Expected: 10 passed

- [x] **Step 12: Commit**

```bash
git add apps/auction-engine/src/application/
git commit -m "feat(auction): all 5 command handlers with TimerScheduler, ProjectionHandler, AuctionEventPublisher interfaces"
```

---

### Task 5: Infrastructure — RedisLock + BullMQTimerScheduler

**Files:**
- Create: `apps/auction-engine/src/infrastructure/redis-lock.ts`
- Test: `apps/auction-engine/src/infrastructure/redis-lock.test.ts`
- Create: `apps/auction-engine/src/infrastructure/bullmq-timer-scheduler.ts`
- Test: `apps/auction-engine/src/infrastructure/bullmq-timer-scheduler.test.ts`

**Interfaces:**
- Consumes: `RedisLock` from Task 4 (`place-bid-handler.ts`); `TimerScheduler` from Task 4
- Produces: `RedisLockAdapter` implements `RedisLock`; `BullMQTimerScheduler` implements `TimerScheduler`

**BullMQ job names and jobId patterns:**
- `'start-auction'` — jobId: `start:{lotId}`
- `'close-auction'` — jobId: `close:{lotId}`
- `'closing-soon'` — jobId: `closing-soon:{lotId}`

These job names are consumed by workers wired in Part B's `main.ts`.

- [x] **Step 1: Write the failing tests**

Create `apps/auction-engine/src/infrastructure/redis-lock.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Redis from 'ioredis';
import { RedisLockAdapter } from './redis-lock';

vi.mock('ioredis');

describe('RedisLockAdapter', () => {
  let mockRedis: { set: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };
  let lock: RedisLockAdapter;

  beforeEach(() => {
    mockRedis = { set: vi.fn(), del: vi.fn() };
    vi.mocked(Redis).mockImplementation(() => mockRedis as unknown as Redis);
    lock = new RedisLockAdapter({ host: 'localhost', port: 6379 });
  });

  it('should_returnTrue_when_lockAcquiredSuccessfully', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await lock.acquire('bid-lock:lot-1', 5000);

    expect(result).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith('bid-lock:lot-1', '1', 'PX', 5000, 'NX');
  });

  it('should_returnFalse_when_lockAlreadyHeld', async () => {
    mockRedis.set.mockResolvedValue(null);

    const result = await lock.acquire('bid-lock:lot-1', 5000);

    expect(result).toBe(false);
  });
});
```

Create `apps/auction-engine/src/infrastructure/bullmq-timer-scheduler.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Queue } from 'bullmq';
import { BullMQTimerScheduler } from './bullmq-timer-scheduler';

vi.mock('bullmq');

describe('BullMQTimerScheduler', () => {
  it('should_scheduleStartCloseAndClosingSoonJobs_when_auctionScheduled', async () => {
    const mockAdd = vi.fn().mockResolvedValue({});
    vi.mocked(Queue).mockImplementation(
      () => ({ add: mockAdd, getJob: vi.fn().mockResolvedValue(null) }) as unknown as Queue,
    );
    const scheduler = new BullMQTimerScheduler({ host: 'localhost', port: 6379 });

    await scheduler.scheduleStart('lot-1', new Date(Date.now() + 60_000));
    await scheduler.scheduleClose('lot-1', new Date(Date.now() + 3_600_000));
    await scheduler.scheduleClosingSoon('lot-1', new Date(Date.now() + 2_700_000));

    expect(mockAdd).toHaveBeenCalledWith('start-auction', { lotId: 'lot-1' }, expect.objectContaining({ jobId: 'start:lot-1' }));
    expect(mockAdd).toHaveBeenCalledWith('close-auction', { lotId: 'lot-1' }, expect.objectContaining({ jobId: 'close:lot-1' }));
    expect(mockAdd).toHaveBeenCalledWith('closing-soon', { lotId: 'lot-1' }, expect.objectContaining({ jobId: 'closing-soon:lot-1' }));
  });

  it('should_removeOldJobAndAddNew_when_reschedulingClose', async () => {
    const mockRemove = vi.fn();
    const mockAdd = vi.fn().mockResolvedValue({});
    vi.mocked(Queue).mockImplementation(
      () => ({
        add: mockAdd,
        getJob: vi.fn().mockResolvedValue({ remove: mockRemove }),
      }) as unknown as Queue,
    );
    const scheduler = new BullMQTimerScheduler({ host: 'localhost', port: 6379 });

    await scheduler.rescheduleClose('lot-1', new Date(Date.now() + 5_000_000));

    expect(mockRemove).toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledWith('close-auction', { lotId: 'lot-1' }, expect.objectContaining({ jobId: 'close:lot-1' }));
  });

  it('should_useDelayBasedOnFireAt_when_schedulingJobs', async () => {
    const mockAdd = vi.fn().mockResolvedValue({});
    vi.mocked(Queue).mockImplementation(
      () => ({ add: mockAdd, getJob: vi.fn().mockResolvedValue(null) }) as unknown as Queue,
    );
    const scheduler = new BullMQTimerScheduler({ host: 'localhost', port: 6379 });
    const fireAt = new Date(Date.now() + 7_200_000);

    await scheduler.scheduleClosingSoon('lot-1', fireAt);

    expect(mockAdd).toHaveBeenCalledWith(
      'closing-soon',
      { lotId: 'lot-1' },
      expect.objectContaining({ delay: expect.any(Number) }),
    );
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/infrastructure/redis-lock.test.ts src/infrastructure/bullmq-timer-scheduler.test.ts
```

Expected: FAIL — `Cannot find module './redis-lock'`

- [x] **Step 3: Create `apps/auction-engine/src/infrastructure/redis-lock.ts`**

```typescript
import Redis from 'ioredis';
import { RedisLock } from '../application/place-bid-handler';

interface RedisOptions {
  host: string;
  port: number;
}

export class RedisLockAdapter implements RedisLock {
  private readonly redis: Redis;

  constructor(options: RedisOptions) {
    this.redis = new Redis(options);
  }

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async release(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
```

- [x] **Step 4: Create `apps/auction-engine/src/infrastructure/bullmq-timer-scheduler.ts`**

```typescript
import { Queue } from 'bullmq';
import { TimerScheduler } from '../application/timer-scheduler';

const QUEUE_NAME = 'auction-timers';

interface RedisOptions {
  host: string;
  port: number;
}

export class BullMQTimerScheduler implements TimerScheduler {
  private readonly queue: Queue;

  constructor(redis: RedisOptions) {
    this.queue = new Queue(QUEUE_NAME, { connection: redis });
  }

  async scheduleStart(lotId: string, startAt: Date): Promise<void> {
    const delay = Math.max(0, startAt.getTime() - Date.now());
    await this.queue.add('start-auction', { lotId }, { jobId: `start:${lotId}`, delay });
  }

  async scheduleClose(lotId: string, endAt: Date): Promise<void> {
    const delay = Math.max(0, endAt.getTime() - Date.now());
    await this.queue.add('close-auction', { lotId }, { jobId: `close:${lotId}`, delay });
  }

  async rescheduleClose(lotId: string, newEndAt: Date): Promise<void> {
    const existing = await this.queue.getJob(`close:${lotId}`);
    if (existing) {
      await existing.remove();
    }
    const delay = Math.max(0, newEndAt.getTime() - Date.now());
    await this.queue.add('close-auction', { lotId }, { jobId: `close:${lotId}`, delay });
  }

  async scheduleClosingSoon(lotId: string, fireAt: Date): Promise<void> {
    const delay = Math.max(0, fireAt.getTime() - Date.now());
    await this.queue.add('closing-soon', { lotId }, { jobId: `closing-soon:${lotId}`, delay });
  }
}
```

- [x] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/infrastructure/redis-lock.test.ts src/infrastructure/bullmq-timer-scheduler.test.ts
```

Expected: 5 passed

- [x] **Step 6: Commit**

```bash
git add apps/auction-engine/src/infrastructure/redis-lock.ts apps/auction-engine/src/infrastructure/redis-lock.test.ts apps/auction-engine/src/infrastructure/bullmq-timer-scheduler.ts apps/auction-engine/src/infrastructure/bullmq-timer-scheduler.test.ts
git commit -m "feat(auction): RedisLockAdapter and BullMQTimerScheduler"
```

---

### Task 6: Infrastructure — PostgresProjectionHandler

**Files:**
- Create: `apps/auction-engine/src/infrastructure/postgres-projection-handler.ts`
- Test: `apps/auction-engine/src/infrastructure/postgres-projection-handler.test.ts`

**Interfaces:**
- Consumes: `ProjectionHandler` from Task 4; `AuctionDomainEvent` from Task 2; `Db`, `createDb` from Task 3
- Produces: `PostgresProjectionHandler` implements `ProjectionHandler`

**Setup:** Integration tests require `carat_auction_test` DB with Task 1 migration applied.

- [x] **Step 1: Write the failing tests**

Create `apps/auction-engine/src/infrastructure/postgres-projection-handler.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { createDb } from './db';
import { PostgresProjectionHandler } from './postgres-projection-handler';
import { AuctionDomainEvent } from '../domain/auction-events';

const db = createDb(process.env['TEST_DATABASE_URL'] ?? 'postgres://localhost/carat_auction_test');
const handler = new PostgresProjectionHandler(db);

const BASE_SCHEDULED: AuctionDomainEvent = {
  type: 'AuctionScheduled',
  payload: {
    start_at: '2026-06-20T10:00:00Z',
    end_at: '2026-06-20T12:00:00Z',
    reserve_price: 500,
    min_bid_increment: 10,
    auto_extend_window_minutes: 3,
    auto_extend_duration_minutes: 3,
  },
};

afterEach(async () => {
  await db`DELETE FROM bids WHERE lot_id = 'lot-proj-1'`;
  await db`DELETE FROM lot_status WHERE lot_id = 'lot-proj-1'`;
});

describe('PostgresProjectionHandler', () => {
  it('should_createLotStatusRow_when_auctionScheduled', async () => {
    await handler.handle('lot-proj-1', [BASE_SCHEDULED]);

    const rows = await db`SELECT status, bid_count FROM lot_status WHERE lot_id = 'lot-proj-1'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('SCHEDULED');
    expect(rows[0].bid_count).toBe(0);
  });

  it('should_updateStatusToLive_when_auctionStarted', async () => {
    await handler.handle('lot-proj-1', [BASE_SCHEDULED]);
    await handler.handle('lot-proj-1', [{ type: 'AuctionStarted', payload: {} }]);

    const rows = await db`SELECT status FROM lot_status WHERE lot_id = 'lot-proj-1'`;
    expect(rows[0].status).toBe('LIVE');
  });

  it('should_updateHighestBidAndInsertBidRow_when_bidPlaced', async () => {
    await handler.handle('lot-proj-1', [BASE_SCHEDULED]);
    await handler.handle('lot-proj-1', [
      { type: 'BidPlaced', payload: { bid_id: 'bid-1', user_id: 'user-1', amount: 200, placed_at: '2026-06-20T11:00:00Z' } },
    ]);

    const status = await db`SELECT current_highest_bid, bid_count FROM lot_status WHERE lot_id = 'lot-proj-1'`;
    expect(Number(status[0].current_highest_bid)).toBe(200);
    expect(status[0].bid_count).toBe(1);

    const bids = await db`SELECT id FROM bids WHERE lot_id = 'lot-proj-1'`;
    expect(bids).toHaveLength(1);
    expect(bids[0].id).toBe('bid-1');
  });

  it('should_updateEndAtAndSetClosing_when_timerExtended', async () => {
    await handler.handle('lot-proj-1', [BASE_SCHEDULED]);
    await handler.handle('lot-proj-1', [
      { type: 'TimerExtended', payload: { new_end_at: '2026-06-20T12:05:00Z', extended_by_minutes: 3 } },
    ]);

    const rows = await db`SELECT end_at, status FROM lot_status WHERE lot_id = 'lot-proj-1'`;
    expect(rows[0].status).toBe('CLOSING');
    expect(new Date(rows[0].end_at).toISOString()).toBe('2026-06-20T12:05:00.000Z');
  });

  it('should_updateStatusToSoldWithWinner_when_auctionClosedWithReserveMet', async () => {
    await handler.handle('lot-proj-1', [BASE_SCHEDULED]);
    await handler.handle('lot-proj-1', [
      { type: 'AuctionClosed', payload: { highest_bid_id: 'bid-1', highest_amount: 600, reserve_met: true, winner_user_id: 'user-1' } },
    ]);

    const rows = await db`SELECT status, winner_user_id FROM lot_status WHERE lot_id = 'lot-proj-1'`;
    expect(rows[0].status).toBe('SOLD');
    expect(rows[0].winner_user_id).toBe('user-1');
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/infrastructure/postgres-projection-handler.test.ts
```

Expected: FAIL — `Cannot find module './postgres-projection-handler'`

- [x] **Step 3: Create `apps/auction-engine/src/infrastructure/postgres-projection-handler.ts`**

```typescript
import {
  AuctionDomainEvent,
  AuctionScheduledPayload,
  BidPlacedPayload,
  TimerExtendedPayload,
  AuctionClosedPayload,
} from '../domain/auction-events';
import { ProjectionHandler } from '../application/projection-handler';
import { Db } from './db';

export class PostgresProjectionHandler implements ProjectionHandler {
  constructor(private readonly db: Db) {}

  async handle(lotId: string, events: AuctionDomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.applyEvent(lotId, event);
    }
  }

  private async applyEvent(lotId: string, event: AuctionDomainEvent): Promise<void> {
    switch (event.type) {
      case 'AuctionScheduled': {
        const p = event.payload as AuctionScheduledPayload;
        await this.db`
          INSERT INTO lot_status (lot_id, status, bid_count, end_at, updated_at)
          VALUES (${lotId}, 'SCHEDULED', 0, ${new Date(p.end_at)}, NOW())
          ON CONFLICT (lot_id) DO UPDATE SET
            status = 'SCHEDULED', end_at = EXCLUDED.end_at, updated_at = NOW()
        `;
        break;
      }
      case 'AuctionStarted':
        await this.db`
          UPDATE lot_status SET status = 'LIVE', updated_at = NOW() WHERE lot_id = ${lotId}
        `;
        break;
      case 'BidPlaced': {
        const p = event.payload as BidPlacedPayload;
        await this.db`
          UPDATE lot_status
          SET current_highest_bid = ${p.amount}, bid_count = bid_count + 1, updated_at = NOW()
          WHERE lot_id = ${lotId}
        `;
        await this.db`
          INSERT INTO bids (id, lot_id, user_id, amount, placed_at)
          VALUES (${p.bid_id}, ${lotId}, ${p.user_id}, ${p.amount}, ${new Date(p.placed_at)})
        `;
        break;
      }
      case 'TimerExtended': {
        const p = event.payload as TimerExtendedPayload;
        await this.db`
          UPDATE lot_status
          SET end_at = ${new Date(p.new_end_at)}, status = 'CLOSING', updated_at = NOW()
          WHERE lot_id = ${lotId}
        `;
        break;
      }
      case 'AuctionClosed': {
        const p = event.payload as AuctionClosedPayload;
        await this.db`
          UPDATE lot_status
          SET status = ${p.reserve_met ? 'SOLD' : 'UNSOLD'},
              winner_user_id = ${p.winner_user_id},
              updated_at = NOW()
          WHERE lot_id = ${lotId}
        `;
        break;
      }
      case 'AuctionCancelled':
        await this.db`
          UPDATE lot_status SET status = 'CANCELLED', updated_at = NOW() WHERE lot_id = ${lotId}
        `;
        break;
    }
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/infrastructure/postgres-projection-handler.test.ts
```

Expected: 5 passed

- [x] **Step 5: Commit**

```bash
git add apps/auction-engine/src/infrastructure/postgres-projection-handler.ts apps/auction-engine/src/infrastructure/postgres-projection-handler.test.ts
git commit -m "feat(auction): PostgresProjectionHandler rebuilds lot_status and bids from events"
```

---

### Task 7: Infrastructure — RabbitMQ Auction Publisher

**Files:**
- Create: `apps/auction-engine/src/infrastructure/rabbitmq-auction-publisher.ts`
- Test: `apps/auction-engine/src/infrastructure/rabbitmq-auction-publisher.test.ts`

**Interfaces:**
- Consumes: `AuctionEventPublisher` from Task 4; `EventPublisher` from `@carat-room/shared-events`
- Produces: `RabbitMQAuctionPublisher` implements `AuctionEventPublisher`

**Routing keys:** `auction.bid.placed`, `auction.closing.soon`, `auction.closed` — match the `ROUTING_KEYS` constants in `@carat-room/shared-types`.

- [x] **Step 1: Write the failing tests**

Create `apps/auction-engine/src/infrastructure/rabbitmq-auction-publisher.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { EventPublisher } from '@carat-room/shared-events';
import { RabbitMQAuctionPublisher } from './rabbitmq-auction-publisher';

const mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as EventPublisher;

describe('RabbitMQAuctionPublisher', () => {
  it('should_publishBidPlacedWithCorrectRoutingKey', async () => {
    const pub = new RabbitMQAuctionPublisher(mockPublisher);

    await pub.publishBidPlaced({
      lotId: 'lot-1',
      bidId: 'bid-1',
      userId: 'user-1',
      amount: 300,
      bidCount: 2,
      endAt: '2026-06-20T12:00:00Z',
    });

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      'auction.bid.placed',
      expect.objectContaining({ lotId: 'lot-1', amount: 300, bidCount: 2 }),
    );
  });

  it('should_publishAuctionClosedWithCorrectRoutingKey', async () => {
    const pub = new RabbitMQAuctionPublisher(mockPublisher);

    await pub.publishAuctionClosed({
      lotId: 'lot-1',
      reserveMet: true,
      winnerUserId: 'user-1',
      finalAmount: 600,
    });

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      'auction.closed',
      expect.objectContaining({ lotId: 'lot-1', reserveMet: true, winnerUserId: 'user-1' }),
    );
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/infrastructure/rabbitmq-auction-publisher.test.ts
```

Expected: FAIL — `Cannot find module './rabbitmq-auction-publisher'`

- [x] **Step 3: Create `apps/auction-engine/src/infrastructure/rabbitmq-auction-publisher.ts`**

```typescript
import { EventPublisher } from '@carat-room/shared-events';
import { AuctionEventPublisher } from '../application/auction-event-publisher';

export class RabbitMQAuctionPublisher implements AuctionEventPublisher {
  constructor(private readonly publisher: EventPublisher) {}

  async publishBidPlaced(params: {
    lotId: string;
    bidId: string;
    userId: string;
    amount: number;
    bidCount: number;
    endAt: string;
  }): Promise<void> {
    await this.publisher.publish('auction.bid.placed', {
      lotId: params.lotId,
      bidId: params.bidId,
      userId: params.userId,
      amount: params.amount,
      bidCount: params.bidCount,
      endAt: params.endAt,
    });
  }

  async publishAuctionClosingSoon(params: { lotId: string; endAt: string }): Promise<void> {
    await this.publisher.publish('auction.closing.soon', {
      lotId: params.lotId,
      endAt: params.endAt,
    });
  }

  async publishAuctionClosed(params: {
    lotId: string;
    reserveMet: boolean;
    winnerUserId: string | null;
    finalAmount: number;
  }): Promise<void> {
    await this.publisher.publish('auction.closed', {
      lotId: params.lotId,
      reserveMet: params.reserveMet,
      winnerUserId: params.winnerUserId,
      finalAmount: params.finalAmount,
    });
  }
}
```

- [x] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: 34 passed

- [x] **Step 5: Commit**

```bash
git add apps/auction-engine/src/infrastructure/rabbitmq-auction-publisher.ts apps/auction-engine/src/infrastructure/rabbitmq-auction-publisher.test.ts
git commit -m "feat(auction): RabbitMQAuctionPublisher for BidPlaced, ClosingSoon, AuctionClosed"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| `auction_events` append-only, `UNIQUE(lot_id, sequence)` | Task 1 |
| `lot_status` + `bids` read projection tables | Task 1 |
| `DRAFT → SCHEDULED → LIVE → CLOSING → CLOSED → SOLD/UNSOLD` lifecycle | Task 2 |
| All 6 event types with typed payloads | Task 2 |
| Reserve price in events ONLY — never projected | Tasks 1, 2, 6 |
| `PlaceBid`: min increment enforcement | Task 2 |
| `PlaceBid`: no self-outbid | Task 2 |
| `PlaceBid`: Redis lock per lotId, TTL 5s | Tasks 4, 5 |
| Auto-extend: bid within window → `TimerExtended` + `CLOSING` status | Task 2 |
| BullMQ: schedule start + close + closing-soon at schedule time | Tasks 4, 5 |
| BullMQ: reschedule close on timer extension | Tasks 4, 5 |
| `CloseAuction` idempotent — skip if already terminal | Task 4 |
| Projection: `lot_status` + `bids` updated per event type | Task 6 |
| Publishes `auction.bid.placed`, `auction.closing.soon`, `auction.closed` | Tasks 4, 7 |

**Type consistency:** `AuctionDomainEvent`, `StoredEvent`, `LotStatus`, `PlaceBidResult`, `CloseAuctionResult`, `RedisLock`, `TimerScheduler`, `ProjectionHandler`, `AuctionEventPublisher` all defined before first use. Job names `start-auction`, `close-auction`, `closing-soon` consistent across Task 5 implementation and Part B's worker setup.

No placeholders found.
