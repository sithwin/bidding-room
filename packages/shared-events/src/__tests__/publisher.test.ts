import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventPublisher } from '../publisher.js';
import type { Channel, ChannelModel } from 'amqplib';

const mockChannel = {
  assertExchange: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockReturnValue(true),
  close: vi.fn().mockResolvedValue(undefined),
} as unknown as Channel;

const mockConnection = {
  createChannel: vi.fn().mockResolvedValue(mockChannel),
} as unknown as ChannelModel;

describe('EventPublisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockChannel.publish as ReturnType<typeof vi.fn>).mockReturnValue(true);
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

  it('should_throwError_when_channelRejectsPublish_due_toBackpressure', async () => {
    (mockChannel.publish as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const publisher = new EventPublisher(mockConnection);

    await expect(
      publisher.publish('user.registered', { userId: 'u1', email: 'a@b.com', createdAt: '2026-06-21T00:00:00Z' })
    ).rejects.toThrow('backpressure');
  });

  it('should_closeChannel_when_closeIsCalled', async () => {
    const publisher = new EventPublisher(mockConnection);
    await publisher.publish('user.registered', { userId: 'u1', email: 'a@b.com', createdAt: '2026-06-21T00:00:00Z' });
    await publisher.close();

    expect(mockChannel.close).toHaveBeenCalled();
  });
});
