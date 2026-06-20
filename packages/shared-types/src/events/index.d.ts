export type { UserRegisteredPayload, PhoneVerificationRequestedPayload } from './user-events.js';
export type { BidPlacedPayload, AuctionClosingSoonPayload, AuctionClosedPayload } from './auction-events.js';
export type { InvoiceCreatedPayload, PaymentReceivedPayload, InvoiceExpiredPayload } from './payment-events.js';
export type { ItemDispatchedPayload, ItemCollectedPayload } from './shipping-events.js';
export declare const ROUTING_KEYS: {
    readonly USER_REGISTERED: "user.registered";
    readonly USER_PHONE_VERIFICATION_REQUESTED: "user.phone.verification.requested";
    readonly AUCTION_BID_PLACED: "auction.bid.placed";
    readonly AUCTION_CLOSING_SOON: "auction.closing.soon";
    readonly AUCTION_CLOSED: "auction.closed";
    readonly PAYMENT_INVOICE_CREATED: "payment.invoice.created";
    readonly PAYMENT_RECEIVED: "payment.received";
    readonly PAYMENT_INVOICE_EXPIRED: "payment.invoice.expired";
    readonly SHIPPING_ITEM_DISPATCHED: "shipping.item.dispatched";
    readonly SHIPPING_ITEM_COLLECTED: "shipping.item.collected";
};
export type RoutingKey = typeof ROUTING_KEYS[keyof typeof ROUTING_KEYS];
//# sourceMappingURL=index.d.ts.map