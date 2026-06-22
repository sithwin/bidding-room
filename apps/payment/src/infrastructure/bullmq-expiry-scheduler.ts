import { Queue } from 'bullmq';
import { ExpiryScheduler } from '../application/expiry-scheduler';

const QUEUE_NAME = 'invoice-expiry';
const JOB_NAME = 'expire-invoice';

interface RedisOptions {
  host: string;
  port: number;
}

export class BullMQExpiryScheduler implements ExpiryScheduler {
  private readonly queue: Queue;

  constructor(redis: RedisOptions) {
    this.queue = new Queue(QUEUE_NAME, { connection: redis });
  }

  async scheduleExpiry(invoiceId: string, dueAt: Date): Promise<void> {
    const delay = Math.max(0, dueAt.getTime() - Date.now());
    await this.queue.add(
      JOB_NAME,
      { invoiceId },
      { jobId: `expiry:${invoiceId}`, delay },
    );
  }

  async cancelExpiry(invoiceId: string): Promise<void> {
    const job = await this.queue.getJob(`expiry:${invoiceId}`);
    if (job) {
      await job.remove();
    }
  }
}
