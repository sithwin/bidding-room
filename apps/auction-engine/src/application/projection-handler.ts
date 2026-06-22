import { AuctionDomainEvent } from '../domain/auction-events';

export interface ProjectionHandler {
  handle(lotId: string, events: AuctionDomainEvent[]): Promise<void>;
}
