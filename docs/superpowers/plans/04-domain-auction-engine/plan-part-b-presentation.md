# Auction Engine — Part B: HTTP Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the HTTP presentation layer for the Auction Engine — query use cases, Hono router (5 endpoints + SSE), in-memory SSE broadcaster, BullMQ job processor, and `main.ts` wiring.

**Architecture:** Three layers added on top of Part A's core. (1) Query use cases read from the `lot_status` and `bids` projection tables via `LotQueryRepository`. (2) `InMemorySseBroadcaster` holds live SSE connections per lot; the POST `/bids` handler and BullMQ worker push events to subscribed clients. (3) `BullMQAuctionWorker` processes `start-auction`, `close-auction`, and `closing-soon` jobs, bridging Part A's command handlers to SSE broadcasts and RabbitMQ notifications. `main.ts` composes all dependencies and starts the HTTP server on port 3002.

**Tech Stack:** Hono + `@hono/node-server`, `hono/streaming` (streamSSE), postgres.js, ioredis, BullMQ, amqplib, `@carat-room/shared-auth`, `@carat-room/shared-events`, Vitest.

## Global Constraints

- Node.js 20, TypeScript 5.4, strict mode
- postgres.js for DB — no ORM
- Vitest for all tests — no Jest
- Named exports only — no `export default` (exception: `vitest.config.ts`)
- Single quotes for strings; `const`/`let` only — no `var`
- Clean Architecture: domain ← application ← infrastructure
- Service port: **3002**, DB: **`carat_auction`**
- RabbitMQ topic exchange: `carat.events`
- Reserve price NEVER exposed via any API endpoint
- `winnerUserId` NOT included in public API responses — sent via email by Notification Service
- Pagination: `page` (1-indexed) + `pageSize` (default 20, max 100)
- BullMQ queue name: `'auction-timers'` — must match Part A's `BullMQTimerScheduler`
- BullMQ job names: `'start-auction'`, `'close-auction'`, `'closing-soon'` — must match Part A
- SSE heartbeat: `'ping'` event every 30 seconds to keep connection alive
- Response envelope: `{ data: T, meta?: { page, total } }` for success; `{ error: { code, message } }` for errors
- Status codes: 200 GET, 201 POST created, 400 validation, 403 forbidden, 404 not found, 409 conflict, 422 business rule violation

---

## File Map

```
apps/auction-engine/src/
  application/
    lot-query-repository.ts              — LotQueryRepository interface, LotStatusRow, BidRow types
    get-lot-status-handler.ts            — GetLotStatusHandler
    get-bid-history-handler.ts           — GetBidHistoryHandler (paginated, amounts only)
    get-active-lots-handler.ts           — GetActiveLotsHandler (LIVE | CLOSING | SCHEDULED)
    sse-broadcaster.ts                   — SseBroadcaster interface, SseEventType, SseEventData
    query-handlers.test.ts               — 4 unit tests
  infrastructure/
    postgres-lot-query-repository.ts     — PostgresLotQueryRepository implements LotQueryRepository
    postgres-lot-query-repository.test.ts — 4 integration tests (real test DB)
    in-memory-sse-broadcaster.ts         — InMemorySseBroadcaster implements SseBroadcaster
    in-memory-sse-broadcaster.test.ts    — 3 unit tests
    bullmq-auction-worker.ts             — Worker: start-auction → StartHandler, close-auction → CloseHandler + SSE, closing-soon → publish
    bullmq-auction-worker.test.ts        — 3 unit tests (mock BullMQ Worker constructor)
  presentation/
    auction-router.ts                    — Hono router: 5 endpoints
    auction-router.test.ts               — 8 unit tests (mock all deps)
  main.ts                               — wires all dependencies, starts HTTP server
```

**Total new tests: 22** (Part A: 34 → grand total: 56)

---

### Task 1: Query Repository

**Files:**
- Create: `apps/auction-engine/src/application/lot-query-repository.ts`
- Create: `apps/auction-engine/src/infrastructure/postgres-lot-query-repository.ts`
- Test: `apps/auction-engine/src/infrastructure/postgres-lot-query-repository.test.ts`

**Interfaces:**
- Consumes: `Db`, `createDb` from Part A Task 3; `PostgresProjectionHandler` from Part A Task 6 (to seed test data)
- Produces:
  - `LotStatusRow` type
  - `BidRow` type
  - `LotQueryRepository` interface with `findLotStatus`, `findBidHistory`, `findActiveLots`
  - `PostgresLotQueryRepository` implements `LotQueryRepository`

- [x] **Step 1: Write the failing tests**

