import { AuctionDomainEvent } from './auction-events';

export interface StoredEvent {
  id: string;
  lotId: string;
  sequence: number;
  type: string;
  payload: unknown;
  occurredAt: Date;
}

export interface EventStore {
  append(lotId: string, events: AuctionDomainEvent[], afterSequence: number): Promise<void>;
  load(lotId: string): Promise<StoredEvent[]>;
}
