# Shipping Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Shipping Service — a Hono microservice that creates a fulfilment record when payment is received, lets the winner choose ship-or-collect, and allows admins to mark dispatch or collection.

**Architecture:** Clean Architecture (domain → application → infrastructure → presentation). Dependencies point inward only — domain layer has zero imports from Hono, postgres.js, or RabbitMQ. The service consumes `PaymentReceived` from RabbitMQ and publishes `ItemDispatched` / `ItemCollected`.

**Tech Stack:** Node.js 20, TypeScript 5.4, Hono, postgres.js, Vitest, @carat-room/shared-types, @carat-room/shared-events, @carat-room/shared-auth

## Global Constraints

- All files TypeScript with strict mode; no `any`
- Hono only — no Express, no Fastify
- postgres.js for DB access — no ORM
- Vitest for all tests — no Jest
- Named exports only — no `export default`
- Single quotes for all string literals
- `const`/`let` only — no `var`
- British English in user-facing strings: "dispatched" not "dispatching", "cancelled" not "canceled"
- Port: 3004
- Service name in monorepo: `apps/shipping`
- Database name: `shipping`

---

### Task 1: Package scaffold and DB migration

**Files:**
- Create: `apps/shipping/package.json`
- Create: `apps/shipping/tsconfig.json`
- Create: `apps/shipping/vitest.config.ts`
- Create: `apps/shipping/migrations/001_create_fulfilments.sql`

**Interfaces:**
- Produces: runnable `vitest` and `tsc --noEmit` commands with zero errors

- [x] **Step 1: Create `apps/shipping/package.json`**

```json
{
  "name": "@carat-room/shipping",
  "version": "0.1.0",
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
    "hono": "^4.4.0",
    "postgres": "^3.4.4",
    "@hono/node-server": "^1.12.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.16.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [x] **Step 2: Create `apps/shipping/tsconfig.json`**

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

- [x] **Step 3: Create `apps/shipping/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [x] **Step 4: Create `apps/shipping/migrations/001_create_fulfilments.sql`**

```sql
CREATE TABLE fulfilments (
  id              UUID PRIMARY KEY,
  lot_id          UUID NOT NULL,
  user_id         UUID NOT NULL,
  method          TEXT,               -- SHIP | COLLECT (null until chosen)
  status          TEXT NOT NULL,      -- PENDING_CHOICE | PENDING_DISPATCH | DISPATCHED | COLLECTED
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shipping_addresses (
  id              UUID PRIMARY KEY,
  fulfilment_id   UUID NOT NULL REFERENCES fulfilments(id),
  full_name       TEXT NOT NULL,
  line1           TEXT NOT NULL,
  line2           TEXT,
  city            TEXT NOT NULL,
  state           TEXT,
  postcode        TEXT NOT NULL,
  country         TEXT NOT NULL  -- ISO 3166-1 alpha-2
);

CREATE TABLE collection_slots (
  id              UUID PRIMARY KEY,
  fulfilment_id   UUID NOT NULL REFERENCES fulfilments(id),
  location        TEXT NOT NULL,
  date            DATE NOT NULL,
  time_slot       TEXT NOT NULL
);

CREATE INDEX idx_fulfilments_user_id ON fulfilments(user_id);
CREATE INDEX idx_fulfilments_lot_id  ON fulfilments(lot_id);
```

- [x] **Step 5: Verify TypeScript compiles**

```bash
cd apps/shipping && npx tsc --noEmit
```

Expected: no errors (no source files yet — just config validation)

- [x] **Step 6: Commit**

```bash
git add apps/shipping/
git commit -m "feat(shipping): scaffold package and DB migration"
```

---

### Task 2: Domain layer

**Files:**
- Create: `apps/shipping/src/domain/fulfilment.ts`
- Create: `apps/shipping/src/domain/fulfilment-repository.ts`
- Test: `apps/shipping/src/domain/fulfilment.test.ts`

**Interfaces:**
- Produces:
  - `Fulfilment` entity class with `chooseShip(address)`, `chooseCollect(slot)`, `markDispatched()`, `markCollected()` methods
  - `FulfilmentStatus` enum: `PENDING_CHOICE | PENDING_DISPATCH | DISPATCHED | COLLECTED`
  - `FulfilmentMethod` enum: `SHIP | COLLECT`
  - `ShippingAddress` interface
  - `CollectionSlot` interface
  - `FulfilmentRepository` interface

- [x] **Step 1: Write failing tests**

