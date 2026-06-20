export interface InvoiceCreatedPayload {
  invoiceId: string;
  lotId: string;
  winnerUserId: string;
  amount: number;
  currency: string;
  dueAt: string;  // ISO 8601
}

export interface PaymentReceivedPayload {
  invoiceId: string;
  lotId: string;
  winnerUserId: string;
  amount: number;
  currency: string;
  paidAt: string; // ISO 8601
}

export interface InvoiceExpiredPayload {
  invoiceId: string;
  lotId: string;
  winnerUserId: string;
  expiredAt: string; // ISO 8601
}
