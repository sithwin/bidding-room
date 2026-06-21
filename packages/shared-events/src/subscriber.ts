import type { ChannelModel, Channel, ConsumeMessage } from 'amqplib';

export class EventSubscriber {
  private channel: Channel | null = null;

  constructor(private readonly connection: ChannelModel) {}

  async subscribe<T>(
    queue: string,
    handler: (payload: T) => Promise<void>
  ): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertQueue(queue, { durable: true });
    await channel.prefetch(1);

    await channel.consume(queue, async (msg: ConsumeMessage | null) => {
      if (!msg) return;
      try {
        const payload = JSON.parse(msg.content.toString()) as T;
        await handler(payload);
        channel.ack(msg);
      } catch (err) {
        console.error(`[EventSubscriber] Failed to process message on queue "${queue}":`, err);
        channel.nack(msg, false, false);
      }
    });
  }

  async close(): Promise<void> {
    await this.channel?.close();
    this.channel = null;
  }

  private async getChannel(): Promise<Channel> {
    if (!this.channel) {
      this.channel = await this.connection.createChannel();
    }
    return this.channel;
  }
}