Create `apps/auction-engine/src/infrastructure/postgres-lot-query-repository.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { createDb } from './db';
import { PostgresProjectionHandler } from './postgres-projection-handler';
import { PostgresLotQueryRepository } from './postgres-lot-query-repository';
import { AuctionDomainEvent } from '../domain/auction-events';

const db = createDb(process.env['TEST_DATABASE_URL'] ?? 'postgres://localhost/carat_auction_test');
const projectionHandler = new PostgresProjectionHandler(db);
const queryRepo = new PostgresLotQueryRepository(db);

const LOT_ID = 'lot-query-test-1';
const LOT_ID_2 = 'lot-query-test-2';

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
  await db`DELETE FROM bids WHERE lot_id IN (${LOT_ID}, ${LOT_ID_2})`;
  await db`DELETE FROM lot_status WHERE lot_id IN (${LOT_ID}, ${LOT_ID_2})`;
});

describe('PostgresLotQueryRepository', () => {
  it('should_returnLotStatusRow_when_lotExists', async () => {
    await projectionHandler.handle(LOT_ID, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID, [{ type: 'AuctionStarted', payload: {} }]);

    const result = await queryRepo.findLotStatus(LOT_ID);

    expect(result).not.toBeNull();
    expect(result?.lotId).toBe(LOT_ID);
    expect(result?.status).toBe('LIVE');
    expect(result?.bidCount).toBe(0);
    expect(result?.currentHighestBid).toBeNull();
  });

  it('should_returnNull_when_lotDoesNotExist', async () => {
    const result = await queryRepo.findLotStatus('nonexistent-lot-xyz');

    expect(result).toBeNull();
  });

  it('should_returnBidsDescByPlacedAt_when_bidsExist', async () => {
    await projectionHandler.handle(LOT_ID, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID, [
      { type: 'BidPlaced', payload: { bid_id: 'bid-q-1', user_id: 'user-1', amount: 100, placed_at: '2026-06-20T11:00:00Z' } },
      { type: 'BidPlaced', payload: { bid_id: 'bid-q-2', user_id: 'user-2', amount: 200, placed_at: '2026-06-20T11:01:00Z' } },
    ]);

    const result = await queryRepo.findBidHistory(LOT_ID, 10, 0);

    expect(result.total).toBe(2);
    expect(result.bids).toHaveLength(2);
    expect(result.bids[0].amount).toBe(200);
    expect(result.bids[1].amount).toBe(100);
    expect(result.bids[0]).not.toHaveProperty('user_id');
  });

  it('should_includeScheduledAndLiveLots_when_findingActiveLots', async () => {
    await projectionHandler.handle(LOT_ID, [SCHEDULED_EVENT]);
    await projectionHandler.handle(LOT_ID, [{ type: 'AuctionStarted', payload: {} }]);
    await projectionHandler.handle(LOT_ID_2, [SCHEDULED_EVENT]);

    const result = await queryRepo.findActiveLots(100, 0);

    const lotIds = result.lots.map(l => l.lotId);
    expect(lotIds).toContain(LOT_ID);
    expect(lotIds).toContain(LOT_ID_2);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
cd apps/auction-engine
npx vitest run src/infrastructure/postgres-lot-query-repository.test.ts
```

Expected: FAIL — `Cannot find module './postgres-lot-query-repository'`

- [x] **Step 3: Create `apps/auction-engine/src/application/lot-query-repository.ts`**

```typescript
export interface LotStatusRow {
  lotId: string;
  status: string;
  currentHighestBid: number | null;
  bidCount: number;
  endAt: Date;
  winnerUserId: string | null;
  updatedAt: Date;
}

export interface BidRow {
  id: string;
  amount: number;
  placedAt: Date;
}

export interface LotQueryRepository {
  findLotStatus(lotId: string): Promise<LotStatusRow | null>;
  findBidHistory(lotId: string, limit: number, offset: number): Promise<{ bids: BidRow[]; total: number }>;
  findActiveLots(limit: number, offset: number): Promise<{ lots: LotStatusRow[]; total: number }>;
}
```

- [x] **Step 4: Create `apps/auction-engine/src/infrastructure/postgres-lot-query-repository.ts`**

