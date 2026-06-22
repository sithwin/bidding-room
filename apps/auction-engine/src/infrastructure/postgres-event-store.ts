import { v4 as uuidv4 } from 'uuid';
import { AuctionDomainEvent } from '../domain/auction-events';
import { EventStore, StoredEvent } from '../domain/event-store';
import { Db } from './db';

interface EventRow {
  id: string;
  lot_id: string;
  sequence: string;
  event_type: string;
  payload: unknown;
  occurred_at: Date;
}

export class PostgresEventStore implements EventStore {
  constructor(private readonly db: Db) {}

  async append(lotId: string, events: AuctionDomainEvent[], afterSequence: number): Promise<void> {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      await this.db`
        INSERT INTO auction_events (id, lot_id, sequence, event_type, payload)
        VALUES (
          ${uuidv4()},
          ${lotId},
          ${afterSequence + i + 1},
          ${event.type},
          ${this.db.json(event.payload as Record<string, unknown>)}
        )
      `;
    }
  }

  async load(lotId: string): Promise<StoredEvent[]> {
    const rows = await this.db<EventRow[]>`
      SELECT id, lot_id, sequence, event_type, payload, occurred_at
      FROM auction_events
      WHERE lot_id = ${lotId}
      ORDER BY sequence ASC
    `;
    return rows.map(row => ({
      id: row.id,
      lotId: row.lot_id,
      sequence: Number(row.sequence),
      type: row.event_type,
      payload: row.payload,
      occurredAt: row.occurred_at,
    }));
  }
}
