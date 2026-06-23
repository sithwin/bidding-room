import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createDb } from './infrastructure/db/db';
import { PostgresFulfilmentRepository } from './infrastructure/db/postgres-fulfilment-repository';
import { CreateFulfilmentUseCase } from './application/create-fulfilment.use-case';
import { ChooseShipUseCase } from './application/choose-ship.use-case';
import { ChooseCollectUseCase } from './application/choose-collect.use-case';
import { MarkDispatchedUseCase } from './application/mark-dispatched.use-case';
import { MarkCollectedUseCase } from './application/mark-collected.use-case';
import { GetFulfilmentUseCase } from './application/get-fulfilment.use-case';
import { PaymentReceivedHandler } from './infrastructure/events/payment-received-handler';
import { buildShippingRouter } from './presentation/shipping-router';
import { createAmqpConnection, EventSubscriber } from '@carat-room/shared-events';
import { authMiddleware, JwtPayload } from '@carat-room/shared-auth';
import { PaymentReceivedPayload } from '@carat-room/shared-types';

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const amqpUrl = process.env.AMQP_URL;
  const jwtPublicKey = process.env.JWT_PUBLIC_KEY;
  const port = Number(process.env.PORT ?? 3006);

  if (!databaseUrl || !amqpUrl || !jwtPublicKey) {
    throw new Error('Missing required environment variables: DATABASE_URL, AMQP_URL, JWT_PUBLIC_KEY');
  }

  const db = createDb(databaseUrl);
  const repo = new PostgresFulfilmentRepository(db);

  const createFulfilment = new CreateFulfilmentUseCase(repo);
  const chooseShip = new ChooseShipUseCase(repo);
  const chooseCollect = new ChooseCollectUseCase(repo);
  const markDispatched = new MarkDispatchedUseCase(repo);
  const markCollected = new MarkCollectedUseCase(repo);
  const getFulfilment = new GetFulfilmentUseCase(repo);

  const amqp = await createAmqpConnection(amqpUrl);
  const subscriber = new EventSubscriber(amqp);

  const paymentReceivedHandler = new PaymentReceivedHandler(createFulfilment);

  await subscriber.subscribe<PaymentReceivedPayload>(
    'shipping.payment-received',
    async (payload) => {
      await paymentReceivedHandler.handle(payload);
    },
  );

  const app = new Hono<AppEnv>();

  app.get('/health', (c) => c.json({ status: 'ok', service: 'shipping' }));

  app.use('/api/*', authMiddleware(jwtPublicKey));
  app.route('/api/shipping', buildShippingRouter({
    getFulfilment,
    chooseShip,
    chooseCollect,
    markDispatched,
    markCollected,
  }));

  serve({ fetch: app.fetch, port }, () => {
    console.log(`Shipping service listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