```typescript
import { BidRow, LotQueryRepository, LotStatusRow } from '../application/lot-query-repository';
import { Db } from './db';

const ACTIVE_STATUSES = ['SCHEDULED', 'LIVE', 'CLOSING'];

export class PostgresLotQueryRepository implements LotQueryRepository {
  constructor(private readonly db: Db) {}

  async findLotStatus(lotId: string): Promise<LotStatusRow | null> {
    const rows = await this.db`
      SELECT lot_id, status, current_highest_bid, bid_count, end_at, winner_user_id, updated_at
      FROM lot_status
      WHERE lot_id = ${lotId}
    `;
    if (rows.length === 0) return null;
    return mapLotStatusRow(rows[0]);
  }

  async findBidHistory(
    lotId: string,
    limit: number,
    offset: number,
  ): Promise<{ bids: BidRow[]; total: number }> {
    const [rows, countRows] = await Promise.all([
      this.db`
        SELECT id, amount, placed_at
        FROM bids
        WHERE lot_id = ${lotId}
        ORDER BY placed_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.db`SELECT COUNT(*)::int AS total FROM bids WHERE lot_id = ${lotId}`,
    ]);
    return {
      bids: rows.map(r => ({
        id: r['id'] as string,
        amount: Number(r['amount']),
        placedAt: r['placed_at'] as Date,
      })),
      total: countRows[0]['total'] as number,
    };
  }

  async findActiveLots(
    limit: number,
    offset: number,
  ): Promise<{ lots: LotStatusRow[]; total: number }> {
    const [rows, countRows] = await Promise.all([
      this.db`
        SELECT lot_id, status, current_highest_bid, bid_count, end_at, winner_user_id, updated_at
        FROM lot_status
        WHERE status = ANY(${ACTIVE_STATUSES})
        ORDER BY end_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.db`
        SELECT COUNT(*)::int AS total
        FROM lot_status
        WHERE status = ANY(${ACTIVE_STATUSES})
      `,
    ]);
    return {
      lots: rows.map(mapLotStatusRow),
      total: countRows[0]['total'] as number,
    };
  }
}

function mapLotStatusRow(r: Record<string, unknown>): LotStatusRow {
  return {
    lotId: r['lot_id'] as string,
    status: r['status'] as string,
    currentHighestBid: r['current_highest_bid'] != null ? Number(r['current_highest_bid']) : null,
    bidCount: r['bid_count'] as number,
    endAt: r['end_at'] as Date,
    winnerUserId: (r['winner_user_id'] as string | null) ?? null,
    updatedAt: r['updated_at'] as Date,
  };
}
```

- [x] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/infrastructure/postgres-lot-query-repository.test.ts
```

Expected: 4 passed

- [x] **Step 6: Commit**

```bash
git add apps/auction-engine/src/application/lot-query-repository.ts apps/auction-engine/src/infrastructure/postgres-lot-query-repository.ts apps/auction-engine/src/infrastructure/postgres-lot-query-repository.test.ts
git commit -m "feat(auction): LotQueryRepository + PostgresLotQueryRepository reads projection tables"
```

---

### Task 2: Query Handlers

**Files:**
- Create: `apps/auction-engine/src/application/get-lot-status-handler.ts`
- Create: `apps/auction-engine/src/application/get-bid-history-handler.ts`
- Create: `apps/auction-engine/src/application/get-active-lots-handler.ts`
- Test: `apps/auction-engine/src/application/query-handlers.test.ts`

**Interfaces:**
- Consumes: `LotQueryRepository`, `LotStatusRow`, `BidRow` from Task 1
- Produces:
  - `GetLotStatusHandler` with `.execute(lotId: string): Promise<LotStatusRow | null>`
  - `GetBidHistoryHandler` with `.execute({ lotId, page, pageSize }): Promise<{ bids, total }>`
  - `GetActiveLotsHandler` with `.execute({ page, pageSize }): Promise<{ lots, total }>`

- [x] **Step 1: Write the failing tests**

Create `apps/auction-engine/src/application/query-handlers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LotQueryRepository, LotStatusRow, BidRow } from './lot-query-repository';
import { GetLotStatusHandler } from './get-lot-status-handler';
import { GetBidHistoryHandler } from './get-bid-history-handler';
import { GetActiveLotsHandler } from './get-active-lots-handler';

const mockRepo: LotQueryRepository = {
  findLotStatus: vi.fn(),
  findBidHistory: vi.fn(),
  findActiveLots: vi.fn(),
};

function fakeLotStatusRow(overrides: Partial<LotStatusRow> = {}): LotStatusRow {
  return {
    lotId: 'lot-1',
    status: 'LIVE',
    currentHighestBid: 200,
    bidCount: 3,
    endAt: new Date('2026-06-20T12:00:00Z'),
    winnerUserId: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GetLotStatusHandler', () => {
  it('should_returnLotStatus_when_lotExists', async () => {
    const expected = fakeLotStatusRow();
    vi.mocked(mockRepo.findLotStatus).mockResolvedValue(expected);
    const handler = new GetLotStatusHandler(mockRepo);

    const result = await handler.execute('lot-1');

    expect(result).toEqual(expected);
    expect(mockRepo.findLotStatus).toHaveBeenCalledWith('lot-1');
  });

  it('should_returnNull_when_lotNotFound', async () => {
    vi.mocked(mockRepo.findLotStatus).mockResolvedValue(null);
    const handler = new GetLotStatusHandler(mockRepo);

    const result = await handler.execute('nonexistent');

    expect(result).toBeNull();
  });
});

describe('GetBidHistoryHandler', () => {
  it('should_calculateOffsetFromPage_when_executing', async () => {
    const fakeBids: BidRow[] = [{ id: 'bid-1', amount: 200, placedAt: new Date() }];
    vi.mocked(mockRepo.findBidHistory).mockResolvedValue({ bids: fakeBids, total: 1 });
    const handler = new GetBidHistoryHandler(mockRepo);

    const result = await handler.execute({ lotId: 'lot-1', page: 2, pageSize: 10 });

    expect(result.bids).toHaveLength(1);
    expect(mockRepo.findBidHistory).toHaveBeenCalledWith('lot-1', 10, 10);
  });
});

describe('GetActiveLotsHandler', () => {
  it('should_calculateOffsetFromPage_when_executing', async () => {
    vi.mocked(mockRepo.findActiveLots).mockResolvedValue({ lots: [], total: 0 });
    const handler = new GetActiveLotsHandler(mockRepo);

    await handler.execute({ page: 3, pageSize: 20 });

    expect(mockRepo.findActiveLots).toHaveBeenCalledWith(20, 40);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/application/query-handlers.test.ts
```

Expected: FAIL — `Cannot find module './get-lot-status-handler'`

- [x] **Step 3: Create `apps/auction-engine/src/application/get-lot-status-handler.ts`**

```typescript
import { LotQueryRepository, LotStatusRow } from './lot-query-repository';

export class GetLotStatusHandler {
  constructor(private readonly repo: LotQueryRepository) {}

  async execute(lotId: string): Promise<LotStatusRow | null> {
    return this.repo.findLotStatus(lotId);
  }
}
```

- [x] **Step 4: Create `apps/auction-engine/src/application/get-bid-history-handler.ts`**

```typescript
import { BidRow, LotQueryRepository } from './lot-query-repository';

export interface GetBidHistoryParams {
  lotId: string;
  page: number;
  pageSize: number;
}

export class GetBidHistoryHandler {
  constructor(private readonly repo: LotQueryRepository) {}

  async execute(params: GetBidHistoryParams): Promise<{ bids: BidRow[]; total: number }> {
    const offset = (params.page - 1) * params.pageSize;
    return this.repo.findBidHistory(params.lotId, params.pageSize, offset);
  }
}
```

- [x] **Step 5: Create `apps/auction-engine/src/application/get-active-lots-handler.ts`**

```typescript
import { LotQueryRepository, LotStatusRow } from './lot-query-repository';

export interface GetActiveLotsParams {
  page: number;
  pageSize: number;
}

export class GetActiveLotsHandler {
  constructor(private readonly repo: LotQueryRepository) {}

  async execute(params: GetActiveLotsParams): Promise<{ lots: LotStatusRow[]; total: number }> {
    const offset = (params.page - 1) * params.pageSize;
    return this.repo.findActiveLots(params.pageSize, offset);
  }
}
```

- [x] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/application/query-handlers.test.ts
```

Expected: 4 passed

- [x] **Step 7: Commit**

```bash
git add apps/auction-engine/src/application/get-lot-status-handler.ts apps/auction-engine/src/application/get-bid-history-handler.ts apps/auction-engine/src/application/get-active-lots-handler.ts apps/auction-engine/src/application/query-handlers.test.ts
git commit -m "feat(auction): GetLotStatus, GetBidHistory, GetActiveLots query handlers"
```

---

### Task 3: SSE Broadcaster

**Files:**
- Create: `apps/auction-engine/src/application/sse-broadcaster.ts`
- Create: `apps/auction-engine/src/infrastructure/in-memory-sse-broadcaster.ts`
- Test: `apps/auction-engine/src/infrastructure/in-memory-sse-broadcaster.test.ts`

**Interfaces:**
- Produces:
  - `SseEventType = 'bid_placed' | 'timer_extended' | 'auction_closed'`
  - `SseEventData` with `{ highestBid, bidCount, endAt, status }`
  - `SseBroadcaster` interface with `subscribe` and `broadcast`
  - `InMemorySseBroadcaster` implements `SseBroadcaster`

- [x] **Step 1: Write the failing tests**

Create `apps/auction-engine/src/infrastructure/in-memory-sse-broadcaster.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { InMemorySseBroadcaster } from './in-memory-sse-broadcaster';
import { SseEventData } from '../application/sse-broadcaster';

const fakeData: SseEventData = {
  highestBid: 200,
  bidCount: 1,
  endAt: '2026-06-20T12:00:00Z',
  status: 'LIVE',
};

describe('InMemorySseBroadcaster', () => {
  it('should_callSubscriber_when_eventBroadcast', () => {
    const broadcaster = new InMemorySseBroadcaster();
    const send = vi.fn();
    broadcaster.subscribe('lot-1', send);

    broadcaster.broadcast('lot-1', 'bid_placed', fakeData);

    expect(send).toHaveBeenCalledWith('bid_placed', expect.objectContaining({ highestBid: 200 }));
  });

  it('should_stopNotifying_when_unsubscribed', () => {
    const broadcaster = new InMemorySseBroadcaster();
    const send = vi.fn();
    const unsub = broadcaster.subscribe('lot-1', send);
    unsub();

    broadcaster.broadcast('lot-1', 'bid_placed', fakeData);

    expect(send).not.toHaveBeenCalled();
  });

  it('should_notThrow_when_noSubscribersForLot', () => {
    const broadcaster = new InMemorySseBroadcaster();

    expect(() => broadcaster.broadcast('lot-unknown', 'bid_placed', fakeData)).not.toThrow();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/infrastructure/in-memory-sse-broadcaster.test.ts
```

Expected: FAIL — `Cannot find module './in-memory-sse-broadcaster'`

- [x] **Step 3: Create `apps/auction-engine/src/application/sse-broadcaster.ts`**

```typescript
export type SseEventType = 'bid_placed' | 'timer_extended' | 'auction_closed';

export interface SseEventData {
  highestBid: number | null;
  bidCount: number;
  endAt: string;
  status: string;
}

export interface SseBroadcaster {
  subscribe(
    lotId: string,
    send: (event: SseEventType, data: SseEventData) => void,
  ): () => void;
  broadcast(lotId: string, event: SseEventType, data: SseEventData): void;
}
```

- [x] **Step 4: Create `apps/auction-engine/src/infrastructure/in-memory-sse-broadcaster.ts`**

```typescript
import { SseBroadcaster, SseEventData, SseEventType } from '../application/sse-broadcaster';

type SendFn = (event: SseEventType, data: SseEventData) => void;

export class InMemorySseBroadcaster implements SseBroadcaster {
  private readonly connections = new Map<string, Set<SendFn>>();

  subscribe(lotId: string, send: SendFn): () => void {
    if (!this.connections.has(lotId)) {
      this.connections.set(lotId, new Set());
    }
    this.connections.get(lotId)!.add(send);
    return () => {
      const subs = this.connections.get(lotId);
      if (!subs) return;
      subs.delete(send);
      if (subs.size === 0) this.connections.delete(lotId);
    };
  }

  broadcast(lotId: string, event: SseEventType, data: SseEventData): void {
    const subs = this.connections.get(lotId);
    if (!subs) return;
    for (const send of subs) {
      try {
        send(event, data);
      } catch {
        // subscriber disconnected — ignore
      }
    }
  }
}
```

- [x] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/infrastructure/in-memory-sse-broadcaster.test.ts
```

Expected: 3 passed

- [x] **Step 6: Commit**

```bash
git add apps/auction-engine/src/application/sse-broadcaster.ts apps/auction-engine/src/infrastructure/in-memory-sse-broadcaster.ts apps/auction-engine/src/infrastructure/in-memory-sse-broadcaster.test.ts
git commit -m "feat(auction): SseBroadcaster interface + InMemorySseBroadcaster"
```

---

### Task 4: BullMQ Auction Worker

**Files:**
- Create: `apps/auction-engine/src/infrastructure/bullmq-auction-worker.ts`
- Test: `apps/auction-engine/src/infrastructure/bullmq-auction-worker.test.ts`

**Interfaces:**
- Consumes:
  - `StartAuctionCommandHandler` from Part A `start-auction-handler.ts`
  - `CloseAuctionCommandHandler` from Part A `close-auction-handler.ts`
  - `AuctionEventPublisher` from Part A `auction-event-publisher.ts`
  - `GetLotStatusHandler` from Task 2
  - `SseBroadcaster` from Task 3
- Produces: `BullMQAuctionWorker` with `.close(): Promise<void>`

Queue name `'auction-timers'` and job names `'start-auction'`, `'close-auction'`, `'closing-soon'` must exactly match Part A's `BullMQTimerScheduler` constants.

- [x] **Step 1: Write the failing tests**

Create `apps/auction-engine/src/infrastructure/bullmq-auction-worker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Worker } from 'bullmq';
import { BullMQAuctionWorker } from './bullmq-auction-worker';
import { StartAuctionCommandHandler } from '../application/start-auction-handler';
import { CloseAuctionCommandHandler } from '../application/close-auction-handler';
import { AuctionEventPublisher } from '../application/auction-event-publisher';
import { SseBroadcaster } from '../application/sse-broadcaster';
import { GetLotStatusHandler } from '../application/get-lot-status-handler';

vi.mock('bullmq');

type JobProcessor = (job: { name: string; data: { lotId: string } }) => Promise<void>;

const mockStartHandler = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as StartAuctionCommandHandler;
const mockCloseHandler = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as CloseAuctionCommandHandler;
const mockGetLotStatus = { execute: vi.fn() } as unknown as GetLotStatusHandler;
const mockPublisher: AuctionEventPublisher = {
  publishBidPlaced: vi.fn(),
  publishAuctionClosingSoon: vi.fn().mockResolvedValue(undefined),
  publishAuctionClosed: vi.fn(),
};
const mockBroadcaster: SseBroadcaster = {
  subscribe: vi.fn(),
  broadcast: vi.fn(),
};

const REDIS = { host: 'localhost', port: 6379 };

describe('BullMQAuctionWorker', () => {
  let capturedProcessor: JobProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Worker).mockImplementation((_queueName, processor) => {
      capturedProcessor = processor as JobProcessor;
      return { close: vi.fn() } as unknown as Worker;
    });
  });

  it('should_callStartHandler_when_startAuctionJobProcessed', async () => {
    new BullMQAuctionWorker(REDIS, mockStartHandler, mockCloseHandler, mockGetLotStatus, mockPublisher, mockBroadcaster);

    await capturedProcessor({ name: 'start-auction', data: { lotId: 'lot-1' } });

    expect(mockStartHandler.execute).toHaveBeenCalledWith({ lotId: 'lot-1' });
  });

  it('should_callCloseHandlerAndBroadcastSse_when_closeAuctionJobProcessed', async () => {
    vi.mocked(mockGetLotStatus.execute).mockResolvedValue({
      lotId: 'lot-1',
      status: 'SOLD',
      currentHighestBid: 600,
      bidCount: 3,
      endAt: new Date('2026-06-20T12:00:00Z'),
      winnerUserId: 'user-1',
      updatedAt: new Date(),
    });
    new BullMQAuctionWorker(REDIS, mockStartHandler, mockCloseHandler, mockGetLotStatus, mockPublisher, mockBroadcaster);

    await capturedProcessor({ name: 'close-auction', data: { lotId: 'lot-1' } });

    expect(mockCloseHandler.execute).toHaveBeenCalledWith({ lotId: 'lot-1' });
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      'lot-1',
      'auction_closed',
      expect.objectContaining({ status: 'SOLD', highestBid: 600 }),
    );
  });

  it('should_publishClosingSoonEvent_when_closingSoonJobProcessed', async () => {
    vi.mocked(mockGetLotStatus.execute).mockResolvedValue({
      lotId: 'lot-1',
      status: 'LIVE',
      currentHighestBid: null,
      bidCount: 0,
      endAt: new Date('2026-06-20T12:00:00Z'),
      winnerUserId: null,
      updatedAt: new Date(),
    });
    new BullMQAuctionWorker(REDIS, mockStartHandler, mockCloseHandler, mockGetLotStatus, mockPublisher, mockBroadcaster);

    await capturedProcessor({ name: 'closing-soon', data: { lotId: 'lot-1' } });

    expect(mockPublisher.publishAuctionClosingSoon).toHaveBeenCalledWith({
      lotId: 'lot-1',
      endAt: '2026-06-20T12:00:00.000Z',
    });
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/infrastructure/bullmq-auction-worker.test.ts
```

Expected: FAIL — `Cannot find module './bullmq-auction-worker'`

- [x] **Step 3: Create `apps/auction-engine/src/infrastructure/bullmq-auction-worker.ts`**

```typescript
import { Job, Worker } from 'bullmq';
import { StartAuctionCommandHandler } from '../application/start-auction-handler';
import { CloseAuctionCommandHandler } from '../application/close-auction-handler';
import { AuctionEventPublisher } from '../application/auction-event-publisher';
import { SseBroadcaster } from '../application/sse-broadcaster';
import { GetLotStatusHandler } from '../application/get-lot-status-handler';

const QUEUE_NAME = 'auction-timers';

interface RedisOptions {
  host: string;
  port: number;
}

interface TimerJobData {
  lotId: string;
}

export class BullMQAuctionWorker {
  private readonly worker: Worker;

  constructor(
    redis: RedisOptions,
    private readonly startHandler: StartAuctionCommandHandler,
    private readonly closeHandler: CloseAuctionCommandHandler,
    private readonly getLotStatusHandler: GetLotStatusHandler,
    private readonly publisher: AuctionEventPublisher,
    private readonly sseBroadcaster: SseBroadcaster,
  ) {
    this.worker = new Worker(QUEUE_NAME, this.process.bind(this), { connection: redis });
  }

  private async process(job: Job<TimerJobData>): Promise<void> {
    const { lotId } = job.data;

    switch (job.name) {
      case 'start-auction':
        await this.startHandler.execute({ lotId });
        break;

      case 'close-auction': {
        await this.closeHandler.execute({ lotId });
        const status = await this.getLotStatusHandler.execute(lotId);
        if (status) {
          this.sseBroadcaster.broadcast(lotId, 'auction_closed', {
            highestBid: status.currentHighestBid,
            bidCount: status.bidCount,
            endAt: status.endAt.toISOString(),
            status: status.status,
          });
        }
        break;
      }

      case 'closing-soon': {
        const status = await this.getLotStatusHandler.execute(lotId);
        if (status) {
          await this.publisher.publishAuctionClosingSoon({
            lotId,
            endAt: status.endAt.toISOString(),
          });
        }
        break;
      }
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/infrastructure/bullmq-auction-worker.test.ts
```

Expected: 3 passed

- [x] **Step 5: Commit**

```bash
git add apps/auction-engine/src/infrastructure/bullmq-auction-worker.ts apps/auction-engine/src/infrastructure/bullmq-auction-worker.test.ts
git commit -m "feat(auction): BullMQAuctionWorker processes timer jobs and broadcasts SSE"
```

---

### Task 5: Hono Router

**Files:**
- Create: `apps/auction-engine/src/presentation/auction-router.ts`
- Test: `apps/auction-engine/src/presentation/auction-router.test.ts`

**Interfaces:**
- Consumes: all query handlers (Tasks 1–2), `PlaceBidCommandHandler` (Part A `place-bid-handler.ts`), `SseBroadcaster` (Task 3), `authMiddleware` + `JwtPayload` from `@carat-room/shared-auth`
- Produces: `createAuctionRouter(deps: AuctionRouterDeps): Hono` — pass `.fetch` to `@hono/node-server`

**Endpoint summary:**

| Method | Path | Auth | Success code |
|---|---|---|---|
| GET | `/api/auctions` | none | 200 |
| GET | `/api/auctions/:lotId` | none | 200, 404 |
| GET | `/api/auctions/:lotId/bids` | none | 200 |
| GET | `/api/auctions/:lotId/stream` | none | 200 SSE |
| POST | `/api/auctions/:lotId/bids` | APPROVED_BIDDER | 201, 400, 403, 409, 422 |

- [x] **Step 1: Write the failing tests**

Create `apps/auction-engine/src/presentation/auction-router.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authMiddleware } from '@carat-room/shared-auth';
import { GetActiveLotsHandler } from '../application/get-active-lots-handler';
import { GetLotStatusHandler } from '../application/get-lot-status-handler';
import { GetBidHistoryHandler } from '../application/get-bid-history-handler';
import { PlaceBidCommandHandler } from '../application/place-bid-handler';
import { SseBroadcaster } from '../application/sse-broadcaster';
import { LotStatusRow } from '../application/lot-query-repository';
import { createAuctionRouter } from './auction-router';

vi.mock('@carat-room/shared-auth', () => ({
  authMiddleware: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { sub: 'user-1', status: 'APPROVED_BIDDER', role: 'BUYER' });
    await next();
  }),
}));

const mockGetActiveLots = { execute: vi.fn() } as unknown as GetActiveLotsHandler;
const mockGetLotStatus = { execute: vi.fn() } as unknown as GetLotStatusHandler;
const mockGetBidHistory = { execute: vi.fn() } as unknown as GetBidHistoryHandler;
const mockPlaceBid = { execute: vi.fn() } as unknown as PlaceBidCommandHandler;
const mockBroadcaster: SseBroadcaster = { subscribe: vi.fn(), broadcast: vi.fn() };

const router = createAuctionRouter({
  getActiveLots: mockGetActiveLots,
  getLotStatus: mockGetLotStatus,
  getBidHistory: mockGetBidHistory,
  placeBidHandler: mockPlaceBid,
  sseBroadcaster: mockBroadcaster,
});

function fakeLotStatusRow(overrides: Partial<LotStatusRow> = {}): LotStatusRow {
  return {
    lotId: 'lot-1',
    status: 'LIVE',
    currentHighestBid: 200,
    bidCount: 3,
    endAt: new Date('2026-06-20T12:00:00Z'),
    winnerUserId: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/auctions', () => {
  it('should_return200WithActiveLots_when_lotsExist', async () => {
    vi.mocked(mockGetActiveLots.execute).mockResolvedValue({ lots: [fakeLotStatusRow()], total: 1 });

    const res = await router.request('/api/auctions');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; meta: { total: number } };
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
  });
});

describe('GET /api/auctions/:lotId', () => {
  it('should_return200WithLotStatus_when_lotExists', async () => {
    vi.mocked(mockGetLotStatus.execute).mockResolvedValue(fakeLotStatusRow());

    const res = await router.request('/api/auctions/lot-1');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { lotId: string; status: string } };
    expect(body.data.lotId).toBe('lot-1');
    expect(body.data.status).toBe('LIVE');
  });

  it('should_return404_when_lotNotFound', async () => {
    vi.mocked(mockGetLotStatus.execute).mockResolvedValue(null);

    const res = await router.request('/api/auctions/unknown-lot');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/auctions/:lotId/bids', () => {
  it('should_return200WithBidHistory_when_bidsExist', async () => {
    vi.mocked(mockGetBidHistory.execute).mockResolvedValue({
      bids: [{ id: 'bid-1', amount: 200, placedAt: new Date('2026-06-20T11:00:00Z') }],
      total: 1,
    });

    const res = await router.request('/api/auctions/lot-1/bids');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { amount: number }[]; meta: { total: number } };
    expect(body.data[0].amount).toBe(200);
    expect(body.data[0]).not.toHaveProperty('userId');
    expect(body.meta.total).toBe(1);
  });
});

describe('POST /api/auctions/:lotId/bids', () => {
  it('should_return201WithBidId_when_bidAccepted', async () => {
    vi.mocked(mockPlaceBid.execute).mockResolvedValue({ success: true, timerExtended: false });
    vi.mocked(mockGetLotStatus.execute).mockResolvedValue(fakeLotStatusRow());

    const res = await router.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ amount: 300 }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: { bidId: string; amount: number; lotId: string } };
    expect(body.data.amount).toBe(300);
    expect(body.data.lotId).toBe('lot-1');
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith('lot-1', 'bid_placed', expect.any(Object));
  });

  it('should_return422_when_bidTooLow', async () => {
    vi.mocked(mockPlaceBid.execute).mockResolvedValue({ success: false, reason: 'BID_TOO_LOW' });

    const res = await router.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ amount: 1 }),
    });

    expect(res.status).toBe(422);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('BID_TOO_LOW');
  });

  it('should_return409_when_auctionNotActive', async () => {
    vi.mocked(mockPlaceBid.execute).mockResolvedValue({ success: false, reason: 'AUCTION_NOT_ACTIVE' });

    const res = await router.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ amount: 300 }),
    });

    expect(res.status).toBe(409);
  });

  it('should_broadcastTimerExtended_when_bidTriggersExtension', async () => {
    vi.mocked(mockPlaceBid.execute).mockResolvedValue({
      success: true,
      timerExtended: true,
      newEndAt: new Date('2026-06-20T12:05:00Z'),
    });
    vi.mocked(mockGetLotStatus.execute).mockResolvedValue(
      fakeLotStatusRow({ status: 'CLOSING', endAt: new Date('2026-06-20T12:05:00Z') }),
    );

    await router.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ amount: 300 }),
    });

    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith('lot-1', 'bid_placed', expect.any(Object));
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith('lot-1', 'timer_extended', expect.any(Object));
  });

  it('should_return400_when_amountIsNotPositive', async () => {
    const res = await router.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ amount: -5 }),
    });

    expect(res.status).toBe(400);
    expect(mockPlaceBid.execute).not.toHaveBeenCalled();
  });

  it('should_return403_when_userNotApprovedBidder', async () => {
    vi.mocked(authMiddleware).mockImplementationOnce(
      async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
        c.set('user', { sub: 'user-1', status: 'EMAIL_VERIFIED', role: 'BUYER' });
        await next();
      },
    );

    const res = await router.request('/api/auctions/lot-1/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ amount: 300 }),
    });

    expect(res.status).toBe(403);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/presentation/auction-router.test.ts
