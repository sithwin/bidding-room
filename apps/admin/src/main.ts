import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createAmqpConnection, EventPublisher } from '@carat-room/shared-events';
import { ServiceClient } from './infrastructure/service-client';
import { createDb } from './infrastructure/db';
import { R2UploadClient } from './infrastructure/r2-upload-client';
import { PostgresEnquiryRepository } from './infrastructure/postgres-enquiry-repository';
import { SubmitValuationEnquiryUseCase } from './application/submit-valuation-enquiry.use-case';
import { buildLotsRouter } from './presentation/lots-router';
import { buildCategoriesRouter } from './presentation/categories-router';
import { buildAuctionsRouter } from './presentation/auctions-router';
import { buildUsersRouter } from './presentation/users-router';
import { buildInvoicesRouter } from './presentation/invoices-router';
import { buildFulfilmentsRouter } from './presentation/fulfilments-router';
import { buildReportsRouter } from './presentation/reports-router';
import { buildEnquiriesRouter } from './presentation/enquiries-router';

const PORT = Number(process.env['PORT'] ?? 3007);

async function main(): Promise<void> {
  const catalogue = new ServiceClient(process.env['CATALOGUE_SERVICE_URL'] ?? 'http://catalogue-service:3002');
  const auction   = new ServiceClient(process.env['AUCTION_SERVICE_URL']   ?? 'http://auction-service:3003');
  const user      = new ServiceClient(process.env['USER_SERVICE_URL']      ?? 'http://user-service:3001');
  const payment   = new ServiceClient(process.env['PAYMENT_SERVICE_URL']   ?? 'http://payment-service:3004');
  const shipping  = new ServiceClient(process.env['SHIPPING_SERVICE_URL']  ?? 'http://shipping-service:3006');

  const db = createDb(process.env['ADMIN_DATABASE_URL'] ?? '');
  const r2 = new R2UploadClient({
    accountId: process.env['R2_ACCOUNT_ID'] ?? '',
    accessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',
    bucketName: process.env['R2_BUCKET_NAME'] ?? '',
  });
  const enquiryRepo = new PostgresEnquiryRepository(db);

  const amqp = await createAmqpConnection(process.env['RABBITMQ_URL'] ?? '');
  const publisher = new EventPublisher(amqp);
  const publishEvent = (key: string, payload: Record<string, unknown>) =>
    publisher.publish(key as any, payload);

  const submitEnquiry = new SubmitValuationEnquiryUseCase(enquiryRepo, publishEvent);

  const app = new Hono();
  app.route('/', buildLotsRouter(catalogue));
  app.route('/', buildCategoriesRouter(catalogue));
  app.route('/', buildAuctionsRouter(auction));
  app.route('/', buildUsersRouter(user));
  app.route('/', buildInvoicesRouter(payment));
  app.route('/', buildFulfilmentsRouter(shipping));
  app.route('/', buildReportsRouter(auction));
  app.route('/', buildEnquiriesRouter({
    submitEnquiry: (input) => submitEnquiry.execute(input),
    r2,
  }));

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`Admin service running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start admin service:', err);
  process.exit(1);
});
