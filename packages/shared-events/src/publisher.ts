import type { ChannelModel, Channel } from 'amqplib';
import type { RoutingKey } from '@carat-room/shared-types';

const EXCHANGE = 'carat.events';

export class EventPublisher {
  private channel: Channel | null = null;

  constructor(private readonly connection: ChannelModel) {}

  async publish<T>(routingKey: RoutingKey, payload: T): Promise<void> {
    const channel = await this.getChannel();
    const buffer = Buffer.from(JSON.stringify(payload));
    channel.publish(EXCHANGE, routingKey, buffer, {
      persistent: true,
      contentType: 'application/json',
    });
  }

  async close(): Promise<void> {
    await this.channel?.close();
    this.channel = null;
  }

  private async getChannel(): Promise<Channel> {
    if (!this.channel) {
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    }
    return this.channel;
  }
}
