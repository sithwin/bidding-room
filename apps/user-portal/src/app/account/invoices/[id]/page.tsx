'use client';
import { use, useState } from 'react';
import useSWR from 'swr';
import { z } from 'zod';
import { checkoutRequestSchema, type PaymentInvoice } from '@carat-room/shared-types';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { Toast } from '@/components/primitives/toast';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/user-auth';
import { parseInvoice, parseCheckout, parsePaySavedCard } from '@/lib/payment';

const STATUS_LABELS: Record<PaymentInvoice['status'], string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { accessToken } = useAuth();
  const [isPaying, setIsPaying] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  const { data: json, mutate } = useSWR(
    accessToken ? `/api/account/invoices/${id}` : null,
    (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
  );
  const invoice = json === undefined ? undefined : parseInvoice(json);

  async function paySavedCard() {
    setIsPaying(true);
    const res = await fetch(`/api/payments/invoices/${id}/pay-saved-card`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    setIsPaying(false);
    if (parsePaySavedCard(data)) {
      setToast({ message: 'Payment successful!', type: 'success' });
      mutate();
    } else {
      setToast({ message: errorMessage(data, 'Payment failed. Please try again.'), type: 'error' });
    }
  }

  async function payByCheckout() {
    if (!invoice) return;
    setIsPaying(true);
    const body = { lotTitle: `Lot ${invoice.lotId}` } satisfies z.infer<typeof checkoutRequestSchema>;
    const res = await fetch(`/api/payments/invoices/${id}/checkout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setIsPaying(false);
    const checkoutUrl = parseCheckout(data);
    if (checkoutUrl) window.location.href = checkoutUrl;
    else setToast({ message: errorMessage(data, 'Unable to create checkout session. Please try again.'), type: 'error' });
  }

  if (json === undefined) return null;

  if (!invoice) {
    return (
      <>
        <Header />
        <AccountShell>
          <p className='font-sans text-sm text-red-600'>Unable to load this invoice. Please try again later.</p>
        </AccountShell>
      </>
    );
  }

  const isPaid = invoice.status === 'PAID';

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>Invoice</h1>

        <div className='max-w-lg'>
          <div className='space-y-3 mb-8'>
            <div className='flex justify-between font-sans text-sm'>
              <span className='text-mut'>Lot</span>
              <span className='text-ink'>{invoice.lotId}</span>
            </div>
            <div className='flex justify-between font-sans text-sm'>
              <span className='text-mut'>Status</span>
              <span className='text-ink'>{STATUS_LABELS[invoice.status]}</span>
            </div>
            <div className='flex justify-between font-sans text-sm'>
              <span className='text-mut'>Due</span>
              <span className='text-ink'>{new Date(invoice.dueAt).toLocaleDateString('en-AU')}</span>
            </div>
            <div className='flex justify-between font-sans text-base font-semibold pt-4 border-t border-[var(--line)]'>
              <span className='text-ink'>Total due</span>
              <span className='text-ink'>{invoice.currency.toUpperCase()} {invoice.amount.toLocaleString()}</span>
            </div>
          </div>

          {isPaid ? (
            <div className='bg-green-50 border border-green-200 px-4 py-3'>
              <p className='font-sans text-sm text-green-800 font-medium'>Payment received</p>
            </div>
          ) : (
            <div className='space-y-3'>
              <button onClick={paySavedCard} disabled={isPaying}
                className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
                {isPaying ? 'Processing...' : `Pay ${invoice.currency.toUpperCase()} ${invoice.amount.toLocaleString()} with saved card`}
              </button>
              <button onClick={payByCheckout} disabled={isPaying}
                className='block w-full text-center border border-[var(--line)] font-sans text-sm py-3 text-ink hover:bg-cream transition-colors disabled:opacity-60'>
                Pay by card or bank transfer
              </button>
            </div>
          )}
        </div>
      </AccountShell>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}