```

Expected: FAIL — `Cannot find module './auction-router'`

- [x] **Step 3: Create `apps/auction-engine/src/presentation/auction-router.ts`**

```typescript
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, JwtPayload } from '@carat-room/shared-auth';
import { GetActiveLotsHandler } from '../application/get-active-lots-handler';
import { GetLotStatusHandler } from '../application/get-lot-status-handler';
import { GetBidHistoryHandler } from '../application/get-bid-history-handler';
import { PlaceBidCommandHandler } from '../application/place-bid-handler';
import { SseBroadcaster } from '../application/sse-broadcaster';
import { LotStatusRow } from '../application/lot-query-repository';

type AppEnv = { Variables: { user: JwtPayload } };

export interface AuctionRouterDeps {
  getActiveLots: GetActiveLotsHandler;
  getLotStatus: GetLotStatusHandler;
  getBidHistory: GetBidHistoryHandler;
  placeBidHandler: PlaceBidCommandHandler;
  sseBroadcaster: SseBroadcaster;
}

export function createAuctionRouter(deps: AuctionRouterDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/api/auctions', async (c) => {
    const page = Math.max(1, Number(c.req.query('page') ?? '1'));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? '20')));
    const result = await deps.getActiveLots.execute({ page, pageSize });
    return c.json({
      data: result.lots.map(serializeLotStatus),
      meta: { page, total: result.total },
    });
  });

  app.get('/api/auctions/:lotId', async (c) => {
    const lotId = c.req.param('lotId');
    const status = await deps.getLotStatus.execute(lotId);
    if (!status) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Lot not found' } }, 404);
    }
    return c.json({ data: serializeLotStatus(status) });
  });

  app.get('/api/auctions/:lotId/bids', async (c) => {
    const lotId = c.req.param('lotId');
    const page = Math.max(1, Number(c.req.query('page') ?? '1'));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? '20')));
    const result = await deps.getBidHistory.execute({ lotId, page, pageSize });
    return c.json({
      data: result.bids.map(b => ({
        id: b.id,
        amount: b.amount,
        placedAt: b.placedAt.toISOString(),
      })),
      meta: { page, total: result.total },
    });
  });

  app.get('/api/auctions/:lotId/stream', (c) => {
    const lotId = c.req.param('lotId');
    return streamSSE(c, async (stream) => {
      const unsub = deps.sseBroadcaster.subscribe(lotId, (event, data) => {
        void stream.writeSSE({ event, data: JSON.stringify(data) });
      });
      stream.onAbort(unsub);
      try {
        while (true) {
          await stream.writeSSE({ event: 'ping', data: '' });
          await stream.sleep(30_000);
        }
      } finally {
        unsub();
      }
    });
  });

  app.post('/api/auctions/:lotId/bids', authMiddleware, async (c) => {
    const user = c.get('user');
    if (user.status !== 'APPROVED_BIDDER') {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Phone verification required to bid' } },
        403,
      );
    }

    const lotId = c.req.param('lotId');
    const body = await c.req.json<{ amount: unknown }>();
    const amount = Number(body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return c.json(
        { error: { code: 'INVALID_AMOUNT', message: 'Amount must be a positive number' } },
        400,
      );
    }

    const bidId = uuidv4();
    const result = await deps.placeBidHandler.execute({
      lotId,
      bidId,
      userId: user.sub,
      amount,
      placedAt: new Date(),
    });

    if (!result.success) {
      const statusCode = result.reason === 'AUCTION_NOT_ACTIVE' ? 409 : 422;
      return c.json({ error: { code: result.reason, message: result.reason } }, statusCode);
    }

    const latestStatus = await deps.getLotStatus.execute(lotId);
    if (latestStatus) {
      const sseData = {
        highestBid: latestStatus.currentHighestBid,
        bidCount: latestStatus.bidCount,
        endAt: latestStatus.endAt.toISOString(),
        status: latestStatus.status,
      };
      deps.sseBroadcaster.broadcast(lotId, 'bid_placed', sseData);
      if (result.timerExtended) {
        deps.sseBroadcaster.broadcast(lotId, 'timer_extended', sseData);
      }
    }

    return c.json({ data: { bidId, amount, lotId } }, 201);
  });

  return app;
}

