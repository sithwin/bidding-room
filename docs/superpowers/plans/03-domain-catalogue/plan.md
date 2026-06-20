# Catalogue Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Catalogue Service — a Hono microservice that manages lot content, images, categories, and full-text search. It owns presentation data only; auction state lives in the Auction Engine.

**Architecture:** Clean Architecture (domain → application → infrastructure → presentation). The `Lot` and `Category` entities live in the domain layer with zero framework imports. A `SearchRepository` interface in the domain layer decouples search from the tsvector implementation — swapping to Meilisearch later requires a new adapter only. Images are stored in Cloudflare R2 via pre-signed PUT URLs; no binary data passes through the service.

**Tech Stack:** Node.js 20, TypeScript 5.4, Hono, postgres.js, Vitest, `@aws-sdk/client-s3` (pre-signed URLs), `@aws-sdk/s3-request-presigner`, `@carat-room/shared-types`, `@carat-room/shared-auth`

## Global Constraints

- All files TypeScript with strict mode; no `any`
- Hono only — no Express, no Fastify
- postgres.js for DB access — no ORM
- Vitest for all tests — no Jest
- Named exports only — no `export default`
- Single quotes for all string literals
- `const`/`let` only — no `var`
- Port: 3001
- Service name in monorepo: `apps/catalogue`
- Database name: `catalogue`
- Images stored in Cloudflare R2; service only stores URLs, never binary data
- `search_vector` maintained via Postgres trigger on `title` + `description`
- All list endpoints must be paginated (`limit`/`offset`)
- Public endpoints (GET lots, categories, search) require no auth
- All write endpoints (image upload, confirm) are admin-only — require `role === 'ADMIN'` in JWT

---

### Task 1: Package scaffold and DB migration

**Files:**
- Create: `apps/catalogue/package.json`
- Create: `apps/catalogue/tsconfig.json`
- Create: `apps/catalogue/vitest.config.ts`
- Create: `apps/catalogue/migrations/001_create_catalogue.sql`

**Interfaces:**
- Produces: runnable `vitest` and `tsc --noEmit` commands with zero errors

- [ ] **Step 1: Create `apps/catalogue/package.json`**

```json
{
  "name": "@carat-room/catalogue",
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
    "@aws-sdk/client-s3": "^3.600.0",
    "@aws-sdk/s3-request-presigner": "^3.600.0",
    "@carat-room/shared-auth": "workspace:*",
    "@carat-room/shared-types": "workspace:*",
    "@hono/node-server": "^1.12.0",
    "hono": "^4.4.0",
    "postgres": "^3.4.4",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "@types/node": "^20.0.0",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.16.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `apps/catalogue/tsconfig.json`**

```json
{
  "extends": "@carat-room/tsconfig/service.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `apps/catalogue/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create `apps/catalogue/migrations/001_create_catalogue.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  parent_id     UUID REFERENCES categories(id),
  display_order INT NOT NULL DEFAULT 0
);

