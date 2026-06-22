import { describe, it, expect, vi } from 'vitest';
import { Queue } from 'bullmq';
import { BullMQExpiryScheduler } from './bullmq-expiry-scheduler';

vi.mock('bullmq');

describe('BullMQExpiryScheduler', () => {
  it('should_addDelayedJob_when_schedulingExpiry', async () => {
    const mockAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
    vi.mocked(Queue).mockImplementation(
      () => ({ add: mockAdd, getJob: vi.fn().mockResolvedValue(null) }) as unknown as Queue,
    );

    const scheduler = new BullMQExpiryScheduler({ host: 'localhost', port: 6379 });
    const dueAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await scheduler.scheduleExpiry('inv-1', dueAt);

    expect(mockAdd).toHaveBeenCalledWith(
      'expire-invoice',
      { invoiceId: 'inv-1' },
      expect.objectContaining({ jobId: 'expiry:inv-1', delay: expect.any(Number) }),
    );
  });

  it('should_removeJob_when_cancellingExpiry', async () => {
    const mockRemove = vi.fn().mockResolvedValue(undefined);
    const mockGetJob = vi.fn().mockResolvedValue({ remove: mockRemove });
    vi.mocked(Queue).mockImplementation(
      () => ({ add: vi.fn(), getJob: mockGetJob }) as unknown as Queue,
    );

    const scheduler = new BullMQExpiryScheduler({ host: 'localhost', port: 6379 });

    await scheduler.cancelExpiry('inv-1');

    expect(mockGetJob).toHaveBeenCalledWith('expiry:inv-1');
    expect(mockRemove).toHaveBeenCalled();
  });
});
