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
