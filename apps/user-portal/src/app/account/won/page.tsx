'use client';
import Image from 'next/image';
import Link from 'next/link';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { useAuth } from '@/lib/auth-context';

type WonLot = { lotId: string; auctionId: string; title: string; imageUrl: string; wonDate: string; hammerPrice: number; currency: string; invoiceId: string; fulfilmentId?: string; paymentStatus: string };

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Payment due': 'bg-amber-100 text-amber-800',
    'Shipped':     'bg-green-100 text-green-800',
    'Delivered':   'bg-green-100 text-green-800',
    'Collected':   'bg-green-100 text-green-800',
  };
  return <span className={`font-sans text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}

export default function WonLotsPage() {
  const { accessToken } = useAuth();
  const { data } = useSWR<{ lots: WonLot[] }>(
    accessToken ? '/api/account/won' : null,
    (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
    { refreshInterval: 5000 },
  );

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>Won Lots</h1>
        {!data?.lots.length ? (
          <p className='font-sans text-sm text-mut'>No won lots yet.</p>
        ) : (
          <table className='w-full font-sans text-sm'>
            <thead>
              <tr className='bg-cream'>
                {['Lot', 'Hammer Price', 'Status', 'Actions'].map(h => (
                  <th key={h} className='px-4 py-3 text-left text-xs font-semibold text-mut uppercase tracking-wider'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y divide-[var(--line)]'>
              {data.lots.map(lot => (
                <tr key={lot.lotId}>
                  {/* Lot: thumbnail + title + won date */}
                  <td className='px-4 py-3'>
                    <div className='flex items-center gap-3'>
                      <div className='relative w-10 h-10 border border-[var(--line)] overflow-hidden shrink-0'>
                        {lot.imageUrl
                          ? <Image src={lot.imageUrl} alt={lot.title} fill className='object-cover' />
                          : <div className='w-full h-full bg-cream' />}
                      </div>
                      <div>
                        <Link href={`/auctions/${lot.auctionId}/lots/${lot.lotId}`}
                          className='text-ink font-medium hover:underline line-clamp-1'>{lot.title}</Link>
                        <p className='text-xs text-mut mt-0.5'>{new Date(lot.wonDate).toLocaleDateString('en-AU')}</p>
                      </div>
                    </div>
                  </td>
                  <td className='px-4 py-3'>{lot.currency.toUpperCase()} {lot.hammerPrice.toLocaleString()}</td>
                  <td className='px-4 py-3'><StatusPill status={lot.paymentStatus} /></td>
                  {/* Context-sensitive actions */}
                  <td className='px-4 py-3'>
                    <div className='flex gap-3 flex-wrap'>
                      {lot.paymentStatus === 'Payment due' && (
                        <Link href={`/account/invoices/${lot.invoiceId}`}
                          className='font-sans text-xs text-ink border border-[var(--line)] px-3 py-1.5 hover:bg-cream transition-colors'>
                          Pay now
                        </Link>
                      )}
                      {lot.fulfilmentId && ['Shipped', 'Delivered'].includes(lot.paymentStatus) && (
                        <Link href={`/account/fulfilments/${lot.fulfilmentId}`}
                          className='font-sans text-xs text-ink hover:underline'>
                          Track
                        </Link>
                      )}
                      <Link href={`/account/invoices/${lot.invoiceId}`}
                        className='font-sans text-xs text-mut hover:text-ink hover:underline'>
                        Invoice
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AccountShell>
    </>
  );
}
