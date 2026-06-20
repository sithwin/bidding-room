export type InvoiceStatus = 'AWAITING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CANCELLED';
export interface Invoice {
    id: string;
    lotId: string;
    winnerUserId: string;
    amount: number;
    currency: string;
    status: InvoiceStatus;
    stripeCheckoutId: string | null;
    stripePaymentIntent: string | null;
    dueAt: string;
    paidAt: string | null;
    createdAt: string;
}
//# sourceMappingURL=payment.d.ts.map