function serializeLotStatus(row: LotStatusRow) {
  return {
    lotId: row.lotId,
    status: row.status,
    currentHighestBid: row.currentHighestBid,
    bidCount: row.bidCount,
    endAt: row.endAt.toISOString(),
  };
}
```

- [x] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/presentation/auction-router.test.ts
```

Expected: 8 passed

- [x] **Step 5: Commit**

```bash
git add apps/auction-engine/src/presentation/auction-router.ts apps/auction-engine/src/presentation/auction-router.test.ts
git commit -m "feat(auction): Hono router — 5 endpoints including SSE stream and bid placement"
```

---

### Task 6: main.ts — Wire Everything

**Files:**
- Create: `apps/auction-engine/src/main.ts`

**Interfaces:**
- Consumes: all infrastructure adapters from Parts A and B, all command and query handlers, `createAuctionRouter`
- Produces: running HTTP server on port 3002

No tests — `main.ts` is pure wiring; all dependencies are tested individually.

- [x] **Step 1: Create `apps/auction-engine/src/main.ts`**

```typescript
import { serve } from '@hono/node-server';
import { createAmqpConnection, EventPublisher } from '@carat-room/shared-events';
import { createDb } from './infrastructure/db';
import { PostgresEventStore } from './infrastructure/postgres-event-store';
import { PostgresProjectionHandler } from './infrastructure/postgres-projection-handler';
import { PostgresLotQueryRepository } from './infrastructure/postgres-lot-query-repository';
import { RedisLockAdapter } from './infrastructure/redis-lock';
import { BullMQTimerScheduler } from './infrastructure/bullmq-timer-scheduler';
import { RabbitMQAuctionPublisher } from './infrastructure/rabbitmq-auction-publisher';
import { InMemorySseBroadcaster } from './infrastructure/in-memory-sse-broadcaster';
import { BullMQAuctionWorker } from './infrastructure/bullmq-auction-worker';
import { ScheduleAuctionCommandHandler } from './application/schedule-auction-handler';
import { StartAuctionCommandHandler } from './application/start-auction-handler';
import { PlaceBidCommandHandler } from './application/place-bid-handler';
import { CancelAuctionCommandHandler } from './application/cancel-auction-handler';
import { CloseAuctionCommandHandler } from './application/close-auction-handler';
import { GetLotStatusHandler } from './application/get-lot-status-handler';
import { GetBidHistoryHandler } from './application/get-bid-history-handler';
import { GetActiveLotsHandler } from './application/get-active-lots-handler';
import { createAuctionRouter } from './presentation/auction-router';

const PORT = 3002;

async function main(): Promise<void> {
  const db = createDb(process.env['DATABASE_URL'] ?? 'postgres://localhost/carat_auction');
  const redis = {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['REDIS_PORT'] ?? '6379'),
  };
  const amqpUrl = process.env['RABBITMQ_URL'] ?? 'amqp://localhost';

  const amqpConn = await createAmqpConnection(amqpUrl);
  const eventPublisher = new EventPublisher(amqpConn, 'carat.events');

  // Infrastructure adapters
  const eventStore = new PostgresEventStore(db);
  const projectionHandler = new PostgresProjectionHandler(db);
  const queryRepository = new PostgresLotQueryRepository(db);
  const redisLock = new RedisLockAdapter(redis);
  const timerScheduler = new BullMQTimerScheduler(redis);
  const auctionPublisher = new RabbitMQAuctionPublisher(eventPublisher);
  const sseBroadcaster = new InMemorySseBroadcaster();

  // Command handlers
  // scheduleAuctionHandler and cancelAuctionHandler are wired for use by Plan 08 (Admin Service)
  const scheduleAuctionHandler = new ScheduleAuctionCommandHandler(eventStore, projectionHandler, timerScheduler);
  const startAuctionHandler = new StartAuctionCommandHandler(eventStore, projectionHandler);
  const placeBidHandler = new PlaceBidCommandHandler(
    eventStore,
    projectionHandler,
    auctionPublisher,
    redisLock,
    timerScheduler,
  );
  const cancelAuctionHandler = new CancelAuctionCommandHandler(eventStore, projectionHandler);
  const closeAuctionHandler = new CloseAuctionCommandHandler(eventStore, projectionHandler, auctionPublisher);

  // Suppress unused warnings — these are used in Plan 08's admin endpoints
  void scheduleAuctionHandler;
  void cancelAuctionHandler;

  // Query handlers
  const getLotStatusHandler = new GetLotStatusHandler(queryRepository);
  const getBidHistoryHandler = new GetBidHistoryHandler(queryRepository);
  const getActiveLotsHandler = new GetActiveLotsHandler(queryRepository);

  // BullMQ worker — processes timer jobs enqueued by BullMQTimerScheduler
  new BullMQAuctionWorker(
    redis,
    startAuctionHandler,
    closeAuctionHandler,
    getLotStatusHandler,
    auctionPublisher,
    sseBroadcaster,
  );

  // HTTP server
  const app = createAuctionRouter({
    getActiveLots: getActiveLotsHandler,
    getLotStatus: getLotStatusHandler,
    getBidHistory: getBidHistoryHandler,
    placeBidHandler,
    sseBroadcaster,
  });

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`Auction Engine running on :${PORT}`);
  });
}

main().catch(console.error);
```

