import amqplib from 'amqplib';
import type { ChannelModel } from 'amqplib';

export async function createAmqpConnection(url: string): Promise<ChannelModel> {
  const connection = await amqplib.connect(url);
  connection.on('error', (err: Error) => {
    console.error('[RabbitMQ] Connection error:', err.message);
  });
  return connection;
}