CREATE TABLE lots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  description     TEXT,
  category_id     UUID REFERENCES categories(id),
  condition       TEXT CHECK (condition IN ('NEW', 'EXCELLENT', 'VERY_GOOD', 'GOOD')),
  estimated_value NUMERIC(12,2),
  search_vector   TSVECTOR,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lot_images (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_id        UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX lots_search_idx ON lots USING GIN(search_vector);
CREATE INDEX lot_images_lot_id_idx ON lot_images(lot_id);

CREATE FUNCTION lots_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lots_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, description ON lots
  FOR EACH ROW EXECUTE FUNCTION lots_search_vector_update();
```

- [ ] **Step 5: Run `pnpm install` from repo root**

```bash
pnpm install
```

Expected: resolves workspace packages, no errors.

- [ ] **Step 6: Verify TypeScript compiles**

Create `apps/catalogue/src/main.ts` with a single line:

```typescript
export {};
```

Then run:

```bash
cd apps/catalogue && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/catalogue/
git commit -m "feat(catalogue): scaffold package, tsconfig, vitest config, DB migration"
```

---

### Task 2: Domain layer — Lot and Category entities

**Files:**
- Create: `apps/catalogue/src/domain/lot.ts`
- Create: `apps/catalogue/src/domain/category.ts`
- Create: `apps/catalogue/src/domain/lot-repository.ts`
- Create: `apps/catalogue/src/domain/category-repository.ts`
- Create: `apps/catalogue/src/domain/search-repository.ts`
- Create: `apps/catalogue/src/domain/lot.test.ts`

**Interfaces:**
- Consumes: nothing (pure domain, zero framework imports)
- Produces:
  - `LotCondition` enum: `New = 'NEW' | Excellent = 'EXCELLENT' | VeryGood = 'VERY_GOOD' | Good = 'GOOD'`
  - `LotImage` interface: `{ id, lotId, url, thumbnailUrl, displayOrder, isPrimary }`
  - `Lot` class: constructor takes `LotProps`; methods `primaryImage(): LotImage | null`, `sortedImages(): LotImage[]`
  - `Category` class: constructor takes `CategoryProps`
  - `LotFilters` type: `{ categoryId?: string; condition?: LotCondition; minEstimatedValue?: number; maxEstimatedValue?: number }`
  - `PaginatedResult<T>`: `{ items: T[]; total: number; limit: number; offset: number }`
  - `LotRepository` interface: `findById`, `findAll`, `save`
  - `CategoryRepository` interface: `findAll`, `findBySlug`, `findById`
  - `LotSearchResult` type: `{ id, title, thumbnailUrl, estimatedValue, categoryId }`
  - `SearchRepository` interface: `search(query, filters, limit, offset)`

- [ ] **Step 1: Write failing tests in `apps/catalogue/src/domain/lot.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { Lot, LotCondition, LotImage } from './lot';

describe('Lot', () => {
  it('should_createLot_when_allRequiredFieldsProvided', () => {
    const lot = new Lot({
      id: 'lot-1',
      title: 'Cartier Love Ring 18ct Gold',
      description: 'Authenticated, original box included',
      categoryId: 'cat-1',
      condition: LotCondition.Excellent,
      estimatedValue: 2500,
      images: [],
      createdBy: 'admin-1',
      createdAt: new Date('2026-06-20T00:00:00Z'),
      updatedAt: new Date('2026-06-20T00:00:00Z'),
    });

    expect(lot.id).toBe('lot-1');
    expect(lot.title).toBe('Cartier Love Ring 18ct Gold');
    expect(lot.condition).toBe(LotCondition.Excellent);
  });

  it('should_returnPrimaryImage_when_imagesContainPrimaryFlag', () => {
    const images: LotImage[] = [
      { id: 'img-1', lotId: 'lot-1', url: 'https://assets.example.com/img1.jpg', thumbnailUrl: 'https://assets.example.com/img1_thumb.jpg', displayOrder: 0, isPrimary: false },
      { id: 'img-2', lotId: 'lot-1', url: 'https://assets.example.com/img2.jpg', thumbnailUrl: 'https://assets.example.com/img2_thumb.jpg', displayOrder: 1, isPrimary: true },
    ];
    const lot = new Lot({
      id: 'lot-1',
      title: 'Chanel Classic Flap',
      description: null,
      categoryId: null,
      condition: LotCondition.VeryGood,
      estimatedValue: null,
      images,
      createdBy: 'admin-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(lot.primaryImage()).toEqual(images[1]);
  });

  it('should_returnNull_when_noImagesExist', () => {
    const lot = new Lot({
      id: 'lot-1',
      title: 'Empty lot',
      description: null,
      categoryId: null,
      condition: null,
      estimatedValue: null,
      images: [],
      createdBy: 'admin-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(lot.primaryImage()).toBeNull();
  });

  it('should_returnSortedImages_when_multipleImagesExist', () => {
    const images: LotImage[] = [
      { id: 'img-2', lotId: 'lot-1', url: 'b.jpg', thumbnailUrl: 'b_t.jpg', displayOrder: 1, isPrimary: false },
      { id: 'img-1', lotId: 'lot-1', url: 'a.jpg', thumbnailUrl: 'a_t.jpg', displayOrder: 0, isPrimary: true },
    ];
    const lot = new Lot({
      id: 'lot-1', title: 'T', description: null, categoryId: null,
      condition: null, estimatedValue: null, images,
      createdBy: 'admin-1', createdAt: new Date(), updatedAt: new Date(),
    });

    const sorted = lot.sortedImages();
    expect(sorted[0].id).toBe('img-1');
    expect(sorted[1].id).toBe('img-2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/catalogue && npx vitest run src/domain/lot.test.ts
```

Expected: FAIL — `Cannot find module './lot'`

- [ ] **Step 3: Create `apps/catalogue/src/domain/lot.ts`**

```typescript
export enum LotCondition {
  New = 'NEW',
  Excellent = 'EXCELLENT',
  VeryGood = 'VERY_GOOD',
  Good = 'GOOD',
}

export interface LotImage {
  id: string;
  lotId: string;
  url: string;
  thumbnailUrl: string;
  displayOrder: number;
  isPrimary: boolean;
}

interface LotProps {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  condition: LotCondition | null;
  estimatedValue: number | null;
  images: LotImage[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Lot {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly categoryId: string | null;
  readonly condition: LotCondition | null;
  readonly estimatedValue: number | null;
  readonly images: LotImage[];
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: LotProps) {
    this.id = props.id;
    this.title = props.title;
    this.description = props.description;
    this.categoryId = props.categoryId;
    this.condition = props.condition;
    this.estimatedValue = props.estimatedValue;
    this.images = props.images;
    this.createdBy = props.createdBy;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  primaryImage(): LotImage | null {
    const primary = this.images.find(img => img.isPrimary);
    return primary ?? this.images[0] ?? null;
  }

  sortedImages(): LotImage[] {
    return [...this.images].sort((a, b) => a.displayOrder - b.displayOrder);
  }
}
```

- [ ] **Step 4: Create `apps/catalogue/src/domain/category.ts`**

```typescript
interface CategoryProps {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  displayOrder: number;
}

export class Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
  readonly displayOrder: number;

  constructor(props: CategoryProps) {
    this.id = props.id;
    this.name = props.name;
    this.slug = props.slug;
    this.parentId = props.parentId;
    this.displayOrder = props.displayOrder;
  }
}
```

- [ ] **Step 5: Create `apps/catalogue/src/domain/lot-repository.ts`**

```typescript
import { Lot, LotCondition } from './lot';

export interface LotFilters {
  categoryId?: string;
  condition?: LotCondition;
  minEstimatedValue?: number;
  maxEstimatedValue?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface LotRepository {
  findById(id: string): Promise<Lot | null>;
  findAll(filters: LotFilters, limit: number, offset: number): Promise<PaginatedResult<Lot>>;
  save(lot: Lot): Promise<void>;
}
```

- [ ] **Step 6: Create `apps/catalogue/src/domain/category-repository.ts`**

```typescript
import { Category } from './category';

export interface CategoryRepository {
  findAll(): Promise<Category[]>;
  findBySlug(slug: string): Promise<Category | null>;
  findById(id: string): Promise<Category | null>;
}
```

- [ ] **Step 7: Create `apps/catalogue/src/domain/search-repository.ts`**

```typescript
export interface LotSearchResult {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  estimatedValue: number | null;
  categoryId: string | null;
}

export interface SearchFilters {
  categoryId?: string;
}

export interface SearchRepository {
  search(query: string, filters: SearchFilters, limit: number, offset: number): Promise<{ items: LotSearchResult[]; total: number }>;
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd apps/catalogue && npx vitest run src/domain/lot.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/catalogue/src/domain/
git commit -m "feat(catalogue): add Lot, Category domain entities and repository interfaces"
```

---

### Task 3: Infrastructure — PostgreSQL repositories

**Files:**
- Create: `apps/catalogue/src/infrastructure/db.ts`
- Create: `apps/catalogue/src/infrastructure/postgres-lot-repository.ts`
- Create: `apps/catalogue/src/infrastructure/postgres-category-repository.ts`
- Create: `apps/catalogue/src/infrastructure/postgres-search-repository.ts`
- Create: `apps/catalogue/src/infrastructure/postgres-lot-repository.test.ts`
- Create: `apps/catalogue/src/infrastructure/postgres-category-repository.test.ts`
- Create: `apps/catalogue/src/infrastructure/postgres-search-repository.test.ts`

**Interfaces:**
- Consumes: `LotRepository`, `CategoryRepository`, `SearchRepository` interfaces from domain
- Produces:
  - `createDb(url: string): Sql`
  - `PostgresLotRepository` implements `LotRepository`
  - `PostgresCategoryRepository` implements `CategoryRepository`
  - `PostgresSearchRepository` implements `SearchRepository`

> **Integration test prerequisite:** Create `catalogue_test` DB and run the migration:
> ```bash
> createdb catalogue_test
> psql catalogue_test < apps/catalogue/migrations/001_create_catalogue.sql
> ```

- [ ] **Step 1: Write failing tests in `apps/catalogue/src/infrastructure/postgres-lot-repository.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from './db';
import { PostgresLotRepository } from './postgres-lot-repository';
import { Lot, LotCondition, LotImage } from '../domain/lot';

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost/catalogue_test';

describe('PostgresLotRepository', () => {
  const db = createDb(TEST_DB_URL);
  const repo = new PostgresLotRepository(db);

  beforeEach(async () => {
    await db`DELETE FROM lot_images`;
    await db`DELETE FROM lots`;
  });

  afterEach(async () => {
    await db.end();
  });

  it('should_returnNull_when_lotDoesNotExist', async () => {
    const result = await repo.findById('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  it('should_saveThenFindById_when_lotHasNoImages', async () => {
    const lot = new Lot({
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Tiffany Soleste Ring',
      description: 'Platinum setting',
      categoryId: null,
      condition: LotCondition.Excellent,
      estimatedValue: 4500,
      images: [],
      createdBy: null,
      createdAt: new Date('2026-06-20T00:00:00Z'),
      updatedAt: new Date('2026-06-20T00:00:00Z'),
    });

    await repo.save(lot);
    const found = await repo.findById(lot.id);

    expect(found).not.toBeNull();
    expect(found!.title).toBe('Tiffany Soleste Ring');
    expect(found!.condition).toBe(LotCondition.Excellent);
    expect(found!.estimatedValue).toBe(4500);
    expect(found!.images).toHaveLength(0);
  });

  it('should_saveThenFindById_when_lotHasImages', async () => {
    const images: LotImage[] = [
      {
        id: '22222222-2222-2222-2222-222222222222',
        lotId: '11111111-1111-1111-1111-111111111111',
        url: 'https://assets.example.com/a.jpg',
        thumbnailUrl: 'https://assets.example.com/a_thumb.jpg',
        displayOrder: 0,
        isPrimary: true,
      },
    ];
    const lot = new Lot({
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Van Cleef Arpels Bracelet',
      description: null,
      categoryId: null,
      condition: LotCondition.New,
      estimatedValue: 12000,
      images,
      createdBy: null,
      createdAt: new Date('2026-06-20T00:00:00Z'),
      updatedAt: new Date('2026-06-20T00:00:00Z'),
    });

    await repo.save(lot);
    const found = await repo.findById(lot.id);

    expect(found!.images).toHaveLength(1);
    expect(found!.images[0].url).toBe('https://assets.example.com/a.jpg');
    expect(found!.images[0].isPrimary).toBe(true);
  });

  it('should_returnPaginatedResults_when_findAll', async () => {
    for (let i = 0; i < 3; i++) {
      await repo.save(new Lot({
        id: `1111111${i}-0000-0000-0000-000000000000`,
        title: `Lot ${i}`,
        description: null,
        categoryId: null,
        condition: LotCondition.Good,
        estimatedValue: 100 * (i + 1),
        images: [],
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    }

    const result = await repo.findAll({}, 2, 0);

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(2);
    expect(result.limit).toBe(2);
    expect(result.offset).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/catalogue && npx vitest run src/infrastructure/postgres-lot-repository.test.ts
```

Expected: FAIL — `Cannot find module './db'`

- [ ] **Step 3: Create `apps/catalogue/src/infrastructure/db.ts`**

```typescript
import postgres from 'postgres';

export type Db = ReturnType<typeof postgres>;

export function createDb(url: string): Db {
  return postgres(url);
}
```

- [ ] **Step 4: Create `apps/catalogue/src/infrastructure/postgres-lot-repository.ts`**

```typescript
import { Lot, LotCondition, LotImage } from '../domain/lot';
import { LotFilters, LotRepository, PaginatedResult } from '../domain/lot-repository';
import { Db } from './db';

interface LotRow {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  condition: string | null;
  estimated_value: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface LotImageRow {
  id: string;
  lot_id: string;
  url: string;
  thumbnail_url: string;
  display_order: number;
  is_primary: boolean;
}

function rowToLotImage(row: LotImageRow): LotImage {
  return {
    id: row.id,
    lotId: row.lot_id,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    displayOrder: row.display_order,
    isPrimary: row.is_primary,
  };
}

async function fetchImages(db: Db, lotId: string): Promise<LotImage[]> {
  const rows = await db<LotImageRow[]>`
    SELECT id, lot_id, url, thumbnail_url, display_order, is_primary
    FROM lot_images WHERE lot_id = ${lotId}
    ORDER BY display_order ASC
  `;
  return rows.map(rowToLotImage);
}

function rowToLot(row: LotRow, images: LotImage[]): Lot {
  return new Lot({
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    condition: row.condition as LotCondition | null,
    estimatedValue: row.estimated_value !== null ? Number(row.estimated_value) : null,
    images,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PostgresLotRepository implements LotRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Lot | null> {
    const rows = await this.db<LotRow[]>`
      SELECT id, title, description, category_id, condition, estimated_value, created_by, created_at, updated_at
      FROM lots WHERE id = ${id}
    `;
    if (rows.length === 0) {
      return null;
    }
    const images = await fetchImages(this.db, id);
    return rowToLot(rows[0], images);
  }

  async findAll(filters: LotFilters, limit: number, offset: number): Promise<PaginatedResult<Lot>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.categoryId) {
      conditions.push(`category_id = $${paramIndex++}`);
      values.push(filters.categoryId);
    }
    if (filters.condition) {
      conditions.push(`condition = $${paramIndex++}`);
      values.push(filters.condition);
    }
    if (filters.minEstimatedValue !== undefined) {
      conditions.push(`estimated_value >= $${paramIndex++}`);
      values.push(filters.minEstimatedValue);
    }
    if (filters.maxEstimatedValue !== undefined) {
      conditions.push(`estimated_value <= $${paramIndex++}`);
      values.push(filters.maxEstimatedValue);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.db.unsafe<{ count: string }[]>(
      `SELECT COUNT(*) as count FROM lots ${where}`,
      values,
    );
    const total = Number(countRows[0].count);

    const rows = await this.db.unsafe<LotRow[]>(
      `SELECT id, title, description, category_id, condition, estimated_value, created_by, created_at, updated_at
       FROM lots ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset],
    );

    const lots = await Promise.all(
      rows.map(async row => {
        const images = await fetchImages(this.db, row.id);
        return rowToLot(row, images);
      }),
    );

    return { items: lots, total, limit, offset };
  }

  async save(lot: Lot): Promise<void> {
    await this.db`
      INSERT INTO lots (id, title, description, category_id, condition, estimated_value, created_by, created_at, updated_at)
      VALUES (
        ${lot.id}, ${lot.title}, ${lot.description}, ${lot.categoryId},
        ${lot.condition}, ${lot.estimatedValue}, ${lot.createdBy},
        ${lot.createdAt}, ${lot.updatedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        category_id = EXCLUDED.category_id,
        condition = EXCLUDED.condition,
        estimated_value = EXCLUDED.estimated_value,
        updated_at = EXCLUDED.updated_at
    `;

    if (lot.images.length > 0) {
      await this.db`DELETE FROM lot_images WHERE lot_id = ${lot.id}`;
      for (const img of lot.images) {
        await this.db`
          INSERT INTO lot_images (id, lot_id, url, thumbnail_url, display_order, is_primary)
          VALUES (${img.id}, ${img.lotId}, ${img.url}, ${img.thumbnailUrl}, ${img.displayOrder}, ${img.isPrimary})
        `;
      }
    }
  }
}
```

- [ ] **Step 5: Run lot repository tests**

```bash
cd apps/catalogue && npx vitest run src/infrastructure/postgres-lot-repository.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Write failing tests in `apps/catalogue/src/infrastructure/postgres-category-repository.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from './db';
import { PostgresCategoryRepository } from './postgres-category-repository';

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost/catalogue_test';

describe('PostgresCategoryRepository', () => {
  const db = createDb(TEST_DB_URL);
  const repo = new PostgresCategoryRepository(db);

  beforeEach(async () => {
    await db`DELETE FROM categories`;
  });

  afterEach(async () => {
    await db.end();
  });

  it('should_returnEmpty_when_noCategories', async () => {
    const result = await repo.findAll();
    expect(result).toHaveLength(0);
  });

  it('should_findBySlug_when_categoryExists', async () => {
    await db`
      INSERT INTO categories (id, name, slug, parent_id, display_order)
      VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'Rings', 'rings', NULL, 1)
    `;

    const result = await repo.findBySlug('rings');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Rings');
    expect(result!.slug).toBe('rings');
  });

  it('should_returnNull_when_slugNotFound', async () => {
    const result = await repo.findBySlug('nonexistent');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 7: Create `apps/catalogue/src/infrastructure/postgres-category-repository.ts`**

```typescript
import { Category } from '../domain/category';
import { CategoryRepository } from '../domain/category-repository';
import { Db } from './db';

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  display_order: number;
}

function rowToCategory(row: CategoryRow): Category {
  return new Category({
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parent_id,
    displayOrder: row.display_order,
  });
}

export class PostgresCategoryRepository implements CategoryRepository {
  constructor(private readonly db: Db) {}

  async findAll(): Promise<Category[]> {
    const rows = await this.db<CategoryRow[]>`
      SELECT id, name, slug, parent_id, display_order
      FROM categories ORDER BY display_order ASC
    `;
    return rows.map(rowToCategory);
  }

  async findBySlug(slug: string): Promise<Category | null> {
    const rows = await this.db<CategoryRow[]>`
      SELECT id, name, slug, parent_id, display_order
      FROM categories WHERE slug = ${slug}
    `;
    return rows.length > 0 ? rowToCategory(rows[0]) : null;
  }

  async findById(id: string): Promise<Category | null> {
    const rows = await this.db<CategoryRow[]>`
      SELECT id, name, slug, parent_id, display_order
      FROM categories WHERE id = ${id}
    `;
    return rows.length > 0 ? rowToCategory(rows[0]) : null;
  }
}
```

- [ ] **Step 8: Run category repository tests**

```bash
cd apps/catalogue && npx vitest run src/infrastructure/postgres-category-repository.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 9: Write failing tests in `apps/catalogue/src/infrastructure/postgres-search-repository.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from './db';
import { PostgresSearchRepository } from './postgres-search-repository';
import { PostgresLotRepository } from './postgres-lot-repository';
import { Lot, LotCondition } from '../domain/lot';

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost/catalogue_test';

describe('PostgresSearchRepository', () => {
  const db = createDb(TEST_DB_URL);
  const searchRepo = new PostgresSearchRepository(db);
  const lotRepo = new PostgresLotRepository(db);

  beforeEach(async () => {
    await db`DELETE FROM lot_images`;
    await db`DELETE FROM lots`;
  });

  afterEach(async () => {
    await db.end();
  });

  it('should_findMatchingLots_when_queryMatchesTitle', async () => {
    await lotRepo.save(new Lot({
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Cartier Love Ring',
      description: '18ct yellow gold',
      categoryId: null,
      condition: LotCondition.Excellent,
      estimatedValue: 3000,
      images: [],
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await lotRepo.save(new Lot({
      id: '22222222-2222-2222-2222-222222222222',
      title: 'Chanel Classic Flap Bag',
      description: 'Black caviar leather',
      categoryId: null,
      condition: LotCondition.VeryGood,
      estimatedValue: 8000,
      images: [],
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await searchRepo.search('Cartier', {}, 10, 0);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Cartier Love Ring');
    expect(result.total).toBe(1);
  });

  it('should_returnEmpty_when_noMatchFound', async () => {
    const result = await searchRepo.search('nonexistent_xyz_abc', {}, 10, 0);
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
```

- [ ] **Step 10: Create `apps/catalogue/src/infrastructure/postgres-search-repository.ts`**

```typescript
import { LotSearchResult, SearchFilters, SearchRepository } from '../domain/search-repository';
import { Db } from './db';

interface SearchRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
  estimated_value: string | null;
  category_id: string | null;
  count: string;
}

export class PostgresSearchRepository implements SearchRepository {
  constructor(private readonly db: Db) {}

  async search(
    query: string,
    filters: SearchFilters,
    limit: number,
    offset: number,
  ): Promise<{ items: LotSearchResult[]; total: number }> {
    const conditions: string[] = [`l.search_vector @@ plainto_tsquery('english', $1)`];
    const values: unknown[] = [query];
    let paramIndex = 2;

    if (filters.categoryId) {
      conditions.push(`l.category_id = $${paramIndex++}`);
      values.push(filters.categoryId);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const rows = await this.db.unsafe<SearchRow[]>(
      `SELECT
        l.id,
        l.title,
        l.estimated_value,
        l.category_id,
        li.thumbnail_url,
        COUNT(*) OVER() AS count
       FROM lots l
       LEFT JOIN lot_images li ON li.lot_id = l.id AND li.is_primary = TRUE
       ${where}
       ORDER BY ts_rank(l.search_vector, plainto_tsquery('english', $1)) DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset],
    );

    const total = rows.length > 0 ? Number(rows[0].count) : 0;
    const items: LotSearchResult[] = rows.map(row => ({
      id: row.id,
      title: row.title,
      thumbnailUrl: row.thumbnail_url,
      estimatedValue: row.estimated_value !== null ? Number(row.estimated_value) : null,
      categoryId: row.category_id,
    }));

    return { items, total };
  }
}
```

- [ ] **Step 11: Run search repository tests**

```bash
cd apps/catalogue && npx vitest run src/infrastructure/postgres-search-repository.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 12: Commit**

```bash
git add apps/catalogue/src/infrastructure/
git commit -m "feat(catalogue): add Postgres repository implementations (lot, category, search)"
```

---

### Task 4: Application layer — use cases

**Files:**
- Create: `apps/catalogue/src/application/get-lot-use-case.ts`
- Create: `apps/catalogue/src/application/list-lots-use-case.ts`
- Create: `apps/catalogue/src/application/search-lots-use-case.ts`
- Create: `apps/catalogue/src/application/list-categories-use-case.ts`
- Create: `apps/catalogue/src/application/request-image-upload-use-case.ts`
- Create: `apps/catalogue/src/application/confirm-image-upload-use-case.ts`
- Create: `apps/catalogue/src/application/image-storage.ts`
- Create: `apps/catalogue/src/application/use-cases.test.ts`

**Interfaces:**
- Consumes: `LotRepository`, `CategoryRepository`, `SearchRepository` from domain; `LotFilters` from `lot-repository.ts`; `SearchFilters` from `search-repository.ts`
- Produces:
  - `ImageStorage` interface: `generatePresignedUploadUrl(key, contentType): Promise<string>`, `getPublicUrl(key): Promise<string>`
  - `GetLotUseCase.execute(id): Promise<Lot | null>`
  - `ListLotsUseCase.execute(filters, limit, offset): Promise<PaginatedResult<Lot>>`
  - `SearchLotsUseCase.execute(query, categoryId, limit, offset): Promise<{ items: LotSearchResult[]; total: number }>`
  - `ListCategoriesUseCase.execute(): Promise<Category[]>`
  - `RequestImageUploadUseCase.execute(lotId, contentType): Promise<{ uploadUrl: string; imageKey: string }>`
  - `ConfirmImageUploadUseCase.execute(lotId, imageKey, isPrimary): Promise<void>`

- [ ] **Step 1: Write failing tests in `apps/catalogue/src/application/use-cases.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GetLotUseCase } from './get-lot-use-case';
import { ListLotsUseCase } from './list-lots-use-case';
import { SearchLotsUseCase } from './search-lots-use-case';
import { ListCategoriesUseCase } from './list-categories-use-case';
import { Lot, LotCondition } from '../domain/lot';
import { Category } from '../domain/category';
import { LotRepository, PaginatedResult } from '../domain/lot-repository';
import { CategoryRepository } from '../domain/category-repository';
import { SearchRepository, LotSearchResult } from '../domain/search-repository';

function buildLot(): Lot {
  return new Lot({
    id: 'lot-1',
    title: 'Cartier Love Ring',
    description: null,
    categoryId: 'cat-1',
    condition: LotCondition.Excellent,
    estimatedValue: 3000,
    images: [],
    createdBy: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
    updatedAt: new Date('2026-06-20T00:00:00Z'),
  });
}

function buildCategory(): Category {
  return new Category({ id: 'cat-1', name: 'Rings', slug: 'rings', parentId: null, displayOrder: 1 });
}

describe('GetLotUseCase', () => {
  it('should_returnLot_when_lotExists', async () => {
    const mockRepo: LotRepository = {
      findById: vi.fn().mockResolvedValue(buildLot()),
      findAll: vi.fn(),
      save: vi.fn(),
    };

    const result = await new GetLotUseCase(mockRepo).execute('lot-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('lot-1');
    expect(mockRepo.findById).toHaveBeenCalledWith('lot-1');
  });

  it('should_returnNull_when_lotDoesNotExist', async () => {
    const mockRepo: LotRepository = {
      findById: vi.fn().mockResolvedValue(null),
      findAll: vi.fn(),
      save: vi.fn(),
    };

    const result = await new GetLotUseCase(mockRepo).execute('nonexistent');

    expect(result).toBeNull();
  });
});

describe('ListLotsUseCase', () => {
  it('should_returnPaginatedLots_when_called', async () => {
    const paginatedResult: PaginatedResult<Lot> = { items: [buildLot()], total: 1, limit: 10, offset: 0 };
    const mockRepo: LotRepository = {
      findById: vi.fn(),
      findAll: vi.fn().mockResolvedValue(paginatedResult),
      save: vi.fn(),
    };

    const result = await new ListLotsUseCase(mockRepo).execute({}, 10, 0);

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });
});

describe('SearchLotsUseCase', () => {
  it('should_delegateToSearchRepository_with_correct_filters', async () => {
    const searchResults: LotSearchResult[] = [
      { id: 'lot-1', title: 'Cartier Love Ring', thumbnailUrl: null, estimatedValue: 3000, categoryId: 'cat-1' },
    ];
    const mockSearchRepo: SearchRepository = {
      search: vi.fn().mockResolvedValue({ items: searchResults, total: 1 }),
    };

    const result = await new SearchLotsUseCase(mockSearchRepo).execute('Cartier', undefined, 10, 0);

    expect(result.items).toHaveLength(1);
    expect(mockSearchRepo.search).toHaveBeenCalledWith('Cartier', {}, 10, 0);
  });

  it('should_passCategory_when_categoryIdProvided', async () => {
    const mockSearchRepo: SearchRepository = {
      search: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    await new SearchLotsUseCase(mockSearchRepo).execute('ring', 'cat-1', 10, 0);

    expect(mockSearchRepo.search).toHaveBeenCalledWith('ring', { categoryId: 'cat-1' }, 10, 0);
  });
});

describe('ListCategoriesUseCase', () => {
  it('should_returnAllCategories', async () => {
    const mockRepo: CategoryRepository = {
      findAll: vi.fn().mockResolvedValue([buildCategory()]),
      findBySlug: vi.fn(),
      findById: vi.fn(),
    };

    const result = await new ListCategoriesUseCase(mockRepo).execute();

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('rings');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/catalogue && npx vitest run src/application/use-cases.test.ts
```

Expected: FAIL — `Cannot find module './get-lot-use-case'`

- [ ] **Step 3: Create `apps/catalogue/src/application/get-lot-use-case.ts`**

```typescript
import { Lot } from '../domain/lot';
import { LotRepository } from '../domain/lot-repository';

export class GetLotUseCase {
  constructor(private readonly lotRepository: LotRepository) {}

  async execute(id: string): Promise<Lot | null> {
    return this.lotRepository.findById(id);
  }
}
```

- [ ] **Step 4: Create `apps/catalogue/src/application/list-lots-use-case.ts`**

```typescript
import { Lot } from '../domain/lot';
import { LotFilters, LotRepository, PaginatedResult } from '../domain/lot-repository';

export class ListLotsUseCase {
  constructor(private readonly lotRepository: LotRepository) {}

  async execute(filters: LotFilters, limit: number, offset: number): Promise<PaginatedResult<Lot>> {
    return this.lotRepository.findAll(filters, limit, offset);
  }
}
```

- [ ] **Step 5: Create `apps/catalogue/src/application/search-lots-use-case.ts`**

```typescript
import { LotSearchResult, SearchRepository } from '../domain/search-repository';

export class SearchLotsUseCase {
  constructor(private readonly searchRepository: SearchRepository) {}

  async execute(
    query: string,
    categoryId: string | undefined,
    limit: number,
    offset: number,
  ): Promise<{ items: LotSearchResult[]; total: number }> {
    return this.searchRepository.search(query, { categoryId }, limit, offset);
  }
}
```

- [ ] **Step 6: Create `apps/catalogue/src/application/list-categories-use-case.ts`**

```typescript
import { Category } from '../domain/category';
import { CategoryRepository } from '../domain/category-repository';

export class ListCategoriesUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(): Promise<Category[]> {
    return this.categoryRepository.findAll();
  }
}
```

- [ ] **Step 7: Create `apps/catalogue/src/application/image-storage.ts`**

```typescript
export interface ImageStorage {
  generatePresignedUploadUrl(key: string, contentType: string): Promise<string>;
  getPublicUrl(key: string): Promise<string>;
}
```

- [ ] **Step 8: Create `apps/catalogue/src/application/request-image-upload-use-case.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { ImageStorage } from './image-storage';

export interface RequestImageUploadResult {
  uploadUrl: string;
  imageKey: string;
}

export class RequestImageUploadUseCase {
  constructor(private readonly imageStorage: ImageStorage) {}

  async execute(lotId: string, contentType: string): Promise<RequestImageUploadResult> {
    const imageKey = `lots/${lotId}/${uuidv4()}`;
    const uploadUrl = await this.imageStorage.generatePresignedUploadUrl(imageKey, contentType);
    return { uploadUrl, imageKey };
  }
}
```

- [ ] **Step 9: Create `apps/catalogue/src/application/confirm-image-upload-use-case.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Lot, LotImage } from '../domain/lot';
import { LotRepository } from '../domain/lot-repository';
import { ImageStorage } from './image-storage';

export class ConfirmImageUploadUseCase {
  constructor(
    private readonly lotRepository: LotRepository,
    private readonly imageStorage: ImageStorage,
  ) {}

  async execute(lotId: string, imageKey: string, isPrimary: boolean): Promise<void> {
    const lot = await this.lotRepository.findById(lotId);
    if (!lot) {
      throw new Error(`Lot not found: ${lotId}`);
    }

    const url = await this.imageStorage.getPublicUrl(imageKey);
    const thumbnailUrl = await this.imageStorage.getPublicUrl(`${imageKey}_thumb`);

    const newImage: LotImage = {
      id: uuidv4(),
      lotId,
      url,
      thumbnailUrl,
      displayOrder: lot.images.length,
      isPrimary,
    };

    const updatedImages = isPrimary
      ? [...lot.images.map(img => ({ ...img, isPrimary: false })), newImage]
      : [...lot.images, newImage];

    const updatedLot = new Lot({
      id: lot.id,
      title: lot.title,
      description: lot.description,
      categoryId: lot.categoryId,
      condition: lot.condition,
      estimatedValue: lot.estimatedValue,
      images: updatedImages,
      createdBy: lot.createdBy,
      createdAt: lot.createdAt,
      updatedAt: new Date(),
    });

    await this.lotRepository.save(updatedLot);
  }
}
```

- [ ] **Step 10: Run all use case tests**

```bash
cd apps/catalogue && npx vitest run src/application/use-cases.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 11: Commit**

```bash
git add apps/catalogue/src/application/
git commit -m "feat(catalogue): add use cases (get lot, list lots, search, list categories, image upload)"
```

---

### Task 5: Infrastructure — R2 image storage adapter

**Files:**
- Create: `apps/catalogue/src/infrastructure/r2-image-storage.ts`
- Create: `apps/catalogue/src/infrastructure/r2-image-storage.test.ts`

**Interfaces:**
- Consumes: `ImageStorage` interface from `application/image-storage.ts`
- Produces: `R2ImageStorage` implements `ImageStorage`

- [ ] **Step 1: Write failing tests in `apps/catalogue/src/infrastructure/r2-image-storage.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { R2ImageStorage } from './r2-image-storage';

describe('R2ImageStorage', () => {
  const storage = new R2ImageStorage({
    bucket: 'carat-room-test',
    accountId: 'test-account-id',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    publicBaseUrl: 'https://assets.example.com',
  });

  it('should_returnPresignedUrl_containing_imageKey_when_generatePresignedUploadUrl', async () => {
    const url = await storage.generatePresignedUploadUrl('lots/lot-1/img-1', 'image/jpeg');

    expect(url).toContain('lots/lot-1/img-1');
  });

  it('should_returnPublicUrl_when_getPublicUrl', async () => {
    const url = await storage.getPublicUrl('lots/lot-1/img-1');

    expect(url).toBe('https://assets.example.com/lots/lot-1/img-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/catalogue && npx vitest run src/infrastructure/r2-image-storage.test.ts
```

Expected: FAIL — `Cannot find module './r2-image-storage'`

- [ ] **Step 3: Create `apps/catalogue/src/infrastructure/r2-image-storage.ts`**

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ImageStorage } from '../application/image-storage';

interface R2Config {
  bucket: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

export class R2ImageStorage implements ImageStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: R2Config) {
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/$/, '');
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async generatePresignedUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  async getPublicUrl(key: string): Promise<string> {
    return `${this.publicBaseUrl}/${key}`;
  }
}
```

- [ ] **Step 4: Run R2 storage tests**

```bash
cd apps/catalogue && npx vitest run src/infrastructure/r2-image-storage.test.ts
```

Expected: 2 tests pass. (`getSignedUrl` constructs the URL locally — no real network call.)

- [ ] **Step 5: Commit**

```bash
git add apps/catalogue/src/infrastructure/r2-image-storage.ts apps/catalogue/src/infrastructure/r2-image-storage.test.ts
git commit -m "feat(catalogue): add R2ImageStorage adapter for Cloudflare R2 pre-signed uploads"
```

---

### Task 6: Presentation layer — Hono router and main.ts

**Files:**
- Create: `apps/catalogue/src/presentation/catalogue-router.ts`
- Create: `apps/catalogue/src/presentation/catalogue-router.test.ts`
- Create: `apps/catalogue/src/main.ts`
- Create: `apps/catalogue/Dockerfile`

**Interfaces:**
- Consumes: all use case classes from Task 4
- Produces: `buildCatalogueRouter(useCases): Hono` with 6 routes; `main.ts` wires all layers and serves on port 3001

**Routes:**
```
GET  /api/lots                        — list (query: categoryId, condition, minValue, maxValue, limit, offset)
GET  /api/lots/search                 — full-text search (query: q, categoryId, limit, offset)
GET  /api/lots/:id                    — get by id
GET  /api/categories                  — list all categories
POST /api/lots/:id/images/upload-url  — request pre-signed upload URL (ADMIN only)
POST /api/lots/:id/images/confirm     — confirm image uploaded (ADMIN only)
```

Note: the `/api/lots/search` route must be registered **before** `/api/lots/:id` to prevent `search` being treated as an `:id` param.

- [ ] **Step 1: Write failing tests in `apps/catalogue/src/presentation/catalogue-router.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { buildCatalogueRouter } from './catalogue-router';
import { Lot, LotCondition } from '../domain/lot';
import { Category } from '../domain/category';

function buildLot(): Lot {
  return new Lot({
    id: 'lot-1',
    title: 'Cartier Love Ring',
    description: 'Authentic piece',
    categoryId: 'cat-1',
    condition: LotCondition.Excellent,
    estimatedValue: 3000,
    images: [],
    createdBy: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
    updatedAt: new Date('2026-06-20T00:00:00Z'),
  });
}

function buildUseCases(overrides: Record<string, unknown> = {}) {
  return {
    getLot: { execute: vi.fn().mockResolvedValue(null) },
    listLots: { execute: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 }) },
    searchLots: { execute: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
    listCategories: { execute: vi.fn().mockResolvedValue([]) },
    requestImageUpload: { execute: vi.fn() },
    confirmImageUpload: { execute: vi.fn() },
    ...overrides,
  };
}

describe('GET /api/lots/:id', () => {
  it('should_return200WithLot_when_lotExists', async () => {
    const useCases = buildUseCases({ getLot: { execute: vi.fn().mockResolvedValue(buildLot()) } });
    const app = new Hono().route('/', buildCatalogueRouter(useCases));

    const res = await app.request('/api/lots/lot-1');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { id: string } };
    expect(body.data.id).toBe('lot-1');
  });

  it('should_return404_when_lotDoesNotExist', async () => {
    const app = new Hono().route('/', buildCatalogueRouter(buildUseCases()));

    const res = await app.request('/api/lots/nonexistent');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/lots', () => {
  it('should_return200WithPaginatedLots', async () => {
    const useCases = buildUseCases({
      listLots: { execute: vi.fn().mockResolvedValue({ items: [buildLot()], total: 1, limit: 10, offset: 0 }) },
    });
    const app = new Hono().route('/', buildCatalogueRouter(useCases));

    const res = await app.request('/api/lots?limit=10&offset=0');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; meta: { total: number } };
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
  });
});

describe('GET /api/lots/search', () => {
  it('should_return400_when_queryMissing', async () => {
    const app = new Hono().route('/', buildCatalogueRouter(buildUseCases()));

    const res = await app.request('/api/lots/search');

    expect(res.status).toBe(400);
  });

  it('should_return200WithResults_when_queryProvided', async () => {
    const useCases = buildUseCases({
      searchLots: { execute: vi.fn().mockResolvedValue({
        items: [{ id: 'lot-1', title: 'Cartier Love Ring', thumbnailUrl: null, estimatedValue: 3000, categoryId: 'cat-1' }],
        total: 1,
      }) },
    });
    const app = new Hono().route('/', buildCatalogueRouter(useCases));

    const res = await app.request('/api/lots/search?q=Cartier');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });
});

describe('GET /api/categories', () => {
  it('should_return200WithCategories', async () => {
    const useCases = buildUseCases({
      listCategories: { execute: vi.fn().mockResolvedValue([
        new Category({ id: 'cat-1', name: 'Rings', slug: 'rings', parentId: null, displayOrder: 1 }),
      ]) },
    });
    const app = new Hono().route('/', buildCatalogueRouter(useCases));

    const res = await app.request('/api/categories');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { slug: string }[] };
    expect(body.data[0].slug).toBe('rings');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/catalogue && npx vitest run src/presentation/catalogue-router.test.ts
```

Expected: FAIL — `Cannot find module './catalogue-router'`

- [ ] **Step 3: Create `apps/catalogue/src/presentation/catalogue-router.ts`**

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import { GetLotUseCase } from '../application/get-lot-use-case';
import { ListLotsUseCase } from '../application/list-lots-use-case';
import { SearchLotsUseCase } from '../application/search-lots-use-case';
import { ListCategoriesUseCase } from '../application/list-categories-use-case';
import { RequestImageUploadUseCase } from '../application/request-image-upload-use-case';
import { ConfirmImageUploadUseCase } from '../application/confirm-image-upload-use-case';
import { LotCondition } from '../domain/lot';

interface UseCases {
  getLot: Pick<GetLotUseCase, 'execute'>;
  listLots: Pick<ListLotsUseCase, 'execute'>;
  searchLots: Pick<SearchLotsUseCase, 'execute'>;
  listCategories: Pick<ListCategoriesUseCase, 'execute'>;
  requestImageUpload: Pick<RequestImageUploadUseCase, 'execute'>;
  confirmImageUpload: Pick<ConfirmImageUploadUseCase, 'execute'>;
}

const VALID_CONDITIONS = new Set<string>(Object.values(LotCondition));
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function buildCatalogueRouter(useCases: UseCases): Hono {
  const router = new Hono();

  // Must be registered before /api/lots/:id to avoid 'search' matching as :id
  router.get('/api/lots/search', async c => {
    const q = c.req.query('q') ?? '';
    if (!q.trim()) {
      return c.json({ error: { code: 'MISSING_QUERY', message: 'q parameter is required' } }, 400);
    }
    const categoryId = c.req.query('categoryId');
    const limit = Math.min(Number(c.req.query('limit') ?? DEFAULT_LIMIT), MAX_LIMIT);
    const offset = Number(c.req.query('offset') ?? 0);

    const result = await useCases.searchLots.execute(q, categoryId, limit, offset);
    return c.json({ data: result.items, meta: { total: result.total, limit, offset } });
  });

  router.get('/api/lots/:id', async c => {
    const lot = await useCases.getLot.execute(c.req.param('id'));
    if (!lot) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Lot not found' } }, 404);
    }
    return c.json({ data: lot });
  });

  router.get('/api/lots', async c => {
    const categoryId = c.req.query('categoryId');
    const conditionParam = c.req.query('condition');
    const condition = conditionParam && VALID_CONDITIONS.has(conditionParam)
      ? conditionParam as LotCondition
      : undefined;
    const minEstimatedValue = c.req.query('minValue') ? Number(c.req.query('minValue')) : undefined;
    const maxEstimatedValue = c.req.query('maxValue') ? Number(c.req.query('maxValue')) : undefined;
    const limit = Math.min(Number(c.req.query('limit') ?? DEFAULT_LIMIT), MAX_LIMIT);
    const offset = Number(c.req.query('offset') ?? 0);

    const result = await useCases.listLots.execute(
      { categoryId, condition, minEstimatedValue, maxEstimatedValue },
      limit,
      offset,
    );
    return c.json({ data: result.items, meta: { total: result.total, limit, offset } });
  });

  router.get('/api/categories', async c => {
    const categories = await useCases.listCategories.execute();
    return c.json({ data: categories });
  });

  router.post('/api/lots/:id/images/upload-url', authMiddleware, async c => {
    const jwtPayload = c.get('jwtPayload');
    if (jwtPayload.role !== 'ADMIN') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403);
    }
    const body = await c.req.json() as { contentType?: string };
    if (!body.contentType) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'contentType is required' } }, 400);
    }
    const result = await useCases.requestImageUpload.execute(c.req.param('id'), body.contentType);
    return c.json({ data: result }, 201);
  });

  router.post('/api/lots/:id/images/confirm', authMiddleware, async c => {
    const jwtPayload = c.get('jwtPayload');
    if (jwtPayload.role !== 'ADMIN') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403);
    }
    const body = await c.req.json() as { imageKey?: string; isPrimary?: boolean };
    if (!body.imageKey) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'imageKey is required' } }, 400);
    }
    await useCases.confirmImageUpload.execute(c.req.param('id'), body.imageKey, body.isPrimary ?? false);
    return c.json({ data: null });
  });

  return router;
}
```

- [ ] **Step 4: Run router tests**

```bash
cd apps/catalogue && npx vitest run src/presentation/catalogue-router.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Create `apps/catalogue/src/main.ts`**

```typescript
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createDb } from './infrastructure/db';
import { PostgresLotRepository } from './infrastructure/postgres-lot-repository';
import { PostgresCategoryRepository } from './infrastructure/postgres-category-repository';
import { PostgresSearchRepository } from './infrastructure/postgres-search-repository';
import { R2ImageStorage } from './infrastructure/r2-image-storage';
import { GetLotUseCase } from './application/get-lot-use-case';
import { ListLotsUseCase } from './application/list-lots-use-case';
import { SearchLotsUseCase } from './application/search-lots-use-case';
import { ListCategoriesUseCase } from './application/list-categories-use-case';
import { RequestImageUploadUseCase } from './application/request-image-upload-use-case';
import { ConfirmImageUploadUseCase } from './application/confirm-image-upload-use-case';
import { buildCatalogueRouter } from './presentation/catalogue-router';

const PORT = Number(process.env.PORT ?? 3001);

const db = createDb(process.env.DATABASE_URL ?? 'postgres://localhost/catalogue');

const lotRepository = new PostgresLotRepository(db);
const categoryRepository = new PostgresCategoryRepository(db);
const searchRepository = new PostgresSearchRepository(db);

const imageStorage = new R2ImageStorage({
  bucket: process.env.R2_BUCKET ?? '',
  accountId: process.env.R2_ACCOUNT_ID ?? '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  publicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? '',
});

const useCases = {
  getLot: new GetLotUseCase(lotRepository),
  listLots: new ListLotsUseCase(lotRepository),
  searchLots: new SearchLotsUseCase(searchRepository),
  listCategories: new ListCategoriesUseCase(categoryRepository),
  requestImageUpload: new RequestImageUploadUseCase(imageStorage),
  confirmImageUpload: new ConfirmImageUploadUseCase(lotRepository, imageStorage),
};

const app = new Hono();
app.route('/', buildCatalogueRouter(useCases));
app.get('/health', c => c.json({ status: 'ok' }));

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Catalogue Service running on port ${PORT}`);
});
```

- [ ] **Step 6: Create `apps/catalogue/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY apps/catalogue/ ./apps/catalogue/
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @carat-room/catalogue build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/catalogue/dist ./dist
COPY --from=builder /app/apps/catalogue/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

- [ ] **Step 7: Run all tests**

```bash
cd apps/catalogue && npx vitest run
```

Expected: all 27 tests pass (domain: 4, lot repo: 4, category repo: 3, search repo: 2, use cases: 6, r2 storage: 2, router: 6).

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd apps/catalogue && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/catalogue/src/presentation/ apps/catalogue/src/main.ts apps/catalogue/Dockerfile
git commit -m "feat(catalogue): add Hono router, main.ts, Dockerfile — Catalogue Service complete"
```

---

## Self-Review

### 1. Spec Coverage

| Spec requirement | Covered in |
|---|---|
| `categories` table (id, name, slug, parent_id, display_order) | Task 1 migration |
| `lots` table with all fields + `search_vector` TSVECTOR | Task 1 migration |
| `lot_images` table | Task 1 migration |
| tsvector trigger on title + description | Task 1 migration trigger function |
| `SearchRepository` interface (swappable to Meilisearch) | Task 2 `search-repository.ts` |
| Pre-signed R2 upload URL flow (admin requests, uploads to R2 directly) | Task 4 `RequestImageUploadUseCase` + Task 5 `R2ImageStorage` |
| Thumbnail URL stored per image | `thumbnail_url` column; `ConfirmImageUploadUseCase` stores `${key}_thumb` URL |
| `GET /api/lots` paginated with filters | Task 6 router — categoryId, condition, minValue, maxValue, limit, offset |
| `GET /api/lots/:id` | Task 6 router |
| `GET /api/lots/search?q=` | Task 6 router — registered before `:id` to prevent route conflict |
| `GET /api/categories` | Task 6 router |
| Admin-only image upload endpoints | Task 6 router — `authMiddleware` + `role === 'ADMIN'` check |
| No auction state in Catalogue Service | `lots` table has no auction fields; auction state is Auction Engine's responsibility |
| Clean Architecture layers | Tasks 2–6: domain has no framework imports; infrastructure implements domain interfaces |

### 2. Placeholder Scan

No TBDs, TODOs, or vague steps found.

### 3. Type Consistency

- `LotFilters` in `lot-repository.ts` and `SearchFilters` in `search-repository.ts` are intentionally different (search filters are narrower). Named differently to avoid ambiguity.
- `LotImage` exported from `domain/lot.ts` and imported consistently in infrastructure and application layers.
- `PaginatedResult<T>` defined once in `lot-repository.ts`, imported in `list-lots-use-case.ts`.
- Router uses `Pick<UseCase, 'execute'>` to decouple from concrete classes — consistent across all 6 use case slots.
- `ConfirmImageUploadUseCase` reconstructs `Lot` via `new Lot({...})` rather than the fragile `Object.assign` approach — clean and type-safe.
