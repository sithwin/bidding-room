'use client';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { BidStatusBadge } from '@/components/primitives/bid-status-badge';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

type Bid = { lotId: string; auctionId: string; title: string; yourBid: number; currentBid: number; status: 'leading' | 'outbid'; endAt: string; currency: string };

export default function BidsPage() {
  const { accessToken } = useAuth();
  const { data } = useSWR<{ bids: Bid[] }>(
    accessToken ? `/api/account/bids` : null,
    (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
    { refreshInterval: 5000 },
  );

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>My Bids</h1>
        {!data?.bids.length ? (
          <p className='font-sans text-sm text-mut'>You have no active bids.</p>
        ) : (
          <table className='w-full font-sans text-sm'>
            <thead>
              <tr className='bg-cream'>
                {['Lot', 'Your Bid', 'Current Bid', 'Status', 'Closes'].map(h => (
                  <th key={h} className='px-4 py-3 text-left text-xs font-semibold text-mut uppercase tracking-wider'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y divide-[var(--line)]'>
              {data.bids.map(bid => (
                <tr key={bid.lotId}>
                  <td className='px-4 py-3'>
                    <Link href={`/auctions/${bid.auctionId}/lots/${bid.lotId}`} className='text-ink font-medium hover:underline line-clamp-2'>{bid.title}</Link>
                  </td>
                  <td className='px-4 py-3 text-ink'>{bid.currency.toUpperCase()} {bid.yourBid.toLocaleString()}</td>
                  <td className='px-4 py-3 text-ink'>{bid.currency.toUpperCase()} {bid.currentBid.toLocaleString()}</td>
                  <td className='px-4 py-3'><BidStatusBadge status={bid.status} /></td>
                  <td className='px-4 py-3'><CountdownTimer endAt={bid.endAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AccountShell>
    </>
  );
}
