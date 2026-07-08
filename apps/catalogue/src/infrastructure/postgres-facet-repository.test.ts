import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '@carat-room/test-db';
import { Db } from './db';
import { PostgresFacetRepository } from './postgres-facet-repository';

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/catalogue_test';

const AUCTION_ONE = '11111111-1111-1111-1111-111111111111';
const AUCTION_TWO = '22222222-2222-2222-2222-222222222222';

describe('PostgresFacetRepository', () => {
  let db: Db;
  let repo: PostgresFacetRepository;

  beforeEach(async () => {
    db = createTestDb(TEST_DB_URL) as Db;
    repo = new PostgresFacetRepository(db);
    await db`DELETE FROM lot_images`;
    await db`DELETE FROM lots`;
    await db`DELETE FROM auctions`;

    await db`
      INSERT INTO auctions (id, title, sale_date, status) VALUES
        (${AUCTION_ONE}, 'June Jewellery Sale', '2026-06-20', 'open'),
        (${AUCTION_TWO}, 'July Watch Sale', '2026-07-15', 'closed')
    `;
    await db`
      INSERT INTO lots (id, title, department, auction_id, estimated_value) VALUES
        ('aaaaaaaa-0000-0000-0000-000000000001', 'Cartier Love Ring', 'Jewellery', ${AUCTION_ONE}, 3000),
        ('aaaaaaaa-0000-0000-0000-000000000002', 'Diamond Solitaire Ring', 'Jewellery', ${AUCTION_ONE}, 9000),
        ('aaaaaaaa-0000-0000-0000-000000000003', 'Rolex Submariner', 'Watches', ${AUCTION_TWO}, 12000),
        ('aaaaaaaa-0000-0000-0000-000000000004', 'Untagged Lot', NULL, NULL, 500)
    `;
  });

  afterEach(async () => {
    await db.end();
  });

  it('should_countLotsPerDepartment_when_noFiltersApplied', async () => {
    const result = await repo.countLotsByDepartment({});

    expect(result).toEqual([
      { name: 'Jewellery', count: 2 },
      { name: 'Watches', count: 1 },
    ]);
  });

  it('should_narrowDepartmentCounts_when_filtersApplied', async () => {
    const result = await repo.countLotsByDepartment({
      query: 'ring',
      auctionId: AUCTION_ONE,
      minEstimatedValue: 5000,
      maxEstimatedValue: 10000,
    });

    expect(result).toEqual([{ name: 'Jewellery', count: 1 }]);
  });

  it('should_listOnlyOpenAuctions_when_closedAuctionsExist', async () => {
    const result = await repo.listOpenAuctions();

    expect(result).toEqual([{ id: AUCTION_ONE, title: 'June Jewellery Sale' }]);
  });
});
