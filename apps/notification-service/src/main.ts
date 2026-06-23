import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createPostgresClient } from './infrastructure/db/postgres-client.js';
import { PostgresNotificationRepository } from './infrastructure/db/postgres-notification-repository.js';
import { LogNotificationUseCase } from './application/log-notification.use-case.js';
import { ResendEmailSender } from './infrastructure/email/resend-email-sender.js';
import { TwilioSmsSender } from './infrastructure/sms/twilio-sms-sender.js';
import { startNotificationSubscribers } from './infrastructure/subscribers/notification-subscribers.js';
import { healthRouter } from './presentation/health-router.js';

const PORT = Number(process.env['PORT'] ?? 3005);
const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const RABBITMQ_URL = process.env['RABBITMQ_URL'] ?? '';
const RESEND_API_KEY = process.env['RESEND_API_KEY'] ?? '';
const RESEND_FROM = process.env['RESEND_FROM'] ?? 'noreply@thecaratroom.com';
const TWILIO_ACCOUNT_SID = process.env['TWILIO_ACCOUNT_SID'] ?? '';
const TWILIO_AUTH_TOKEN = process.env['TWILIO_AUTH_TOKEN'] ?? '';
const TWILIO_PHONE_NUMBER = process.env['TWILIO_PHONE_NUMBER'] ?? '';
const APP_BASE_URL = process.env['APP_BASE_URL'] ?? 'https://thecaratroom.com';
const USER_SERVICE_URL = process.env['USER_SERVICE_URL'] ?? 'http://user-service:3001';
const CATALOGUE_SERVICE_URL = process.env['CATALOGUE_SERVICE_URL'] ?? 'http://catalogue-service:3002';
const AUCTION_ENGINE_URL = process.env['AUCTION_ENGINE_URL'] ?? 'http://auction-engine:3003';

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

  const app = new Hono();
  app.route('/', healthRouter);

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`[NotificationService] Listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('[NotificationService] Fatal error:', err);
  process.exit(1);
});
