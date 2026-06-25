'use client';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

type WonLot = { lotId: string; auctionId: string; title: string; wonDate: string; hammerPrice: number; currency: string; invoiceId: string; fulfilmentId?: string; paymentStatus: string };

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
                  <td className='px-4 py-3'>
                    <Link href={`/auctions/${lot.auctionId}/lots/${lot.lotId}`} className='text-ink font-medium hover:underline'>{lot.title}</Link>
                    <p className='text-xs text-mut mt-0.5'>{new Date(lot.wonDate).toLocaleDateString('en-AU')}</p>
                  </td>
                  <td className='px-4 py-3'>{lot.currency.toUpperCase()} {lot.hammerPrice.toLocaleString()}</td>
                  <td className='px-4 py-3'><StatusPill status={lot.paymentStatus} /></td>
                  <td className='px-4 py-3 flex gap-3'>
                    <Link href={`/account/invoices/${lot.invoiceId}`} className='text-ink text-xs hover:underline'>Invoice</Link>
                    {lot.fulfilmentId && <Link href={`/account/fulfilments/${lot.fulfilmentId}`} className='text-ink text-xs hover:underline'>Fulfilment</Link>}
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
