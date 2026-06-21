import type { ChannelModel, Channel } from 'amqplib';
import type { RoutingKey } from '@carat-room/shared-types';

const EXCHANGE = 'carat.events';

export class EventPublisher {
  private channelPromise: Promise<Channel> | null = null;

  constructor(private readonly connection: ChannelModel) {}

  async publish<T>(routingKey: RoutingKey, payload: T): Promise<void> {
    const channel = await this.getChannel();
    const buffer = Buffer.from(JSON.stringify(payload));
    const ok = channel.publish(EXCHANGE, routingKey, buffer, {
      persistent: true,
      contentType: 'application/json',
    });
    if (!ok) {
      throw new Error(`[EventPublisher] Channel rejected publish to "${EXCHANGE}" with routing key "${routingKey}" — backpressure`);
    }
  }

  async close(): Promise<void> {
    if (this.channelPromise) {
      const ch = await this.channelPromise;
      await ch.close();
      this.channelPromise = null;
    }
  }

  private getChannel(): Promise<Channel> {
    if (!this.channelPromise) {
      this.channelPromise = this.connection.createChannel().then(async (ch) => {
        await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
        return ch;
      });
    }
    return this.channelPromise;
  }
}
