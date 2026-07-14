import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import Redis from 'ioredis';
import { createAmqpConnection, EventPublisher } from '@carat-room/shared-events';
import { runMigrations } from '@carat-room/db-migrate';
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
import { buildAdminRateLimits } from './presentation/rate-limits';

const PORT = Number(process.env['PORT'] ?? 3007);

async function main(): Promise<void> {
  // http fallbacks are intentional: private Docker-network traffic; TLS terminates at the Nginx edge
  const catalogue = new ServiceClient(process.env['CATALOGUE_SERVICE_URL'] ?? 'http://catalogue-service:3002'); // NOSONAR
  const auction   = new ServiceClient(process.env['AUCTION_ENGINE_URL']    ?? 'http://auction-engine:3003');    // NOSONAR
  const user      = new ServiceClient(process.env['USER_SERVICE_URL']      ?? 'http://user-service:3001');      // NOSONAR
  const payment   = new ServiceClient(process.env['PAYMENT_SERVICE_URL']   ?? 'http://payment-service:3004');   // NOSONAR
  const shipping  = new ServiceClient(process.env['SHIPPING_SERVICE_URL']  ?? 'http://shipping-service:3006');  // NOSONAR

  const db = createDb(process.env['ADMIN_DATABASE_URL'] ?? '');
  await runMigrations(db, join(__dirname, '..', 'migrations'));
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

  const redis = new Redis({
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['REDIS_PORT'] ?? 6379),
  });
  const rateLimits = buildAdminRateLimits(redis);

  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok', service: 'admin' }));
  app.use('*', rateLimits.default);
  app.route('/', buildLotsRouter({ catalogue, auction }));
  app.route('/', buildCategoriesRouter(catalogue));
  app.route('/', buildAuctionsRouter({ auction, catalogue }));
  app.route('/', buildUsersRouter(user));
  app.route('/', buildInvoicesRouter({ payment, catalogue, user }));
  app.route('/', buildFulfilmentsRouter({ shipping, catalogue, user }));
  app.route('/', buildReportsRouter({ auction, payment, catalogue, user, shipping }));
  app.route('/', buildEnquiriesRouter({
    submitEnquiry: (input) => submitEnquiry.execute(input),
    r2,
    listEnquiries: (filter) => enquiryRepo.findAll(filter),
    updateEnquiryStatus: (id, status) => enquiryRepo.updateStatus(id, status),
  }));

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`Admin service running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start admin service:', err);
  process.exit(1);
});
