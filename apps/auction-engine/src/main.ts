import { serve } from '@hono/node-server';
import { createAmqpConnection, EventPublisher } from '@carat-room/shared-events';
import { createDb } from './infrastructure/db';
import { PostgresEventStore } from './infrastructure/postgres-event-store';
import { PostgresProjectionHandler } from './infrastructure/postgres-projection-handler';
import { PostgresLotQueryRepository } from './infrastructure/postgres-lot-query-repository';
import { RedisLockAdapter } from './infrastructure/redis-lock';
import { BullMQTimerScheduler } from './infrastructure/bullmq-timer-scheduler';
import { RabbitMQAuctionPublisher } from './infrastructure/rabbitmq-auction-publisher';
import { InMemorySseBroadcaster } from './infrastructure/in-memory-sse-broadcaster';
import { BullMQAuctionWorker } from './infrastructure/bullmq-auction-worker';
import { ScheduleAuctionCommandHandler } from './application/schedule-auction-handler';
import { StartAuctionCommandHandler } from './application/start-auction-handler';
import { PlaceBidCommandHandler } from './application/place-bid-handler';
import { CancelAuctionCommandHandler } from './application/cancel-auction-handler';
import { CloseAuctionCommandHandler } from './application/close-auction-handler';
import { GetLotStatusHandler } from './application/get-lot-status-handler';
import { GetBidHistoryHandler } from './application/get-bid-history-handler';
import { GetActiveLotsHandler } from './application/get-active-lots-handler';
import { createAuctionRouter } from './presentation/auction-router';

const PORT = Number(process.env['PORT'] ?? 3003);

async function main(): Promise<void> {
  const db = createDb(process.env['DATABASE_URL'] ?? 'postgres://localhost/carat_auction');
  const redis = {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['REDIS_PORT'] ?? '6379'),
  };
  const amqpUrl = process.env['RABBITMQ_URL'] ?? 'amqp://localhost';

  const amqpConn = await createAmqpConnection(amqpUrl);
  const eventPublisher = new EventPublisher(amqpConn);

  // Infrastructure adapters
  const eventStore = new PostgresEventStore(db);
  const projectionHandler = new PostgresProjectionHandler(db);
  const queryRepository = new PostgresLotQueryRepository(db);
  const redisLock = new RedisLockAdapter(redis);
  const timerScheduler = new BullMQTimerScheduler(redis);
  const auctionPublisher = new RabbitMQAuctionPublisher(eventPublisher);
  const sseBroadcaster = new InMemorySseBroadcaster();

  // Command handlers
  // scheduleAuctionHandler and cancelAuctionHandler are wired for use by Plan 08 (Admin Service)
  const scheduleAuctionHandler = new ScheduleAuctionCommandHandler(eventStore, projectionHandler, timerScheduler);
  const startAuctionHandler = new StartAuctionCommandHandler(eventStore, projectionHandler);
  const placeBidHandler = new PlaceBidCommandHandler(
    eventStore,
    projectionHandler,
    auctionPublisher,
    redisLock,
    timerScheduler,
  );
  const cancelAuctionHandler = new CancelAuctionCommandHandler(eventStore, projectionHandler);
  const closeAuctionHandler = new CloseAuctionCommandHandler(eventStore, projectionHandler, auctionPublisher);

  void cancelAuctionHandler;

  // Query handlers
  const getLotStatusHandler = new GetLotStatusHandler(queryRepository);
  const getBidHistoryHandler = new GetBidHistoryHandler(queryRepository);
  const getActiveLotsHandler = new GetActiveLotsHandler(queryRepository);

  // BullMQ worker — processes timer jobs enqueued by BullMQTimerScheduler
  new BullMQAuctionWorker(
    redis,
    startAuctionHandler,
    closeAuctionHandler,
    getLotStatusHandler,
    auctionPublisher,
    sseBroadcaster,
  );

  const jwtPublicKey = process.env['JWT_PUBLIC_KEY'] ?? '';

  // HTTP server
  const app = createAuctionRouter({
    getActiveLots: getActiveLotsHandler,
    getLotStatus: getLotStatusHandler,
    getBidHistory: getBidHistoryHandler,
    placeBidHandler,
    scheduleAuctionHandler,
    sseBroadcaster,
    jwtPublicKey,
  });

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`Auction Engine running on :${PORT}`);
  });
}

main().catch(console.error);
