export type { UserRegisteredPayload, PhoneVerificationRequestedPayload } from './user-events.js';
export type { BidPlacedPayload, AuctionClosingSoonPayload, AuctionClosedPayload } from './auction-events.js';
export type { InvoiceCreatedPayload, PaymentReceivedPayload, InvoiceExpiredPayload } from './payment-events.js';
export type { ItemDispatchedPayload, ItemCollectedPayload } from './shipping-events.js';
export type { LotImageUploadedPayload, LotImageProcessedPayload, LotImageRejectedPayload, LotImageRejectionReason } from './catalogue-events.js';

export const ROUTING_KEYS = {
  USER_REGISTERED: 'user.registered',
  USER_PHONE_VERIFICATION_REQUESTED: 'user.phone.verification.requested',
  AUCTION_BID_PLACED: 'auction.bid.placed',
  AUCTION_CLOSING_SOON: 'auction.closing.soon',
  AUCTION_CLOSED: 'auction.closed',
  PAYMENT_INVOICE_CREATED: 'payment.invoice.created',
  PAYMENT_RECEIVED: 'payment.received',
  PAYMENT_INVOICE_EXPIRED: 'payment.invoice.expired',
  SHIPPING_ITEM_DISPATCHED: 'shipping.item.dispatched',
  SHIPPING_ITEM_COLLECTED: 'shipping.item.collected',
  LOT_IMAGE_UPLOADED: 'lot.image.uploaded',
  LOT_IMAGE_PROCESSED: 'lot.image.processed',
  LOT_IMAGE_REJECTED: 'lot.image.rejected',
} as const;

export type RoutingKey = typeof ROUTING_KEYS[keyof typeof ROUTING_KEYS];
