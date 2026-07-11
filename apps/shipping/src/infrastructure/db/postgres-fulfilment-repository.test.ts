import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from '@carat-room/test-db';
import { PostgresFulfilmentRepository } from './postgres-fulfilment-repository';
import { Db } from './db';
import { Fulfilment, FulfilmentStatus, ShippingAddress } from '../../domain/fulfilment';
import { v4 as uuidv4 } from 'uuid';

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/shipping_test';

describe('PostgresFulfilmentRepository', () => {
  let db: Db;
  let repo: PostgresFulfilmentRepository;

  beforeAll(async () => {
    db = createTestDb(TEST_DB_URL) as Db;
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

  it('should_countFulfilmentsMatchingStatuses_when_someMatch', async () => {
    const pendingChoice = Fulfilment.create({ id: uuidv4(), lotId: uuidv4(), userId: uuidv4() });
    await repo.save(pendingChoice);

    const pendingDispatch = Fulfilment.create({ id: uuidv4(), lotId: uuidv4(), userId: uuidv4() });
    const address: ShippingAddress = {
      id: uuidv4(),
      fulfilmentId: pendingDispatch.id,
      fullName: 'Jane Smith',
      line1: '1 Queen St',
      line2: null,
      city: 'Melbourne',
      state: 'VIC',
      postcode: '3000',
      country: 'AU',
    };
    pendingDispatch.chooseShip(address);
    await repo.saveWithAddress(pendingDispatch, address);

    const dispatched = Fulfilment.create({ id: uuidv4(), lotId: uuidv4(), userId: uuidv4() });
    dispatched.chooseShip({ ...address, id: uuidv4(), fulfilmentId: dispatched.id });
    dispatched.markDispatched();
    await repo.save(dispatched);

    const count = await repo.countByStatuses([
      FulfilmentStatus.PENDING_CHOICE,
      FulfilmentStatus.PENDING_DISPATCH,
    ]);

    expect(count).toBe(2);
  });

  it('should_countZero_when_noFulfilmentsMatchStatuses', async () => {
    const count = await repo.countByStatuses([FulfilmentStatus.DISPATCHED]);

    expect(count).toBe(0);
  });
});
