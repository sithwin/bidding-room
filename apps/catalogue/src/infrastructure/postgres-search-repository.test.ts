import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, Db } from './db';
import { PostgresSearchRepository } from './postgres-search-repository';
import { PostgresLotRepository } from './postgres-lot-repository';
import { Lot, LotCondition } from '../domain/lot';

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost/catalogue_test';

describe('PostgresSearchRepository', () => {
  let db: Db;
  let searchRepo: PostgresSearchRepository;
  let lotRepo: PostgresLotRepository;

  beforeEach(async () => {
    db = createDb(TEST_DB_URL);
    searchRepo = new PostgresSearchRepository(db);
    lotRepo = new PostgresLotRepository(db);
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
