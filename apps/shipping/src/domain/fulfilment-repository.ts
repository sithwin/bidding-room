import { Fulfilment, ShippingAddress, CollectionSlot } from './fulfilment';

export interface FulfilmentRepository {
  findById(id: string): Promise<Fulfilment | null>;
  findAll(filter: { status?: string }): Promise<Fulfilment[]>;
  findByLotId(lotId: string): Promise<Fulfilment | null>;
  save(fulfilment: Fulfilment): Promise<void>;
  saveWithAddress(fulfilment: Fulfilment, address: ShippingAddress): Promise<void>;
  saveWithSlot(fulfilment: Fulfilment, slot: CollectionSlot): Promise<void>;
  countByStatuses(statuses: string[]): Promise<number>;
}
