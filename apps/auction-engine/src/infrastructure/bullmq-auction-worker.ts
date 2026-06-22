import { Job, Worker } from 'bullmq';
import { StartAuctionCommandHandler } from '../application/start-auction-handler';
import { CloseAuctionCommandHandler } from '../application/close-auction-handler';
import { AuctionEventPublisher } from '../application/auction-event-publisher';
import { SseBroadcaster } from '../application/sse-broadcaster';
import { GetLotStatusHandler } from '../application/get-lot-status-handler';

const QUEUE_NAME = 'auction-timers';

interface RedisOptions {
  host: string;
  port: number;
}

interface TimerJobData {
  lotId: string;
}

export class BullMQAuctionWorker {
  private readonly worker: Worker;

  constructor(
    redis: RedisOptions,
    private readonly startHandler: StartAuctionCommandHandler,
    private readonly closeHandler: CloseAuctionCommandHandler,
    private readonly getLotStatusHandler: GetLotStatusHandler,
    private readonly publisher: AuctionEventPublisher,
    private readonly sseBroadcaster: SseBroadcaster,
  ) {
    this.worker = new Worker(QUEUE_NAME, this.process.bind(this), { connection: redis });
  }

  private async process(job: Job<TimerJobData>): Promise<void> {
    const { lotId } = job.data;

    switch (job.name) {
      case 'start-auction':
        await this.startHandler.execute({ lotId });
        break;

      case 'close-auction': {
        await this.closeHandler.execute({ lotId });
        const status = await this.getLotStatusHandler.execute(lotId);
        if (status) {
          this.sseBroadcaster.broadcast(lotId, 'auction_closed', {
            highestBid: status.currentHighestBid,
            bidCount: status.bidCount,
            endAt: status.endAt.toISOString(),
            status: status.status,
          });
        }
        break;
      }

      case 'closing-soon': {
        const status = await this.getLotStatusHandler.execute(lotId);
        if (status) {
          await this.publisher.publishAuctionClosingSoon({
            lotId,
            endAt: status.endAt.toISOString(),
          });
        }
        break;
      }
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}
