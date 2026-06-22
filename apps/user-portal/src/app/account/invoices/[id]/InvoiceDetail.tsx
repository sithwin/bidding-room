'use client';

import { useState } from 'react';

interface Invoice {
  id: string;
  lotId: string;
  amount: number;
  currency: string;
  status: 'AWAITING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  dueAt: string;
  paidAt: string | null;
}

interface Props {
  invoice: Invoice;
  paymentSuccess: boolean;
}

const STATUS_LABELS: Record<Invoice['status'], string> = {
  AWAITING_PAYMENT: 'Awaiting Payment',
  PAID: 'Paid',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

const STATUS_COLOURS: Record<Invoice['status'], string> = {
  AWAITING_PAYMENT: 'text-yellow-600',
  PAID: 'text-green-600',
  EXPIRED: 'text-red-600',
  CANCELLED: 'text-gray-500',
};

export function InvoiceDetail({ invoice, paymentSuccess }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formattedAmount = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: invoice.currency,
  }).format(invoice.amount);

  const formattedDueAt = new Intl.DateTimeFormat('en', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(invoice.dueAt));

  async function handlePayNow() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/invoices/${invoice.id}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotTitle: `Lot ${invoice.lotId}` }),
      });
      if (!res.ok) {
        setError('Unable to create checkout session. Please try again.');
        return;
      }
      const body = await res.json() as { data: { checkoutUrl: string } };
      window.location.href = body.data.checkoutUrl;
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {paymentSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium">Payment confirmed. Thank you!</p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Status</span>
          <span className={`font-medium ${STATUS_COLOURS[invoice.status]}`}>
            {STATUS_LABELS[invoice.status]}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-600">Amount Due</span>
          <span className="text-xl font-semibold">{formattedAmount}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-600">Payment Due By</span>
          <span>{formattedDueAt}</span>
        </div>

        {invoice.paidAt && (
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Paid At</span>
            <span>
              {new Intl.DateTimeFormat('en', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(invoice.paidAt))}
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}

      {invoice.status === 'AWAITING_PAYMENT' && !paymentSuccess && (
        <button
          onClick={handlePayNow}
          disabled={isLoading}
          className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Redirecting to payment...' : 'Pay Now'}
        </button>
      )}
    </div>
  );
}
