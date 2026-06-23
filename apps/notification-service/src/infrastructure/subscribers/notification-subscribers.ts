import { EventSubscriber, createAmqpConnection } from '@carat-room/shared-events';
import type {
  UserRegisteredPayload,
  PhoneVerificationRequestedPayload,
  BidPlacedPayload,
  AuctionClosingSoonPayload,
  AuctionClosedPayload,
  InvoiceCreatedPayload,
  PaymentReceivedPayload,
  InvoiceExpiredPayload,
  ItemDispatchedPayload,
  ItemCollectedPayload,
} from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../../application/log-notification.use-case.js';
import type { EmailSender } from '../../application/email-sender.js';
import type { SmsSender } from '../../application/sms-sender.js';
import { handleUserRegistered } from '../../application/handlers/user-registered.handler.js';
import { handlePhoneVerification } from '../../application/handlers/phone-verification.handler.js';
import { handleBidPlaced } from '../../application/handlers/bid-placed.handler.js';
import { handleAuctionClosingSoon } from '../../application/handlers/auction-closing-soon.handler.js';
import { handleAuctionClosed } from '../../application/handlers/auction-closed.handler.js';
import { handleInvoiceCreated } from '../../application/handlers/invoice-created.handler.js';
import { handlePaymentReceived } from '../../application/handlers/payment-received.handler.js';
import { handleInvoiceExpired } from '../../application/handlers/invoice-expired.handler.js';
import { handleItemDispatched } from '../../application/handlers/item-dispatched.handler.js';
import { handleItemCollected } from '../../application/handlers/item-collected.handler.js';

interface Deps {
  useCase: LogNotificationUseCase;
  emailSender: EmailSender;
  smsSender: SmsSender;
  getUserEmail: (userId: string) => Promise<string>;
  getLotTitle: (lotId: string) => Promise<string>;
  getCurrentBid: (lotId: string) => Promise<string>;
  appBaseUrl: string;
  amqpUrl: string;
}

export async function startNotificationSubscribers(deps: Deps): Promise<void> {
  const connection = await createAmqpConnection(deps.amqpUrl);
  const subscriber = new EventSubscriber(connection);

  await subscriber.subscribe<UserRegisteredPayload>('notification.user.registered', (p) => handleUserRegistered(p, deps.useCase, deps.emailSender, deps.appBaseUrl));
  await subscriber.subscribe<PhoneVerificationRequestedPayload>('notification.phone.verification.requested', (p) => handlePhoneVerification(p, deps.useCase, deps.smsSender));
  await subscriber.subscribe<BidPlacedPayload>('notification.bid.placed', (p) => handleBidPlaced(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle, deps.appBaseUrl));
  await subscriber.subscribe<AuctionClosingSoonPayload>('notification.auction.closing.soon', (p) => handleAuctionClosingSoon(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle, deps.getCurrentBid, deps.appBaseUrl));
  await subscriber.subscribe<AuctionClosedPayload>('notification.auction.closed', (p) => handleAuctionClosed(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle, deps.appBaseUrl));
  await subscriber.subscribe<InvoiceCreatedPayload>('notification.invoice.created', (p) => handleInvoiceCreated(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle, deps.appBaseUrl));
  await subscriber.subscribe<PaymentReceivedPayload>('notification.payment.received', (p) => handlePaymentReceived(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle, deps.appBaseUrl));
  await subscriber.subscribe<InvoiceExpiredPayload>('notification.invoice.expired', (p) => handleInvoiceExpired(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle));
  await subscriber.subscribe<ItemDispatchedPayload>('notification.item.dispatched', (p) => handleItemDispatched(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle));
  await subscriber.subscribe<ItemCollectedPayload>('notification.item.collected', (p) => handleItemCollected(p, deps.useCase, deps.emailSender, deps.getUserEmail, deps.getLotTitle));

  console.log('[NotificationService] Subscribed to all 10 queues');
}
