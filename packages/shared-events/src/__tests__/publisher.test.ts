import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventPublisher } from '../publisher.js';
import type { Channel, Connection } from 'amqplib';

const mockChannel = {
  assertExchange: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockReturnValue(true),
  close: vi.fn().mockResolvedValue(undefined),
} as unknown as Channel;

const mockConnection = {
  createChannel: vi.fn().mockResolvedValue(mockChannel),
} as unknown as Connection;

describe('EventPublisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_publishMessageToExchange_when_publishIsCalled', async () => {
    const publisher = new EventPublisher(mockConnection);
    await publisher.publish('user.registered', {
      userId: 'user-1',
      email: 'test@example.com',
      createdAt: '2026-06-20T00:00:00Z',
    });

    expect(mockChannel.publish).toHaveBeenCalledWith(
      'carat.events',
      'user.registered',
      expect.any(Buffer),
      { persistent: true, contentType: 'application/json' }
    );
  });

  it('should_serialisePayloadAsJson_when_publishIsCalled', async () => {
    const publisher = new EventPublisher(mockConnection);
    const payload = { userId: 'user-1', email: 'test@example.com', createdAt: '2026-06-20T00:00:00Z' };
    await publisher.publish('user.registered', payload);

    const publishCall = (mockChannel.publish as ReturnType<typeof vi.fn>).mock.calls[0];
    const buffer = publishCall[2] as Buffer;
    expect(JSON.parse(buffer.toString())).toEqual(payload);
  });
});
