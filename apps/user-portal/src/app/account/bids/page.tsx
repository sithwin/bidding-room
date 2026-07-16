'use client';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { BidStatusBadge } from '@/components/primitives/bid-status-badge';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { useAuth } from '@/lib/auth-context';
import { parseAccountBids, deriveBidBadgeStatus } from '@/lib/auction';

export default function BidsPage() {
  const { accessToken } = useAuth();
  const { data } = useSWR<unknown>(
    accessToken ? `/api/account/bids` : null,
    (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
    { refreshInterval: 5000 },
  );
  // undefined = still loading — do not run it through the schema (it would log a spurious contract error)
  const bids = data === undefined ? null : parseAccountBids(data);

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>My Bids</h1>
        {!bids?.length ? (
          <p className='font-sans text-sm text-mut'>You have no active bids.</p>
        ) : (
          <table className='w-full font-sans text-sm'>
            <thead>
              <tr className='bg-cream'>
                {['', 'Lot', 'Your Bid', 'Current Bid', 'Status', 'Closes', ''].map((h, i) => (
                  <th key={i} className='px-4 py-3 text-left text-xs font-semibold text-mut uppercase tracking-wider'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y divide-[var(--line)]'>
              {bids.map(bid => {
                const badgeStatus = deriveBidBadgeStatus(bid);
                return (
                  <tr key={bid.lotId}>
                    {/* Thumbnail — auction-engine has no lot image data; always show the placeholder */}
                    <td className='px-4 py-3'>
                      <div className='relative w-10 h-10 border border-[var(--line)] overflow-hidden shrink-0'>
                        <div className='w-full h-full bg-cream' />
                      </div>
                    </td>
                    <td className='px-4 py-3'>
                      {/* auction-engine doesn't supply a lot title or the auctionId needed to
                          link into the lot page, so the lot id is shown as plain text. */}
                      <span className='text-ink font-medium line-clamp-2'>Lot {bid.lotId}</span>
                    </td>
                    <td className='px-4 py-3 text-ink'>{bid.amount.toLocaleString()}</td>
                    <td className='px-4 py-3 text-ink'>{bid.currentHighestBid !== null ? bid.currentHighestBid.toLocaleString() : '—'}</td>
                    <td className='px-4 py-3'><BidStatusBadge status={badgeStatus} /></td>
                    <td className='px-4 py-3'><CountdownTimer endAt={bid.endAt} /></td>
                    {/* Bid again — only for outbid rows; no direct link available (see above) */}
                    <td className='px-4 py-3' />
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </AccountShell>
    </>
  );
}