Create `apps/shipping/src/domain/fulfilment.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Fulfilment, FulfilmentStatus, FulfilmentMethod } from './fulfilment';

describe('Fulfilment', () => {
  const makeNew = () =>
    Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'user-1' });

  describe('chooseShip', () => {
    it('should_setMethodToShip_when_statusIsPendingChoice', () => {
      const fulfilment = makeNew();
      const address = {
        id: 'addr-1',
        fulfilmentId: 'f-1',
        fullName: 'Jane Smith',
        line1: '1 Queen St',
        line2: null,
        city: 'Melbourne',
        state: 'VIC',
        postcode: '3000',
        country: 'AU',
      };

      fulfilment.chooseShip(address);

      expect(fulfilment.method).toBe(FulfilmentMethod.SHIP);
      expect(fulfilment.status).toBe(FulfilmentStatus.PENDING_DISPATCH);
      expect(fulfilment.shippingAddress).toEqual(address);
    });

    it('should_throwError_when_methodAlreadyChosen', () => {
      const fulfilment = makeNew();
      const address = {
        id: 'addr-1',
        fulfilmentId: 'f-1',
        fullName: 'Jane Smith',
        line1: '1 Queen St',
        line2: null,
        city: 'Melbourne',
        state: 'VIC',
        postcode: '3000',
        country: 'AU',
      };
      fulfilment.chooseShip(address);

      expect(() => fulfilment.chooseShip(address)).toThrow('Fulfilment method already chosen');
    });
  });

  describe('chooseCollect', () => {
    it('should_setMethodToCollect_when_statusIsPendingChoice', () => {
      const fulfilment = makeNew();
      const slot = {
        id: 'slot-1',
        fulfilmentId: 'f-1',
        location: 'Sydney Store',
        date: '2026-07-01',
        timeSlot: '10:00-11:00',
      };

      fulfilment.chooseCollect(slot);

      expect(fulfilment.method).toBe(FulfilmentMethod.COLLECT);
      expect(fulfilment.status).toBe(FulfilmentStatus.PENDING_DISPATCH);
      expect(fulfilment.collectionSlot).toEqual(slot);
    });
  });

  describe('markDispatched', () => {
    it('should_setStatusToDispatched_when_methodIsShipAndPendingDispatch', () => {
      const fulfilment = makeNew();
      const address = {
        id: 'addr-1', fulfilmentId: 'f-1', fullName: 'Jane', line1: '1 St',
        line2: null, city: 'Mel', state: 'VIC', postcode: '3000', country: 'AU',
      };
      fulfilment.chooseShip(address);

      fulfilment.markDispatched();

      expect(fulfilment.status).toBe(FulfilmentStatus.DISPATCHED);
    });

    it('should_throwError_when_notPendingDispatch', () => {
      const fulfilment = makeNew();

      expect(() => fulfilment.markDispatched()).toThrow('Cannot dispatch: fulfilment not pending dispatch');
    });
  });

  describe('markCollected', () => {
    it('should_setStatusToCollected_when_methodIsCollectAndPendingDispatch', () => {
      const fulfilment = makeNew();
      const slot = {
        id: 'slot-1', fulfilmentId: 'f-1', location: 'Sydney Store',
        date: '2026-07-01', timeSlot: '10:00-11:00',
      };
      fulfilment.chooseCollect(slot);

      fulfilment.markCollected();

      expect(fulfilment.status).toBe(FulfilmentStatus.COLLECTED);
    });

    it('should_throwError_when_notPendingDispatch', () => {
      const fulfilment = makeNew();

      expect(() => fulfilment.markCollected()).toThrow('Cannot mark collected: fulfilment not pending dispatch');
    });
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
cd apps/shipping && npx vitest run src/domain/fulfilment.test.ts
```

Expected: FAIL — `Cannot find module './fulfilment'`

- [x] **Step 3: Implement the domain entities**

Create `apps/shipping/src/domain/fulfilment.ts`:

```typescript
export enum FulfilmentStatus {
  PENDING_CHOICE = 'PENDING_CHOICE',
  PENDING_DISPATCH = 'PENDING_DISPATCH',
  DISPATCHED = 'DISPATCHED',
  COLLECTED = 'COLLECTED',
}

export enum FulfilmentMethod {
  SHIP = 'SHIP',
  COLLECT = 'COLLECT',
}

export interface ShippingAddress {
  id: string;
  fulfilmentId: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postcode: string;
  country: string;
}

export interface CollectionSlot {
  id: string;
  fulfilmentId: string;
  location: string;
  date: string;
  timeSlot: string;
}

export interface FulfilmentProps {
  id: string;
  lotId: string;
  userId: string;
  method: FulfilmentMethod | null;
  status: FulfilmentStatus;
  shippingAddress: ShippingAddress | null;
  collectionSlot: CollectionSlot | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Fulfilment {
  private props: FulfilmentProps;

  private constructor(props: FulfilmentProps) {
    this.props = props;
  }

  static create(params: { id: string; lotId: string; userId: string }): Fulfilment {
    return new Fulfilment({
      id: params.id,
      lotId: params.lotId,
      userId: params.userId,
      method: null,
      status: FulfilmentStatus.PENDING_CHOICE,
      shippingAddress: null,
      collectionSlot: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static reconstitute(props: FulfilmentProps): Fulfilment {
    return new Fulfilment(props);
  }

  get id(): string { return this.props.id; }
  get lotId(): string { return this.props.lotId; }
  get userId(): string { return this.props.userId; }
  get method(): FulfilmentMethod | null { return this.props.method; }
  get status(): FulfilmentStatus { return this.props.status; }
  get shippingAddress(): ShippingAddress | null { return this.props.shippingAddress; }
  get collectionSlot(): CollectionSlot | null { return this.props.collectionSlot; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  chooseShip(address: ShippingAddress): void {
    if (this.props.method !== null) {
      throw new Error('Fulfilment method already chosen');
    }
    this.props.method = FulfilmentMethod.SHIP;
    this.props.status = FulfilmentStatus.PENDING_DISPATCH;
    this.props.shippingAddress = address;
    this.props.updatedAt = new Date();
  }

  chooseCollect(slot: CollectionSlot): void {
    if (this.props.method !== null) {
      throw new Error('Fulfilment method already chosen');
    }
    this.props.method = FulfilmentMethod.COLLECT;
    this.props.status = FulfilmentStatus.PENDING_DISPATCH;
    this.props.collectionSlot = slot;
    this.props.updatedAt = new Date();
  }

  markDispatched(): void {
    if (this.props.status !== FulfilmentStatus.PENDING_DISPATCH) {
      throw new Error('Cannot dispatch: fulfilment not pending dispatch');
    }
    this.props.status = FulfilmentStatus.DISPATCHED;
    this.props.updatedAt = new Date();
  }

  markCollected(): void {
    if (this.props.status !== FulfilmentStatus.PENDING_DISPATCH) {
      throw new Error('Cannot mark collected: fulfilment not pending dispatch');
    }
    this.props.status = FulfilmentStatus.COLLECTED;
    this.props.updatedAt = new Date();
  }

  toProps(): FulfilmentProps {
    return { ...this.props };
  }
}
```

- [x] **Step 4: Create `apps/shipping/src/domain/fulfilment-repository.ts`**

```typescript
import { Fulfilment, ShippingAddress, CollectionSlot } from './fulfilment';

export interface FulfilmentRepository {
  findById(id: string): Promise<Fulfilment | null>;
  findByLotId(lotId: string): Promise<Fulfilment | null>;
  save(fulfilment: Fulfilment): Promise<void>;
  saveWithAddress(fulfilment: Fulfilment, address: ShippingAddress): Promise<void>;
  saveWithSlot(fulfilment: Fulfilment, slot: CollectionSlot): Promise<void>;
}
```

- [x] **Step 5: Run tests to verify they pass**

```bash
cd apps/shipping && npx vitest run src/domain/fulfilment.test.ts
```

Expected: all 7 tests PASS

- [x] **Step 6: Commit**

```bash
git add apps/shipping/src/domain/
git commit -m "feat(shipping): domain layer — Fulfilment entity and repository interface"
```

