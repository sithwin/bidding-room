'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { Toast } from '@/components/primitives/toast';
import { useAuth } from '@/lib/auth-context';

type Invoice = {
  id: string; lotTitle: string; lotImageUrl: string; wonDate: string;
  hammerPrice: number; buyersPremium: number; gst: number; shipping: number;
  total: number; currency: string; status: string; stripeCheckoutUrl?: string;
};

export default function InvoicePage({ params }: { params: { id: string } }) {
  const { accessToken } = useAuth();
  const [isPaying, setIsPaying] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  const { data: invoice, mutate } = useSWR<Invoice>(
    accessToken ? `/api/account/invoices/${params.id}` : null,
    (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
  );

  async function paySavedCard() {
    setIsPaying(true);
    const res = await fetch(`/api/payments/invoices/${params.id}/pay-saved-card`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as { status?: string; error?: string };
    setIsPaying(false);
    if (data.status === 'paid') { setToast({ message: 'Payment successful!', type: 'success' }); mutate(); }
    else setToast({ message: data.error ?? 'Payment failed. Please try again.', type: 'error' });
  }

  if (!invoice) return null;

  const isPaid = invoice.status === 'PAID';

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>Invoice</h1>

        <div className='max-w-lg'>
          {/* Lot summary */}
          <div className='flex gap-4 mb-8 pb-8 border-b border-[var(--line)]'>
            <div className='flex-1'>
              <p className='font-serif text-base font-semibold text-ink'>{invoice.lotTitle}</p>
              <p className='font-sans text-xs text-mut mt-1'>Won {new Date(invoice.wonDate).toLocaleDateString('en-AU')}</p>
            </div>
          </div>

          {/* Price breakdown */}
          <div className='space-y-3 mb-8'>
            {[
              ['Hammer price', invoice.hammerPrice],
              ["Buyer's premium (22%)", invoice.buyersPremium],
              ['GST', invoice.gst],
              ['Shipping', invoice.shipping],
            ].map(([label, amount]) => (
              <div key={label as string} className='flex justify-between font-sans text-sm'>
                <span className='text-mut'>{label}</span>
                <span className='text-ink'>{invoice.currency.toUpperCase()} {(amount as number).toLocaleString()}</span>
              </div>
            ))}
            <div className='flex justify-between font-sans text-base font-semibold pt-4 border-t border-[var(--line)]'>
              <span className='text-ink'>Total due</span>
              <span className='text-ink'>{invoice.currency.toUpperCase()} {invoice.total.toLocaleString()}</span>
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
                {isPaying ? 'Processing...' : `Pay ${invoice.currency.toUpperCase()} ${invoice.total.toLocaleString()} with saved card`}
              </button>
              {invoice.stripeCheckoutUrl && (
                <a href={invoice.stripeCheckoutUrl}
                  className='block w-full text-center border border-[var(--line)] font-sans text-sm py-3 text-ink hover:bg-cream transition-colors'>
                  Pay by card or bank transfer
                </a>
              )}
            </div>
          )}
        </div>
      </AccountShell>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}