- [x] **Step 2: Build to verify TypeScript compiles**

```bash
cd apps/auction-engine
npx tsc --noEmit
```

Expected: no errors

- [x] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: 56 passed (34 from Part A + 22 from Part B)

- [x] **Step 4: Commit**

```bash
git add apps/auction-engine/src/main.ts
git commit -m "feat(auction): main.ts wires all dependencies and starts HTTP server on :3002"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| `GET /api/auctions` — active/upcoming auctions | Task 5 |
| `GET /api/auctions/:lotId` — current auction state | Task 5 |
| `GET /api/auctions/:lotId/bids` — paginated, amounts only, no user_id | Tasks 1, 5 |
| `GET /api/auctions/:lotId/stream` — SSE stream | Tasks 3, 5 |
| `POST /api/auctions/:lotId/bids` — APPROVED_BIDDER only | Task 5 |
| SSE events: `bid_placed`, `timer_extended`, `auction_closed` | Tasks 3, 4, 5 |
| SSE payload: `{ highestBid, bidCount, endAt, status }` | Tasks 3, 4, 5 |
| BullMQ `start-auction` → `StartAuctionCommandHandler` | Task 4 |
| BullMQ `close-auction` → `CloseAuctionCommandHandler` + SSE `auction_closed` | Task 4 |
| BullMQ `closing-soon` → `publishAuctionClosingSoon` | Task 4 |
| Reserve price never in API response | Tasks 1, 5 |
| `winnerUserId` omitted from API responses (`serializeLotStatus` excludes it) | Task 5 |
| Pagination with `page` + `pageSize` defaults (20) and cap (100) | Tasks 2, 5 |
| 403 when user not `APPROVED_BIDDER` | Task 5 |
| 400 when `amount` is not a positive number | Task 5 |
| 409 when auction not active | Task 5 |
| 422 for `BID_TOO_LOW` / `CANNOT_OUTBID_SELF` | Task 5 |
| SSE heartbeat `ping` every 30s | Task 5 |
| main.ts: command handlers + BullMQ worker + HTTP server on :3002 | Task 6 |

**Placeholder scan:** No TBD, TODO, or "implement later" found. All code blocks are complete.

**Type consistency:**
- `SseEventType` defined in Task 3 as `'bid_placed' | 'timer_extended' | 'auction_closed'` — used consistently in Tasks 4 and 5
- `SseEventData` fields `{ highestBid, bidCount, endAt, status }` — consistent across Task 3 definition, Task 4 worker broadcasts, Task 5 router broadcasts
- `LotStatusRow` from Task 1 consumed by query handlers (Task 2), router (Task 5), and worker (Task 4) via `GetLotStatusHandler` — all field names match
- Class name `GetActiveLotsHandler` (plural) is consistent across Tasks 2, 5, and 6
- BullMQ queue `'auction-timers'` and job names `'start-auction'`, `'close-auction'`, `'closing-soon'` match Part A Task 5 exactly
- `PlaceBidCommandHandler` constructor in Part A accepts optional 5th argument `timerScheduler?: TimerScheduler` — Task 6 passes it, enabling auto-extend rescheduling
