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

