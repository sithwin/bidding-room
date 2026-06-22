export enum InvoiceStatus {
  AwaitingPayment = 'AWAITING_PAYMENT',
  Paid = 'PAID',
  Expired = 'EXPIRED',
  Cancelled = 'CANCELLED',
}

export interface InvoiceProps {
  id: string;
  lotId: string;
  winnerUserId: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  stripeCheckoutId: string | null;
  stripePaymentIntent: string | null;
  dueAt: Date;
  paidAt: Date | null;
  createdAt: Date;
}

export class Invoice {
  readonly id: string;
  readonly lotId: string;
  readonly winnerUserId: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: InvoiceStatus;
  readonly stripeCheckoutId: string | null;
  readonly stripePaymentIntent: string | null;
  readonly dueAt: Date;
  readonly paidAt: Date | null;
  readonly createdAt: Date;

  constructor(props: InvoiceProps) {
    this.id = props.id;
    this.lotId = props.lotId;
    this.winnerUserId = props.winnerUserId;
    this.amount = props.amount;
    this.currency = props.currency;
    this.status = props.status;
    this.stripeCheckoutId = props.stripeCheckoutId;
    this.stripePaymentIntent = props.stripePaymentIntent;
    this.dueAt = props.dueAt;
    this.paidAt = props.paidAt;
    this.createdAt = props.createdAt;
  }

  isOwnedBy(userId: string): boolean {
    return this.winnerUserId === userId;
  }

  isAwaitingPayment(): boolean {
    return this.status === InvoiceStatus.AwaitingPayment;
  }
}
