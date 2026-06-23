import { EventPublisher } from '@carat-room/shared-events';
import { ROUTING_KEYS, ItemCollectedPayload } from '@carat-room/shared-types';

export class ItemCollectedPublisher {
  constructor(private readonly publisher: EventPublisher) {}

  async publish(payload: ItemCollectedPayload): Promise<void> {
    await this.publisher.publish(ROUTING_KEYS.SHIPPING_ITEM_COLLECTED, payload);
  }
}
