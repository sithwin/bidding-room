import { describe, it, expect, vi } from 'vitest';
import { Queue } from 'bullmq';
import { BullMQTimerScheduler } from './bullmq-timer-scheduler';

vi.mock('bullmq');

describe('BullMQTimerScheduler', () => {
  it('should_scheduleStartCloseAndClosingSoonJobs_when_auctionScheduled', async () => {
    const mockAdd = vi.fn().mockResolvedValue({});
    vi.mocked(Queue).mockImplementation(
      () => ({ add: mockAdd, getJob: vi.fn().mockResolvedValue(null) }) as unknown as Queue,
    );
    const scheduler = new BullMQTimerScheduler({ host: 'localhost', port: 6379 });

    await scheduler.scheduleStart('lot-1', new Date(Date.now() + 60_000));
    await scheduler.scheduleClose('lot-1', new Date(Date.now() + 3_600_000));
    await scheduler.scheduleClosingSoon('lot-1', new Date(Date.now() + 2_700_000));

    expect(mockAdd).toHaveBeenCalledWith('start-auction', { lotId: 'lot-1' }, expect.objectContaining({ jobId: 'start:lot-1' }));
    expect(mockAdd).toHaveBeenCalledWith('close-auction', { lotId: 'lot-1' }, expect.objectContaining({ jobId: 'close:lot-1' }));
    expect(mockAdd).toHaveBeenCalledWith('closing-soon', { lotId: 'lot-1' }, expect.objectContaining({ jobId: 'closing-soon:lot-1' }));
  });

  it('should_removeOldJobAndAddNew_when_reschedulingClose', async () => {
    const mockRemove = vi.fn();
    const mockAdd = vi.fn().mockResolvedValue({});
    vi.mocked(Queue).mockImplementation(
      () => ({
        add: mockAdd,
        getJob: vi.fn().mockResolvedValue({ remove: mockRemove }),
      }) as unknown as Queue,
    );
    const scheduler = new BullMQTimerScheduler({ host: 'localhost', port: 6379 });

    await scheduler.rescheduleClose('lot-1', new Date(Date.now() + 5_000_000));

    expect(mockRemove).toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledWith('close-auction', { lotId: 'lot-1' }, expect.objectContaining({ jobId: 'close:lot-1' }));
  });

  it('should_useDelayBasedOnFireAt_when_schedulingJobs', async () => {
    const mockAdd = vi.fn().mockResolvedValue({});
    vi.mocked(Queue).mockImplementation(
      () => ({ add: mockAdd, getJob: vi.fn().mockResolvedValue(null) }) as unknown as Queue,
    );
    const scheduler = new BullMQTimerScheduler({ host: 'localhost', port: 6379 });
    const fireAt = new Date(Date.now() + 7_200_000);

    await scheduler.scheduleClosingSoon('lot-1', fireAt);

    expect(mockAdd).toHaveBeenCalledWith(
      'closing-soon',
      { lotId: 'lot-1' },
      expect.objectContaining({ delay: expect.any(Number) }),
    );
  });
});
