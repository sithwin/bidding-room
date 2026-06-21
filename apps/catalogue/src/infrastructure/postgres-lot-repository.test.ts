import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, Db } from './db';
import { PostgresLotRepository } from './postgres-lot-repository';
import { Lot, LotCondition, LotImage } from '../domain/lot';

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost/catalogue_test';

describe('PostgresLotRepository', () => {
  let db: Db;
  let repo: PostgresLotRepository;

  beforeEach(async () => {
    db = createDb(TEST_DB_URL);
    repo = new PostgresLotRepository(db);
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
