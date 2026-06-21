import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventSubscriber } from '../subscriber.js';
import type { Channel, Connection, ConsumeMessage } from 'amqplib';

const mockChannel = {
  assertQueue: vi.fn().mockResolvedValue(undefined),
  prefetch: vi.fn().mockResolvedValue(undefined),
  consume: vi.fn().mockResolvedValue(undefined),
  ack: vi.fn(),
  nack: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
} as unknown as Channel;

const mockConnection = {
  createChannel: vi.fn().mockResolvedValue(mockChannel),
} as unknown as Connection;

describe('EventSubscriber', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_assertQueueAndStartConsuming_when_subscribeIsCalled', async () => {
    const subscriber = new EventSubscriber(mockConnection);
    await subscriber.subscribe('notification.user.registered', vi.fn().mockResolvedValue(undefined));

    expect(mockChannel.assertQueue).toHaveBeenCalledWith(
      'notification.user.registered',
      { durable: true }
    );
    expect(mockChannel.consume).toHaveBeenCalledWith(
      'notification.user.registered',
      expect.any(Function)
    );
  });

  it('should_callHandlerWithParsedPayload_when_messageIsReceived', async () => {
    const subscriber = new EventSubscriber(mockConnection);
    const handler = vi.fn().mockResolvedValue(undefined);
    let capturedConsumer: ((msg: ConsumeMessage | null) => Promise<void>) | null = null;

    (mockChannel.consume as ReturnType<typeof vi.fn>).mockImplementation(
      (_queue: string, consumer: (msg: ConsumeMessage | null) => Promise<void>) => {
        capturedConsumer = consumer;
        return Promise.resolve(undefined);
      }
    );

    await subscriber.subscribe('notification.user.registered', handler);

    const payload = { userId: 'user-1', email: 'test@example.com', createdAt: '2026-06-20T00:00:00Z' };
    const fakeMsg = { content: Buffer.from(JSON.stringify(payload)) } as ConsumeMessage;
    await capturedConsumer!(fakeMsg);

    expect(handler).toHaveBeenCalledWith(payload);
    expect(mockChannel.ack).toHaveBeenCalledWith(fakeMsg);
  });

  it('should_nackMessage_when_handlerThrows', async () => {
    const subscriber = new EventSubscriber(mockConnection);
    const handler = vi.fn().mockRejectedValue(new Error('handler failed'));
    let capturedConsumer: ((msg: ConsumeMessage | null) => Promise<void>) | null = null;

    (mockChannel.consume as ReturnType<typeof vi.fn>).mockImplementation(
      (_queue: string, consumer: (msg: ConsumeMessage | null) => Promise<void>) => {
        capturedConsumer = consumer;
        return Promise.resolve(undefined);
      }
    );

    await subscriber.subscribe('notification.user.registered', handler);

    const fakeMsg = { content: Buffer.from(JSON.stringify({ userId: 'user-1' })) } as ConsumeMessage;
    await capturedConsumer!(fakeMsg);

    expect(mockChannel.nack).toHaveBeenCalledWith(fakeMsg, false, false);
  });
});