---

### Task 3: PostgresFulfilmentRepository

**Files:**
- Create: `apps/shipping/src/infrastructure/db/db.ts`
- Create: `apps/shipping/src/infrastructure/db/postgres-fulfilment-repository.ts`
- Test: `apps/shipping/src/infrastructure/db/postgres-fulfilment-repository.test.ts`

**Interfaces:**
- Consumes: `FulfilmentRepository` interface from Task 2; `Fulfilment`, `FulfilmentStatus`, `FulfilmentMethod`, `ShippingAddress`, `CollectionSlot`, `FulfilmentProps` from Task 2
- Produces: `PostgresFulfilmentRepository` class implementing `FulfilmentRepository`; `createDb(url)` factory; `Db` type

- [x] **Step 1: Create `apps/shipping/src/infrastructure/db/db.ts`**

```typescript
import postgres from 'postgres';

export type Db = ReturnType<typeof postgres>;

export function createDb(connectionUrl: string): Db {
  return postgres(connectionUrl);
}
```

- [x] **Step 2: Write failing tests**

Create `apps/shipping/src/infrastructure/db/postgres-fulfilment-repository.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgresFulfilmentRepository } from './postgres-fulfilment-repository';
import { createDb, Db } from './db';
import { Fulfilment, FulfilmentStatus, ShippingAddress } from '../../domain/fulfilment';
import { v4 as uuidv4 } from 'uuid';

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/shipping_test';

describe('PostgresFulfilmentRepository', () => {
  let db: Db;
  let repo: PostgresFulfilmentRepository;

  beforeAll(async () => {
    db = createDb(TEST_DB_URL);
    repo = new PostgresFulfilmentRepository(db);
    await db`
      CREATE TABLE IF NOT EXISTS fulfilments (
        id UUID PRIMARY KEY,
        lot_id UUID NOT NULL,
        user_id UUID NOT NULL,
        method TEXT,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS shipping_addresses (
        id UUID PRIMARY KEY,
        fulfilment_id UUID NOT NULL REFERENCES fulfilments(id),
        full_name TEXT NOT NULL,
        line1 TEXT NOT NULL,
        line2 TEXT,
        city TEXT NOT NULL,
        state TEXT,
        postcode TEXT NOT NULL,
        country TEXT NOT NULL
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS collection_slots (
        id UUID PRIMARY KEY,
        fulfilment_id UUID NOT NULL REFERENCES fulfilments(id),
        location TEXT NOT NULL,
        date DATE NOT NULL,
        time_slot TEXT NOT NULL
      )
    `;
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db`TRUNCATE collection_slots, shipping_addresses, fulfilments CASCADE`;
  });

  it('should_saveAndRetrieveFulfilment_when_fulfilmentCreated', async () => {
    const fulfilment = Fulfilment.create({
      id: uuidv4(),
      lotId: uuidv4(),
      userId: uuidv4(),
    });

    await repo.save(fulfilment);
    const found = await repo.findById(fulfilment.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(fulfilment.id);
    expect(found!.status).toBe(FulfilmentStatus.PENDING_CHOICE);
    expect(found!.method).toBeNull();
  });

  it('should_saveWithAddressAndRetrieve_when_shipChosen', async () => {
    const id = uuidv4();
    const fulfilment = Fulfilment.create({ id, lotId: uuidv4(), userId: uuidv4() });
    const address: ShippingAddress = {
      id: uuidv4(),
      fulfilmentId: id,
      fullName: 'Jane Smith',
      line1: '1 Queen St',
      line2: null,
      city: 'Melbourne',
      state: 'VIC',
      postcode: '3000',
      country: 'AU',
    };
    fulfilment.chooseShip(address);

    await repo.saveWithAddress(fulfilment, address);
    const found = await repo.findById(id);

    expect(found!.method).toBe('SHIP');
    expect(found!.shippingAddress).not.toBeNull();
    expect(found!.shippingAddress!.city).toBe('Melbourne');
  });

  it('should_findByLotId_when_fulfilmentExists', async () => {
    const lotId = uuidv4();
    const fulfilment = Fulfilment.create({ id: uuidv4(), lotId, userId: uuidv4() });
    await repo.save(fulfilment);

    const found = await repo.findByLotId(lotId);

    expect(found).not.toBeNull();
    expect(found!.lotId).toBe(lotId);
  });
});
```

- [x] **Step 3: Run tests to verify they fail**

```bash
cd apps/shipping && npx vitest run src/infrastructure/db/postgres-fulfilment-repository.test.ts
```

Expected: FAIL — `Cannot find module './postgres-fulfilment-repository'`

- [x] **Step 4: Implement `PostgresFulfilmentRepository`**

Create `apps/shipping/src/infrastructure/db/postgres-fulfilment-repository.ts`:

```typescript
import { Db } from './db';
import {
  Fulfilment,
  FulfilmentMethod,
  FulfilmentProps,
  FulfilmentStatus,
  ShippingAddress,
  CollectionSlot,
} from '../../domain/fulfilment';
import { FulfilmentRepository } from '../../domain/fulfilment-repository';

interface FulfilmentRow {
  id: string;
  lot_id: string;
  user_id: string;
  method: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface AddressRow {
  id: string;
  fulfilment_id: string;
  full_name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postcode: string;
  country: string;
}

interface SlotRow {
  id: string;
  fulfilment_id: string;
  location: string;
  date: string;
  time_slot: string;
}

export class PostgresFulfilmentRepository implements FulfilmentRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Fulfilment | null> {
    const [row] = await this.db<FulfilmentRow[]>`
      SELECT * FROM fulfilments WHERE id = ${id}
    `;
    if (!row) return null;
    return this.hydrate(row);
  }

  async findByLotId(lotId: string): Promise<Fulfilment | null> {
    const [row] = await this.db<FulfilmentRow[]>`
      SELECT * FROM fulfilments WHERE lot_id = ${lotId}
    `;
    if (!row) return null;
    return this.hydrate(row);
  }

  async save(fulfilment: Fulfilment): Promise<void> {
    const p = fulfilment.toProps();
    await this.db`
      INSERT INTO fulfilments (id, lot_id, user_id, method, status, created_at, updated_at)
      VALUES (${p.id}, ${p.lotId}, ${p.userId}, ${p.method}, ${p.status}, ${p.createdAt}, ${p.updatedAt})
      ON CONFLICT (id) DO UPDATE
        SET method = EXCLUDED.method,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at
    `;
  }

  async saveWithAddress(fulfilment: Fulfilment, address: ShippingAddress): Promise<void> {
    await this.save(fulfilment);
    await this.db`
      INSERT INTO shipping_addresses
        (id, fulfilment_id, full_name, line1, line2, city, state, postcode, country)
      VALUES (
        ${address.id}, ${address.fulfilmentId}, ${address.fullName},
        ${address.line1}, ${address.line2 ?? null}, ${address.city},
        ${address.state ?? null}, ${address.postcode}, ${address.country}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async saveWithSlot(fulfilment: Fulfilment, slot: CollectionSlot): Promise<void> {
    await this.save(fulfilment);
    await this.db`
      INSERT INTO collection_slots (id, fulfilment_id, location, date, time_slot)
      VALUES (${slot.id}, ${slot.fulfilmentId}, ${slot.location}, ${slot.date}, ${slot.timeSlot})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  private async hydrate(row: FulfilmentRow): Promise<Fulfilment> {
    let shippingAddress: ShippingAddress | null = null;
    let collectionSlot: CollectionSlot | null = null;

    if (row.method === FulfilmentMethod.SHIP) {
      const [addr] = await this.db<AddressRow[]>`
        SELECT * FROM shipping_addresses WHERE fulfilment_id = ${row.id}
      `;
      if (addr) {
        shippingAddress = {
          id: addr.id,
          fulfilmentId: addr.fulfilment_id,
          fullName: addr.full_name,
          line1: addr.line1,
          line2: addr.line2,
          city: addr.city,
          state: addr.state,
          postcode: addr.postcode,
          country: addr.country,
        };
      }
    }

    if (row.method === FulfilmentMethod.COLLECT) {
      const [slot] = await this.db<SlotRow[]>`
        SELECT * FROM collection_slots WHERE fulfilment_id = ${row.id}
      `;
      if (slot) {
        collectionSlot = {
          id: slot.id,
          fulfilmentId: slot.fulfilment_id,
          location: slot.location,
          date: slot.date,
          timeSlot: slot.time_slot,
        };
      }
    }

    const props: FulfilmentProps = {
      id: row.id,
      lotId: row.lot_id,
      userId: row.user_id,
      method: row.method as FulfilmentMethod | null,
      status: row.status as FulfilmentStatus,
      shippingAddress,
      collectionSlot,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return Fulfilment.reconstitute(props);
  }
}
```

- [x] **Step 5: Run tests to verify they pass**

First create the test database if it does not exist:

```bash
psql -U postgres -c "CREATE DATABASE shipping_test;"
```

Then run the tests:

```bash
cd apps/shipping && npx vitest run src/infrastructure/db/postgres-fulfilment-repository.test.ts
```

Expected: all 3 tests PASS

- [x] **Step 6: Commit**

```bash
git add apps/shipping/src/infrastructure/db/
git commit -m "feat(shipping): PostgresFulfilmentRepository with TDD"
```

---

### Task 4: Application use cases

**Files:**
- Create: `apps/shipping/src/application/create-fulfilment.use-case.ts`
- Create: `apps/shipping/src/application/choose-ship.use-case.ts`
- Create: `apps/shipping/src/application/choose-collect.use-case.ts`
- Create: `apps/shipping/src/application/mark-dispatched.use-case.ts`
- Create: `apps/shipping/src/application/mark-collected.use-case.ts`
- Create: `apps/shipping/src/application/get-fulfilment.use-case.ts`
- Test: `apps/shipping/src/application/use-cases.test.ts`

**Interfaces:**
- Consumes: `Fulfilment`, `FulfilmentStatus`, `ShippingAddress`, `CollectionSlot` from Task 2; `FulfilmentRepository` from Task 2
- Produces: six use case classes, each with a single `execute(dto)` method

- [x] **Step 1: Write failing tests**

Create `apps/shipping/src/application/use-cases.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateFulfilmentUseCase } from './create-fulfilment.use-case';
import { ChooseShipUseCase } from './choose-ship.use-case';
import { ChooseCollectUseCase } from './choose-collect.use-case';
import { MarkDispatchedUseCase } from './mark-dispatched.use-case';
import { MarkCollectedUseCase } from './mark-collected.use-case';
import { GetFulfilmentUseCase } from './get-fulfilment.use-case';
import { Fulfilment, FulfilmentStatus } from '../domain/fulfilment';
import { FulfilmentRepository } from '../domain/fulfilment-repository';

const makeAddress = (fulfilmentId: string) => ({
  id: 'addr-1',
  fulfilmentId,
  fullName: 'Jane Smith',
  line1: '1 Queen St',
  line2: null,
  city: 'Melbourne',
  state: 'VIC',
  postcode: '3000',
  country: 'AU',
});

const makeSlot = (fulfilmentId: string) => ({
  id: 'slot-1',
  fulfilmentId,
  location: 'Sydney Store',
  date: '2026-07-01',
  timeSlot: '10:00-11:00',
});

const makeMockRepo = (): FulfilmentRepository => ({
  findById: vi.fn(),
  findByLotId: vi.fn(),
  save: vi.fn(),
  saveWithAddress: vi.fn(),
  saveWithSlot: vi.fn(),
});

describe('CreateFulfilmentUseCase', () => {
  it('should_createFulfilment_when_paymentReceived', async () => {
    const repo = makeMockRepo();
    const sut = new CreateFulfilmentUseCase(repo);

    await sut.execute({ lotId: 'lot-1', userId: 'user-1' });

    expect(repo.save).toHaveBeenCalledOnce();
    const saved = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Fulfilment;
    expect(saved.lotId).toBe('lot-1');
    expect(saved.status).toBe(FulfilmentStatus.PENDING_CHOICE);
  });
});

describe('ChooseShipUseCase', () => {
  it('should_updateFulfilmentWithAddress_when_shipChosen', async () => {
    const repo = makeMockRepo();
    const fulfilment = Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'user-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(fulfilment);
    const sut = new ChooseShipUseCase(repo);

    await sut.execute({ fulfilmentId: 'f-1', userId: 'user-1', address: makeAddress('f-1') });

    expect(repo.saveWithAddress).toHaveBeenCalledOnce();
  });

  it('should_throwError_when_fulfilmentNotFound', async () => {
    const repo = makeMockRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const sut = new ChooseShipUseCase(repo);

    await expect(
      sut.execute({ fulfilmentId: 'f-1', userId: 'user-1', address: makeAddress('f-1') })
    ).rejects.toThrow('Fulfilment not found');
  });

  it('should_throwError_when_userDoesNotOwnFulfilment', async () => {
    const repo = makeMockRepo();
    const fulfilment = Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'owner-999' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(fulfilment);
    const sut = new ChooseShipUseCase(repo);

    await expect(
      sut.execute({ fulfilmentId: 'f-1', userId: 'different-user', address: makeAddress('f-1') })
    ).rejects.toThrow('Forbidden');
  });
});

describe('MarkDispatchedUseCase', () => {
  it('should_markDispatched_when_pendingDispatch', async () => {
    const repo = makeMockRepo();
    const fulfilment = Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'user-1' });
    const address = makeAddress('f-1');
    fulfilment.chooseShip(address);
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(fulfilment);
    const sut = new MarkDispatchedUseCase(repo);

    await sut.execute({ fulfilmentId: 'f-1' });

    expect(repo.save).toHaveBeenCalledOnce();
    const saved = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Fulfilment;
    expect(saved.status).toBe(FulfilmentStatus.DISPATCHED);
  });
});

describe('GetFulfilmentUseCase', () => {
  it('should_returnFulfilment_when_userOwnsIt', async () => {
    const repo = makeMockRepo();
    const fulfilment = Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'user-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(fulfilment);
    const sut = new GetFulfilmentUseCase(repo);

    const result = await sut.execute({ fulfilmentId: 'f-1', userId: 'user-1' });

    expect(result.id).toBe('f-1');
  });

  it('should_throwError_when_userDoesNotOwn', async () => {
    const repo = makeMockRepo();
    const fulfilment = Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'owner-999' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(fulfilment);
    const sut = new GetFulfilmentUseCase(repo);

    await expect(
      sut.execute({ fulfilmentId: 'f-1', userId: 'different-user' })
    ).rejects.toThrow('Forbidden');
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
cd apps/shipping && npx vitest run src/application/use-cases.test.ts
```

Expected: FAIL — cannot find modules

- [x] **Step 3: Implement `CreateFulfilmentUseCase`**

Create `apps/shipping/src/application/create-fulfilment.use-case.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Fulfilment } from '../domain/fulfilment';
import { FulfilmentRepository } from '../domain/fulfilment-repository';

interface CreateFulfilmentDto {
  lotId: string;
  userId: string;
}

export class CreateFulfilmentUseCase {
  constructor(private readonly repo: FulfilmentRepository) {}

  async execute(dto: CreateFulfilmentDto): Promise<void> {
    const fulfilment = Fulfilment.create({
      id: uuidv4(),
      lotId: dto.lotId,
      userId: dto.userId,
    });
    await this.repo.save(fulfilment);
  }
}
```

- [x] **Step 4: Implement `ChooseShipUseCase`**

Create `apps/shipping/src/application/choose-ship.use-case.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { ShippingAddress } from '../domain/fulfilment';
import { FulfilmentRepository } from '../domain/fulfilment-repository';

interface AddressInput {
  id?: string;
  fulfilmentId?: string;
  fullName: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postcode: string;
  country: string;
}

interface ChooseShipDto {
  fulfilmentId: string;
  userId: string;
  address: AddressInput;
}

export class ChooseShipUseCase {
  constructor(private readonly repo: FulfilmentRepository) {}

  async execute(dto: ChooseShipDto): Promise<void> {
    const fulfilment = await this.repo.findById(dto.fulfilmentId);
    if (!fulfilment) throw new Error('Fulfilment not found');
    if (fulfilment.userId !== dto.userId) throw new Error('Forbidden');

    const address: ShippingAddress = {
      id: dto.address.id ?? uuidv4(),
      fulfilmentId: dto.fulfilmentId,
      fullName: dto.address.fullName,
      line1: dto.address.line1,
      line2: dto.address.line2 ?? null,
      city: dto.address.city,
      state: dto.address.state ?? null,
      postcode: dto.address.postcode,
      country: dto.address.country,
    };

    fulfilment.chooseShip(address);
    await this.repo.saveWithAddress(fulfilment, address);
  }
}
```

- [x] **Step 5: Implement `ChooseCollectUseCase`**

Create `apps/shipping/src/application/choose-collect.use-case.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { CollectionSlot } from '../domain/fulfilment';
import { FulfilmentRepository } from '../domain/fulfilment-repository';

interface ChooseCollectDto {
  fulfilmentId: string;
  userId: string;
  slot: {
    location: string;
    date: string;
    timeSlot: string;
  };
}

export class ChooseCollectUseCase {
  constructor(private readonly repo: FulfilmentRepository) {}

  async execute(dto: ChooseCollectDto): Promise<void> {
    const fulfilment = await this.repo.findById(dto.fulfilmentId);
    if (!fulfilment) throw new Error('Fulfilment not found');
    if (fulfilment.userId !== dto.userId) throw new Error('Forbidden');

    const slot: CollectionSlot = {
      id: uuidv4(),
      fulfilmentId: dto.fulfilmentId,
      location: dto.slot.location,
      date: dto.slot.date,
      timeSlot: dto.slot.timeSlot,
    };

    fulfilment.chooseCollect(slot);
    await this.repo.saveWithSlot(fulfilment, slot);
  }
}
```

- [x] **Step 6: Implement `MarkDispatchedUseCase`**

Create `apps/shipping/src/application/mark-dispatched.use-case.ts`:

```typescript
import { FulfilmentRepository } from '../domain/fulfilment-repository';

interface MarkDispatchedDto {
  fulfilmentId: string;
}

export class MarkDispatchedUseCase {
  constructor(private readonly repo: FulfilmentRepository) {}

  async execute(dto: MarkDispatchedDto): Promise<void> {
    const fulfilment = await this.repo.findById(dto.fulfilmentId);
    if (!fulfilment) throw new Error('Fulfilment not found');
    fulfilment.markDispatched();
    await this.repo.save(fulfilment);
  }
}
```

- [x] **Step 7: Implement `MarkCollectedUseCase`**

Create `apps/shipping/src/application/mark-collected.use-case.ts`:

```typescript
import { FulfilmentRepository } from '../domain/fulfilment-repository';

interface MarkCollectedDto {
  fulfilmentId: string;
}

export class MarkCollectedUseCase {
  constructor(private readonly repo: FulfilmentRepository) {}

  async execute(dto: MarkCollectedDto): Promise<void> {
    const fulfilment = await this.repo.findById(dto.fulfilmentId);
    if (!fulfilment) throw new Error('Fulfilment not found');
    fulfilment.markCollected();
    await this.repo.save(fulfilment);
  }
}
```

- [x] **Step 8: Implement `GetFulfilmentUseCase`**

Create `apps/shipping/src/application/get-fulfilment.use-case.ts`:

```typescript
import { Fulfilment } from '../domain/fulfilment';
import { FulfilmentRepository } from '../domain/fulfilment-repository';

interface GetFulfilmentDto {
  fulfilmentId: string;
  userId: string;
}

export class GetFulfilmentUseCase {
  constructor(private readonly repo: FulfilmentRepository) {}

  async execute(dto: GetFulfilmentDto): Promise<Fulfilment> {
    const fulfilment = await this.repo.findById(dto.fulfilmentId);
    if (!fulfilment) throw new Error('Fulfilment not found');
    if (fulfilment.userId !== dto.userId) throw new Error('Forbidden');
    return fulfilment;
  }
}
```

- [x] **Step 9: Run tests to verify they pass**

```bash
cd apps/shipping && npx vitest run src/application/use-cases.test.ts
```

Expected: all 7 tests PASS

- [x] **Step 10: Commit**

```bash
git add apps/shipping/src/application/
git commit -m "feat(shipping): application use cases with TDD"
```

---

### Task 5: RabbitMQ event handlers and publishers

**Files:**
- Create: `apps/shipping/src/infrastructure/events/payment-received-handler.ts`
- Create: `apps/shipping/src/infrastructure/events/item-dispatched-publisher.ts`
- Create: `apps/shipping/src/infrastructure/events/item-collected-publisher.ts`
- Test: `apps/shipping/src/infrastructure/events/payment-received-handler.test.ts`

**Interfaces:**
- Consumes: `CreateFulfilmentUseCase` from Task 4; `EventSubscriber`, `EventPublisher` from `@carat-room/shared-events`; `ROUTING_KEYS`, `PaymentReceivedPayload`, `ItemDispatchedPayload`, `ItemCollectedPayload` from `@carat-room/shared-types`
- Produces: `PaymentReceivedHandler` class; `ItemDispatchedPublisher` class; `ItemCollectedPublisher` class

- [x] **Step 1: Write failing test**

Create `apps/shipping/src/infrastructure/events/payment-received-handler.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentReceivedHandler } from './payment-received-handler';
import { CreateFulfilmentUseCase } from '../../application/create-fulfilment.use-case';
import { PaymentReceivedPayload } from '@carat-room/shared-types';

const makeUseCase = () =>
  ({ execute: vi.fn() } as unknown as CreateFulfilmentUseCase);

describe('PaymentReceivedHandler', () => {
  let useCase: CreateFulfilmentUseCase;
  let handler: PaymentReceivedHandler;

  beforeEach(() => {
    useCase = makeUseCase();
    handler = new PaymentReceivedHandler(useCase);
  });

  it('should_createFulfilment_when_paymentReceived', async () => {
    const payload: PaymentReceivedPayload = {
      invoiceId: 'inv-1',
      lotId: 'lot-1',
      userId: 'user-1',
      amount: 500,
      currency: 'AUD',
      paidAt: '2026-06-20T10:00:00Z',
    };

    await handler.handle(payload);

    expect(useCase.execute).toHaveBeenCalledWith({
      lotId: 'lot-1',
      userId: 'user-1',
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
cd apps/shipping && npx vitest run src/infrastructure/events/payment-received-handler.test.ts
```

Expected: FAIL — cannot find module

- [x] **Step 3: Implement `PaymentReceivedHandler`**

Create `apps/shipping/src/infrastructure/events/payment-received-handler.ts`:

```typescript
import { PaymentReceivedPayload } from '@carat-room/shared-types';
import { CreateFulfilmentUseCase } from '../../application/create-fulfilment.use-case';

export class PaymentReceivedHandler {
  constructor(private readonly createFulfilment: CreateFulfilmentUseCase) {}

  async handle(payload: PaymentReceivedPayload): Promise<void> {
    await this.createFulfilment.execute({
      lotId: payload.lotId,
      userId: payload.userId,
    });
  }
}
```

- [x] **Step 4: Implement `ItemDispatchedPublisher`**

Create `apps/shipping/src/infrastructure/events/item-dispatched-publisher.ts`:

```typescript
import { EventPublisher } from '@carat-room/shared-events';
import { ROUTING_KEYS, ItemDispatchedPayload } from '@carat-room/shared-types';

export class ItemDispatchedPublisher {
  constructor(private readonly publisher: EventPublisher) {}

  async publish(payload: ItemDispatchedPayload): Promise<void> {
    await this.publisher.publish(ROUTING_KEYS.SHIPPING_ITEM_DISPATCHED, payload);
  }
}
```

- [x] **Step 5: Implement `ItemCollectedPublisher`**

Create `apps/shipping/src/infrastructure/events/item-collected-publisher.ts`:

```typescript
import { EventPublisher } from '@carat-room/shared-events';
import { ROUTING_KEYS, ItemCollectedPayload } from '@carat-room/shared-types';

export class ItemCollectedPublisher {
  constructor(private readonly publisher: EventPublisher) {}

  async publish(payload: ItemCollectedPayload): Promise<void> {
    await this.publisher.publish(ROUTING_KEYS.SHIPPING_ITEM_COLLECTED, payload);
  }
}
```

- [x] **Step 6: Run test to verify it passes**

```bash
cd apps/shipping && npx vitest run src/infrastructure/events/payment-received-handler.test.ts
```

Expected: 1 test PASS

- [x] **Step 7: Commit**

```bash
git add apps/shipping/src/infrastructure/events/
git commit -m "feat(shipping): RabbitMQ handlers and publishers"
```

---

### Task 6: Hono routes, wiring, and Dockerfile

**Files:**
- Create: `apps/shipping/src/presentation/shipping-router.ts`
- Test: `apps/shipping/src/presentation/shipping-router.test.ts`
- Create: `apps/shipping/src/main.ts`
- Create: `apps/shipping/Dockerfile`

**Interfaces:**
- Consumes: `GetFulfilmentUseCase`, `ChooseShipUseCase`, `ChooseCollectUseCase`, `MarkDispatchedUseCase`, `MarkCollectedUseCase` from Task 4; `authMiddleware`, `JwtPayload` from `@carat-room/shared-auth`; `PaymentReceivedHandler` from Task 5; `createAmqpConnection`, `EventSubscriber`, `EventPublisher` from `@carat-room/shared-events`; `createDb` from Task 3
- Produces: Hono app on port 3004 with `GET /health` + 3 buyer routes

- [x] **Step 1: Write failing tests**

Create `apps/shipping/src/presentation/shipping-router.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { buildShippingRouter } from './shipping-router';
import { GetFulfilmentUseCase } from '../application/get-fulfilment.use-case';
import { ChooseShipUseCase } from '../application/choose-ship.use-case';
import { ChooseCollectUseCase } from '../application/choose-collect.use-case';
import { MarkDispatchedUseCase } from '../application/mark-dispatched.use-case';
import { MarkCollectedUseCase } from '../application/mark-collected.use-case';
import { Fulfilment, FulfilmentStatus } from '../domain/fulfilment';
import { JwtPayload } from '@carat-room/shared-auth';

const makeUseCases = () => ({
  getFulfilment: { execute: vi.fn() } as unknown as GetFulfilmentUseCase,
  chooseShip: { execute: vi.fn() } as unknown as ChooseShipUseCase,
  chooseCollect: { execute: vi.fn() } as unknown as ChooseCollectUseCase,
  markDispatched: { execute: vi.fn() } as unknown as MarkDispatchedUseCase,
  markCollected: { execute: vi.fn() } as unknown as MarkCollectedUseCase,
});

const jwtMiddleware = (userId = 'user-1') =>
  vi.fn(async (c: any, next: any) => {
    c.set('jwtPayload', { userId, role: 'BUYER' } as JwtPayload);
    await next();
  });

describe('GET /api/shipping/fulfilments/:id', () => {
  it('should_return200_when_fulfilmentFound', async () => {
    const useCases = makeUseCases();
    const fulfilment = Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'user-1' });
    (useCases.getFulfilment.execute as ReturnType<typeof vi.fn>).mockResolvedValue(fulfilment);

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('f-1');
    expect(body.data.status).toBe(FulfilmentStatus.PENDING_CHOICE);
  });
});

describe('POST /api/shipping/fulfilments/:id/choose-ship', () => {
  it('should_return200_when_addressSubmitted', async () => {
    const useCases = makeUseCases();
    (useCases.chooseShip.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1/choose-ship', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Jane Smith',
        line1: '1 Queen St',
        city: 'Melbourne',
        postcode: '3000',
        country: 'AU',
      }),
    });

    expect(res.status).toBe(200);
  });

  it('should_return400_when_requiredFieldsMissing', async () => {
    const useCases = makeUseCases();
    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1/choose-ship', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Jane' }),
    });

    expect(res.status).toBe(400);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
cd apps/shipping && npx vitest run src/presentation/shipping-router.test.ts
```

Expected: FAIL — cannot find module

- [x] **Step 3: Implement `buildShippingRouter`**

Create `apps/shipping/src/presentation/shipping-router.ts`:

```typescript
import { Hono } from 'hono';
import { GetFulfilmentUseCase } from '../application/get-fulfilment.use-case';
import { ChooseShipUseCase } from '../application/choose-ship.use-case';
import { ChooseCollectUseCase } from '../application/choose-collect.use-case';
import { MarkDispatchedUseCase } from '../application/mark-dispatched.use-case';
import { MarkCollectedUseCase } from '../application/mark-collected.use-case';
import { JwtPayload } from '@carat-room/shared-auth';

interface UseCases {
  getFulfilment: GetFulfilmentUseCase;
  chooseShip: ChooseShipUseCase;
  chooseCollect: ChooseCollectUseCase;
  markDispatched: MarkDispatchedUseCase;
  markCollected: MarkCollectedUseCase;
}

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

export function buildShippingRouter(useCases: UseCases): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.get('/fulfilments/:id', async (c) => {
    const { userId } = c.get('jwtPayload');
    const { id } = c.req.param();
    try {
      const fulfilment = await useCases.getFulfilment.execute({ fulfilmentId: id, userId });
      const p = fulfilment.toProps();
      return c.json({
        data: {
          id: p.id,
          lotId: p.lotId,
          method: p.method,
          status: p.status,
          shippingAddress: p.shippingAddress,
          collectionSlot: p.collectionSlot,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Forbidden') {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, 403);
      }
      if (message === 'Fulfilment not found') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Fulfilment not found' } }, 404);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.post('/fulfilments/:id/choose-ship', async (c) => {
    const { userId } = c.get('jwtPayload');
    const { id } = c.req.param();
    const body = await c.req.json();

    const { fullName, line1, line2, city, state, postcode, country } = body;
    if (!fullName || !line1 || !city || !postcode || !country) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'fullName, line1, city, postcode and country are required' } },
        400,
      );
    }

    try {
      await useCases.chooseShip.execute({
        fulfilmentId: id,
        userId,
        address: { fullName, line1, line2: line2 ?? null, city, state: state ?? null, postcode, country },
      });
      return c.json({ data: { success: true } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Forbidden') {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, 403);
      }
      if (message === 'Fulfilment not found') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Fulfilment not found' } }, 404);
      }
      if (message === 'Fulfilment method already chosen') {
        return c.json({ error: { code: 'CONFLICT', message: 'Fulfilment method already chosen' } }, 409);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.post('/fulfilments/:id/choose-collect', async (c) => {
    const { userId } = c.get('jwtPayload');
    const { id } = c.req.param();
    const body = await c.req.json();

    const { location, date, timeSlot } = body;
    if (!location || !date || !timeSlot) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'location, date and timeSlot are required' } },
        400,
      );
    }

    try {
      await useCases.chooseCollect.execute({ fulfilmentId: id, userId, slot: { location, date, timeSlot } });
      return c.json({ data: { success: true } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Forbidden') {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, 403);
      }
      if (message === 'Fulfilment not found') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Fulfilment not found' } }, 404);
      }
      if (message === 'Fulfilment method already chosen') {
        return c.json({ error: { code: 'CONFLICT', message: 'Fulfilment method already chosen' } }, 409);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  return router;
}
```

- [x] **Step 4: Run tests to verify they pass**

```bash
cd apps/shipping && npx vitest run src/presentation/shipping-router.test.ts
```

Expected: all 3 tests PASS

- [x] **Step 5: Create `apps/shipping/src/main.ts`**

```typescript
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createDb } from './infrastructure/db/db';
import { PostgresFulfilmentRepository } from './infrastructure/db/postgres-fulfilment-repository';
import { CreateFulfilmentUseCase } from './application/create-fulfilment.use-case';
import { ChooseShipUseCase } from './application/choose-ship.use-case';
import { ChooseCollectUseCase } from './application/choose-collect.use-case';
import { MarkDispatchedUseCase } from './application/mark-dispatched.use-case';
import { MarkCollectedUseCase } from './application/mark-collected.use-case';
import { GetFulfilmentUseCase } from './application/get-fulfilment.use-case';
import { PaymentReceivedHandler } from './infrastructure/events/payment-received-handler';
import { buildShippingRouter } from './presentation/shipping-router';
import { createAmqpConnection, EventSubscriber } from '@carat-room/shared-events';
import { authMiddleware, JwtPayload } from '@carat-room/shared-auth';
import { PaymentReceivedPayload } from '@carat-room/shared-types';

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const amqpUrl = process.env.AMQP_URL;
  const jwtPublicKey = process.env.JWT_PUBLIC_KEY;
  const port = Number(process.env.PORT ?? 3004);

  if (!databaseUrl || !amqpUrl || !jwtPublicKey) {
    throw new Error('Missing required environment variables: DATABASE_URL, AMQP_URL, JWT_PUBLIC_KEY');
  }

  const db = createDb(databaseUrl);
  const repo = new PostgresFulfilmentRepository(db);

  const createFulfilment = new CreateFulfilmentUseCase(repo);
  const chooseShip = new ChooseShipUseCase(repo);
  const chooseCollect = new ChooseCollectUseCase(repo);
  const markDispatched = new MarkDispatchedUseCase(repo);
  const markCollected = new MarkCollectedUseCase(repo);
  const getFulfilment = new GetFulfilmentUseCase(repo);

  const amqp = await createAmqpConnection(amqpUrl);
  const subscriber = new EventSubscriber(amqp);

  const paymentReceivedHandler = new PaymentReceivedHandler(createFulfilment);

  await subscriber.subscribe<PaymentReceivedPayload>(
    'shipping.payment-received',
    async (payload) => {
      await paymentReceivedHandler.handle(payload);
    },
  );

  const app = new Hono<AppEnv>();

  app.get('/health', (c) => c.json({ status: 'ok', service: 'shipping' }));

  app.use('/api/*', authMiddleware(jwtPublicKey));
  app.route('/api/shipping', buildShippingRouter({
    getFulfilment,
    chooseShip,
    chooseCollect,
    markDispatched,
    markCollected,
  }));

  serve({ fetch: app.fetch, port }, () => {
    console.log(`Shipping service listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [x] **Step 6: Create `apps/shipping/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/shipping/package.json ./apps/shipping/
COPY packages/ ./packages/
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY apps/shipping/ ./apps/shipping/
RUN pnpm --filter @carat-room/shipping build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/shipping/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3004
CMD ["node", "dist/main.js"]
```

- [x] **Step 7: Run all tests**

```bash
cd apps/shipping && npx vitest run
```

Expected: all tests PASS

- [x] **Step 8: Verify TypeScript compiles cleanly**

```bash
cd apps/shipping && npx tsc --noEmit
```

Expected: no errors

- [x] **Step 9: Commit**

```bash
git add apps/shipping/src/presentation/ apps/shipping/src/main.ts apps/shipping/Dockerfile
git commit -m "feat(shipping): Hono router, main entry point, and Dockerfile"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| `fulfilments` table — `PENDING_CHOICE \| PENDING_DISPATCH \| DISPATCHED \| COLLECTED` | Task 1 |
| `shipping_addresses` table | Task 1 |
| `collection_slots` table | Task 1 |
| Consumes `PaymentReceived` → create fulfilment | Task 5 |
| Publishes `ItemDispatched` | Task 5 |
| Publishes `ItemCollected` | Task 5 |
| `GET /api/shipping/fulfilments/:id` — own resource only | Task 6 |
| `POST /api/shipping/fulfilments/:id/choose-ship` | Task 6 |
| `POST /api/shipping/fulfilments/:id/choose-collect` | Task 6 |
| Clean Architecture layers | Tasks 2–6 |
| Ownership check on all buyer routes | Tasks 4, 6 |
| Auth middleware on all `/api/*` routes | Task 6 |
| `GET /health` | Task 6 |

**Note:** `MarkDispatchedUseCase` and `MarkCollectedUseCase` are implemented and tested but are not exposed as HTTP routes here — they are called by the Admin Service via internal HTTP (plan `08-domain-admin/plan.md`). `ItemDispatchedPublisher` and `ItemCollectedPublisher` are wired in `main.ts` but the publish calls are triggered by the admin routes — wire them in Task 2 of `08-domain-admin/plan.md`.

### Placeholder scan
No TBDs, TODOs, or incomplete steps found.

### Type consistency
- `FulfilmentStatus` and `FulfilmentMethod` defined in Task 2 (`domain/fulfilment.ts`), used consistently across Tasks 3–6
- `ShippingAddress` and `CollectionSlot` interfaces defined in Task 2, passed through Tasks 3–5 without mutation
- `FulfilmentRepository` interface defined in Task 2, implemented in Task 3, injected into all use cases in Task 4
- `PaymentReceivedPayload`, `ItemDispatchedPayload`, `ItemCollectedPayload` imported from `@carat-room/shared-types` across Tasks 5–6
