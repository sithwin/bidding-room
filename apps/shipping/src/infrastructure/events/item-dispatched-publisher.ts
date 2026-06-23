import { EventPublisher } from '@carat-room/shared-events';
import { ROUTING_KEYS, ItemDispatchedPayload } from '@carat-room/shared-types';

export class ItemDispatchedPublisher {
  constructor(private readonly publisher: EventPublisher) {}

  async publish(payload: ItemDispatchedPayload): Promise<void> {
    await this.publisher.publish(ROUTING_KEYS.SHIPPING_ITEM_DISPATCHED, payload);
  }
}
