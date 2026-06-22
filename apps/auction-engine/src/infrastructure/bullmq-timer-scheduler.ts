import { Queue } from 'bullmq';
import { TimerScheduler } from '../application/timer-scheduler';

const QUEUE_NAME = 'auction-timers';

interface RedisOptions {
  host: string;
  port: number;
}

export class BullMQTimerScheduler implements TimerScheduler {
  private readonly queue: Queue;

  constructor(redis: RedisOptions) {
    this.queue = new Queue(QUEUE_NAME, { connection: redis });
  }

  async scheduleStart(lotId: string, startAt: Date): Promise<void> {
    const delay = Math.max(0, startAt.getTime() - Date.now());
    await this.queue.add('start-auction', { lotId }, { jobId: `start:${lotId}`, delay });
  }

  async scheduleClose(lotId: string, endAt: Date): Promise<void> {
    const delay = Math.max(0, endAt.getTime() - Date.now());
    await this.queue.add('close-auction', { lotId }, { jobId: `close:${lotId}`, delay });
  }

  async rescheduleClose(lotId: string, newEndAt: Date): Promise<void> {
    const existing = await this.queue.getJob(`close:${lotId}`);
    if (existing) {
      await existing.remove();
    }
    const delay = Math.max(0, newEndAt.getTime() - Date.now());
    await this.queue.add('close-auction', { lotId }, { jobId: `close:${lotId}`, delay });
  }

  async scheduleClosingSoon(lotId: string, fireAt: Date): Promise<void> {
    const delay = Math.max(0, fireAt.getTime() - Date.now());
    await this.queue.add('closing-soon', { lotId }, { jobId: `closing-soon:${lotId}`, delay });
  }
}
