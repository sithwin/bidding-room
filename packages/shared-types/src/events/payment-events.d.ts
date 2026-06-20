export interface InvoiceCreatedPayload {
    invoiceId: string;
    lotId: string;
    winnerUserId: string;
    amount: number;
    currency: string;
    dueAt: string;
}
export interface PaymentReceivedPayload {
    invoiceId: string;
    lotId: string;
    winnerUserId: string;
    amount: number;
    currency: string;
    paidAt: string;
}
export interface InvoiceExpiredPayload {
    invoiceId: string;
    lotId: string;
    winnerUserId: string;
    expiredAt: string;
}
//# sourceMappingURL=payment-events.d.ts.map