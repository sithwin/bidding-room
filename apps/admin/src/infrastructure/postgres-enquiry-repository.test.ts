import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createTestDb } from '@carat-room/test-db';
import { Db } from './db';
import { PostgresEnquiryRepository, ValuationEnquiry } from './postgres-enquiry-repository';

const TEST_DB_URL = process.env['TEST_DATABASE_URL'] ?? 'postgres://localhost/carat_admin_test';
const db = createTestDb(TEST_DB_URL) as Db;
const repo = new PostgresEnquiryRepository(db);

afterAll(async () => {
  await db.end();
});

afterEach(async () => {
  await db`DELETE FROM valuation_enquiries`;
});

function buildEnquiry(overrides: Partial<ValuationEnquiry> = {}): ValuationEnquiry {
  return {
    category: 'Jewellery',
    artistMaker: null,
    description: 'Gold ring',
    photoKeys: ['valuation-enquiries/uploads/abc.jpg'],
    name: 'Jane Smith',
    email: 'jane@example.com',
    ...overrides,
  };
}

describe('PostgresEnquiryRepository', () => {
  it('should_insertWithDefaults_when_enquirySaved', async () => {
    await repo.save(buildEnquiry());

    const [found] = await repo.findAll({});

    expect(found.category).toBe('Jewellery');
    expect(found.artistMaker).toBeNull();
    expect(found.photoKeys).toEqual(['valuation-enquiries/uploads/abc.jpg']);
    expect(found.status).toBe('NEW');
    expect(found.id).toBeTruthy();
    expect(found.createdAt).toBeInstanceOf(Date);
  });

  it('should_returnAllOrderedNewestFirst_when_noStatusFilterGiven', async () => {
    await db`
      INSERT INTO valuation_enquiries (category, artist_maker, description, photo_keys, name, email, created_at)
      VALUES ('Jewellery', NULL, 'Older enquiry', '{}', 'A', 'a@example.com', '2026-01-01T00:00:00Z')
    `;
    await db`
      INSERT INTO valuation_enquiries (category, artist_maker, description, photo_keys, name, email, created_at)
      VALUES ('Bags', NULL, 'Newer enquiry', '{}', 'B', 'b@example.com', '2026-02-01T00:00:00Z')
    `;

    const result = await repo.findAll({});

    expect(result.map(r => r.description)).toEqual(['Newer enquiry', 'Older enquiry']);
  });

  it('should_filterByStatus_when_statusProvided', async () => {
    await repo.save(buildEnquiry({ description: 'Still new' }));
    await repo.save(buildEnquiry({ description: 'Already responded' }));
    const all = await repo.findAll({});
    const respondedId = all.find(e => e.description === 'Already responded')!.id;
    await repo.updateStatus(respondedId, 'RESPONDED');

    const result = await repo.findAll({ status: 'NEW' });

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('Still new');
  });

  it('should_updateStatusAndReturnTrue_when_rowMatched', async () => {
    await repo.save(buildEnquiry());
    const [{ id }] = await repo.findAll({});

    const wasUpdated = await repo.updateStatus(id, 'CLOSED');

    expect(wasUpdated).toBe(true);
    const [found] = await repo.findAll({});
    expect(found.status).toBe('CLOSED');
  });

  it('should_returnFalse_when_updateStatusIdNotFound', async () => {
    const wasUpdated = await repo.updateStatus('99999999-9999-4999-8999-999999999999', 'RESPONDED');

    expect(wasUpdated).toBe(false);
  });
});
