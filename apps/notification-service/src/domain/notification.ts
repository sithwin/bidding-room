export type NotificationChannel = 'EMAIL' | 'SMS';
export type NotificationStatus = 'SENT' | 'FAILED';

export type NotificationType =
  | 'USER_REGISTERED'
  | 'PHONE_VERIFICATION_REQUESTED'
  | 'BID_PLACED_OUTBID'
  | 'AUCTION_CLOSING_SOON'
  | 'AUCTION_CLOSED_WON'
  | 'AUCTION_CLOSED_UNSOLD'
  | 'INVOICE_CREATED'
  | 'PAYMENT_RECEIVED'
  | 'INVOICE_EXPIRED'
  | 'ITEM_DISPATCHED'
  | 'ITEM_COLLECTED';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  error: string | null;
  sentAt: Date | null;
  createdAt: Date;
}
