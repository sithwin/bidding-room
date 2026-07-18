import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import Redis from 'ioredis';
import { runMigrations } from '@carat-room/db-migrate';
import { createDb } from './infrastructure/db/db';
import { PostgresFulfilmentRepository } from './infrastructure/db/postgres-fulfilment-repository';
import { CreateFulfilmentUseCase } from './application/create-fulfilment.use-case';
import { ChooseShipUseCase } from './application/choose-ship.use-case';
import { ChooseCollectUseCase } from './application/choose-collect.use-case';
import { MarkDispatchedUseCase } from './application/mark-dispatched.use-case';
import { MarkCollectedUseCase } from './application/mark-collected.use-case';
import { GetFulfilmentUseCase } from './application/get-fulfilment.use-case';
import { ListFulfilmentsUseCase } from './application/list-fulfilments.use-case';
import { PaymentReceivedHandler } from './infrastructure/events/payment-received-handler';
import { buildShippingRouter } from './presentation/shipping-router';
import { buildShippingRateLimits } from './presentation/rate-limits';
import { createAmqpConnection, EventSubscriber } from '@carat-room/shared-events';
import { authMiddleware, JwtPayload } from '@carat-room/shared-auth';
import { PaymentReceivedPayload } from '@carat-room/shared-types';
import { createLogger, requestContextMiddleware } from '@carat-room/shared-logger';
import { createMetrics, httpMetricsMiddleware, metricsRoute } from '@carat-room/shared-metrics';

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const amqpUrl = process.env.RABBITMQ_URL;
  const jwtPublicKey = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');
  const port = Number(process.env.PORT ?? 3006);

  if (!databaseUrl || !amqpUrl || !jwtPublicKey) {
    throw new Error('Missing required environment variables: DATABASE_URL, RABBITMQ_URL, JWT_PUBLIC_KEY');
  }

  const db = createDb(databaseUrl);
  await runMigrations(db, join(__dirname, '..', 'migrations'));
  const repo = new PostgresFulfilmentRepository(db);

  const createFulfilment = new CreateFulfilmentUseCase(repo);
  const chooseShip = new ChooseShipUseCase(repo);
  const chooseCollect = new ChooseCollectUseCase(repo);
  const markDispatched = new MarkDispatchedUseCase(repo);
  const markCollected = new MarkCollectedUseCase(repo);
  const getFulfilment = new GetFulfilmentUseCase(repo);
  const listFulfilments = new ListFulfilmentsUseCase(repo);

  const amqp = await createAmqpConnection(amqpUrl);
  const subscriber = new EventSubscriber(amqp);

  const paymentReceivedHandler = new PaymentReceivedHandler(createFulfilment);

  await subscriber.subscribe<PaymentReceivedPayload>(
    'shipping.payment.received',
    async (payload) => {
      await paymentReceivedHandler.handle(payload);
    },
    'payment.received',
  );

  const redis = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  });
  const rateLimits = buildShippingRateLimits(redis);

  const logger = createLogger({ service: 'shipping', pretty: process.env.NODE_ENV !== 'production' });
  const metrics = createMetrics({ service: 'shipping' });

  const app = new Hono<AppEnv>();

  app.use('*', requestContextMiddleware(logger));
  app.use('*', httpMetricsMiddleware(metrics));

  app.get('/health', (c) => c.json({ status: 'ok', service: 'shipping' }));
  app.get('/metrics', metricsRoute(metrics));

  app.use('*', rateLimits.default);

  app.use('/api/*', authMiddleware(jwtPublicKey));
  app.route('/api/shipping', buildShippingRouter({
    getFulfilment,
    listFulfilments,
    chooseShip,
    chooseCollect,
    markDispatched,
    markCollected,
    countPendingFulfilments: () => repo.countByStatuses(['PENDING_CHOICE', 'PENDING_DISPATCH']),
  }));

  serve({ fetch: app.fetch, port }, () => {
    logger.info({ logEvent: 'SERVER_STARTED', payload: { port } }, `Shipping service listening on port ${port}`);
  });
}

main().catch((err) => {
  createLogger({ service: 'shipping' }).fatal({ err }, 'Fatal error during startup');
  process.exit(1);
});
