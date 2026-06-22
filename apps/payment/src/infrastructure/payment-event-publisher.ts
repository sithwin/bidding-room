import { EventPublisher } from '@carat-room/shared-events';
import type { RoutingKey } from '@carat-room/shared-types';

export function createPaymentEventPublisher(
  publisher: EventPublisher,
): (routingKey: string, payload: unknown) => Promise<void> {
  return (routingKey: string, payload: unknown) =>
    publisher.publish(routingKey as RoutingKey, payload as Record<string, unknown>);
}
