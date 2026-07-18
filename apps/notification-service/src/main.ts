import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import Redis from 'ioredis';
import { createPostgresClient } from './infrastructure/db/postgres-client.js';
import { PostgresNotificationRepository } from './infrastructure/db/postgres-notification-repository.js';
import { LogNotificationUseCase } from './application/log-notification.use-case.js';
import { ResendEmailSender } from './infrastructure/email/resend-email-sender.js';
import { TwilioSmsSender } from './infrastructure/sms/twilio-sms-sender.js';
import { startNotificationSubscribers } from './infrastructure/subscribers/notification-subscribers.js';
import { healthRouter } from './presentation/health-router.js';
import { buildNotificationRateLimits } from './presentation/rate-limits.js';
import { createLogger, requestContextMiddleware } from '@carat-room/shared-logger';
import { createMetrics, httpMetricsMiddleware, metricsRoute } from '@carat-room/shared-metrics';

const PORT = Number(process.env['PORT'] ?? 3005);
const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const RABBITMQ_URL = process.env['RABBITMQ_URL'] ?? '';
const RESEND_API_KEY = process.env['RESEND_API_KEY'] ?? '';
const RESEND_FROM = process.env['RESEND_FROM'] ?? 'noreply@thecaratroom.com';
const TWILIO_ACCOUNT_SID = process.env['TWILIO_ACCOUNT_SID'] ?? '';
const TWILIO_AUTH_TOKEN = process.env['TWILIO_AUTH_TOKEN'] ?? '';
const TWILIO_PHONE_NUMBER = process.env['TWILIO_PHONE_NUMBER'] ?? '';
const APP_BASE_URL = process.env['APP_BASE_URL'] ?? 'https://thecaratroom.com';
// http fallbacks are intentional: private Docker-network traffic; TLS terminates at the Nginx edge
const USER_SERVICE_URL = process.env['USER_SERVICE_URL'] ?? 'http://user-service:3001'; // NOSONAR
const CATALOGUE_SERVICE_URL = process.env['CATALOGUE_SERVICE_URL'] ?? 'http://catalogue-service:3002'; // NOSONAR
const AUCTION_ENGINE_URL = process.env['AUCTION_ENGINE_URL'] ?? 'http://auction-engine:3003'; // NOSONAR

async function main(): Promise<void> {
  const sql = createPostgresClient(DATABASE_URL);
  const repo = new PostgresNotificationRepository(sql);
  const useCase = new LogNotificationUseCase(repo);
  const emailSender = new ResendEmailSender(RESEND_API_KEY, RESEND_FROM);
  const smsSender = new TwilioSmsSender(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);

  await startNotificationSubscribers({
    useCase,
    emailSender,
    smsSender,
    getUserEmail: async (userId) => {
      const res = await fetch(`${USER_SERVICE_URL}/api/users/${userId}/email`);
      if (!res.ok) throw new Error(`Failed to fetch email for user ${userId}`);
      const data = await res.json() as { email: string };
      return data.email;
    },
    getLotTitle: async (lotId) => {
      const res = await fetch(`${CATALOGUE_SERVICE_URL}/api/lots/${lotId}`);
      if (!res.ok) throw new Error(`Failed to fetch lot ${lotId}`);
      const data = await res.json() as { data: { title: string } };
      return data.data.title;
    },
    getCurrentBid: async (lotId) => {
      const res = await fetch(`${AUCTION_ENGINE_URL}/api/auctions/${lotId}`);
      if (!res.ok) throw new Error(`Failed to fetch auction ${lotId}`);
      const data = await res.json() as { data: { currentHighestBid: number | null } };
      return data.data.currentHighestBid ? `$${data.data.currentHighestBid}` : 'No bids yet';
    },
    amqpUrl: RABBITMQ_URL,
    appBaseUrl: APP_BASE_URL,
  });

  const redis = new Redis({
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['REDIS_PORT'] ?? 6379),
  });
  const rateLimits = buildNotificationRateLimits(redis);

  const logger = createLogger({ service: 'notification', pretty: process.env.NODE_ENV !== 'production' });
  const metrics = createMetrics({ service: 'notification' });

  const app = new Hono();
  app.use('*', requestContextMiddleware(logger));
  app.use('*', httpMetricsMiddleware(metrics));
  app.use('*', rateLimits.default);
  app.route('/', healthRouter);
  app.get('/metrics', metricsRoute(metrics));

  serve({ fetch: app.fetch, port: PORT }, () => {
    logger.info({ logEvent: 'SERVER_STARTED', payload: { port: PORT } }, `Notification service listening on port ${PORT}`);
  });
}

main().catch((err) => {
  createLogger({ service: 'notification' }).fatal({ err }, 'Fatal error during startup');
  process.exit(1);
});
