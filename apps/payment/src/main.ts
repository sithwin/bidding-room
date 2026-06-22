import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { Worker } from 'bullmq';
import { createAmqpConnection, EventPublisher, EventSubscriber } from '@carat-room/shared-events';
import { createDb } from './infrastructure/db';
import { PostgresInvoiceRepository } from './infrastructure/postgres-invoice-repository';
import { StripeAdapter } from './infrastructure/stripe-adapter';
import { BullMQExpiryScheduler } from './infrastructure/bullmq-expiry-scheduler';
import { createPaymentEventPublisher } from './infrastructure/payment-event-publisher';
import { startAuctionClosedConsumer } from './infrastructure/auction-closed-consumer';
import { GetInvoiceUseCase } from './application/get-invoice-use-case';
import { CreateCheckoutSessionUseCase } from './application/create-checkout-session-use-case';
import { HandleWebhookUseCase } from './application/handle-webhook-use-case';
import { CreateInvoiceUseCase } from './application/create-invoice-use-case';
import { ExpireInvoiceUseCase } from './application/expire-invoice-use-case';
import { buildPaymentRouter } from './presentation/payment-router';

const PORT = Number(process.env['PORT'] ?? 3003);
const DATABASE_URL = process.env['DATABASE_URL']!;
const RABBITMQ_URL = process.env['RABBITMQ_URL']!;
const REDIS_HOST = process.env['REDIS_HOST'] ?? 'localhost';
const REDIS_PORT = Number(process.env['REDIS_PORT'] ?? 6379);
const STRIPE_SECRET_KEY = process.env['STRIPE_SECRET_KEY']!;
const STRIPE_WEBHOOK_SECRET = process.env['STRIPE_WEBHOOK_SECRET']!;
const FRONTEND_URL = process.env['FRONTEND_URL']!;
const PAYMENT_WINDOW_HOURS = Number(process.env['PAYMENT_WINDOW_HOURS'] ?? 72);
const JWT_PUBLIC_KEY = process.env['JWT_PUBLIC_KEY']!;

async function main(): Promise<void> {
  const db = createDb(DATABASE_URL);
  const invoiceRepository = new PostgresInvoiceRepository(db);
  const stripeAdapter = new StripeAdapter(STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET);
  const redis = { host: REDIS_HOST, port: REDIS_PORT };
  const expiryScheduler = new BullMQExpiryScheduler(redis);

  const amqp = await createAmqpConnection(RABBITMQ_URL);
  const eventPublisher = new EventPublisher(amqp);
  const publish = createPaymentEventPublisher(eventPublisher);

  const createInvoiceUseCase = new CreateInvoiceUseCase(
    invoiceRepository, expiryScheduler, publish, PAYMENT_WINDOW_HOURS,
  );
  const expireInvoiceUseCase = new ExpireInvoiceUseCase(invoiceRepository, publish);
  const getInvoiceUseCase = new GetInvoiceUseCase(invoiceRepository);
  const createCheckoutSessionUseCase = new CreateCheckoutSessionUseCase(
    invoiceRepository, stripeAdapter, FRONTEND_URL,
  );
  const handleWebhookUseCase = new HandleWebhookUseCase(
    invoiceRepository, stripeAdapter, publish, expiryScheduler,
  );

  const eventSubscriber = new EventSubscriber(amqp);
  await startAuctionClosedConsumer(eventSubscriber, createInvoiceUseCase);

  new Worker(
    'invoice-expiry',
    async (job) => {
      const { invoiceId } = job.data as { invoiceId: string };
      await expireInvoiceUseCase.execute({ invoiceId });
    },
    { connection: redis },
  );

  const app = new Hono();
  app.route('/', buildPaymentRouter({
    getInvoice: getInvoiceUseCase,
    createCheckoutSession: createCheckoutSessionUseCase,
    handleWebhook: handleWebhookUseCase,
    jwtPublicKey: JWT_PUBLIC_KEY,
  }));

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`Payment service running on port ${PORT}`);
  });
}

main();
