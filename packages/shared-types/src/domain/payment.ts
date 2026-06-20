export type InvoiceStatus =
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'EXPIRED'
  | 'CANCELLED';

export interface Invoice {
  id: string;
  lotId: string;
  winnerUserId: string;
  amount: number;
  currency: string;          // ISO 4217
  status: InvoiceStatus;
  stripeCheckoutId: string | null;
  stripePaymentIntent: string | null;
  dueAt: string;             // ISO 8601
  paidAt: string | null;     // ISO 8601
  createdAt: string;         // ISO 8601
}
