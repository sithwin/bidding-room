'use client';
import useSWR from 'swr';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { BidStatusBadge } from '@/components/primitives/bid-status-badge';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { useAuth } from '@/lib/auth-context';
import { parseAccountBids, parseAccountStats, deriveBidBadgeStatus } from '@/lib/auction';

const fetcher = (url: string, token: string) =>
  fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());

export default function DashboardPage() {
  const { accessToken, user } = useAuth();
  const { data: statsData } = useSWR<unknown>(
    accessToken ? ['/api/account/stats', accessToken] : null,
    ([url, tok]: [string, string]) => fetcher(url, tok),
    { refreshInterval: 5000 },
  );
  const { data: bidsData } = useSWR<unknown>(
    accessToken ? ['/api/account/bids?pageSize=5', accessToken] : null,
    ([url, tok]: [string, string]) => fetcher(url, tok),
    { refreshInterval: 5000 },
  );
  // undefined = still loading — do not run it through the schema (it would log a spurious contract error)
  const stats = statsData === undefined ? null : parseAccountStats(statsData);
  const bids = bidsData === undefined ? null : parseAccountBids(bidsData);

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-2'>
          Welcome back{user ? `, ${user.email.split('@')[0]}` : ''}
        </h1>
        <p className='font-sans text-sm text-mut mb-8'>
          {stats
            ? `You are leading on ${stats.leadingBids} lot${stats.leadingBids !== 1 ? 's' : ''}${stats.activeBids > 0 ? `. ${stats.activeBids} bid${stats.activeBids !== 1 ? 's' : ''} active.` : '.'}`
            : 'Here\'s your bidding overview.'}
        </p>

        {/* Stat cards — 'Watching' is omitted: it's catalogue's watchlist count and
            auction-engine's /api/account/stats has no data source for it. */}
        <div className='grid grid-cols-3 gap-4 mb-10'>
          {[
            { label: 'Active Bids', value: stats?.activeBids ?? '—' },
            { label: 'Leading', value: stats?.leadingBids ?? '—' },
            { label: 'Won This Year', value: stats?.lotsWon ?? '—', dark: true },
          ].map(({ label, value, dark }) => (
            <div key={label} className={`p-5 border ${dark ? 'bg-ink text-paper border-ink' : 'bg-paper border-[var(--line)]'}`}>
              <p className={`font-sans text-xs uppercase tracking-widest mb-2 ${dark ? 'text-mut' : 'text-mut'}`}>{label}</p>
              <p className={`font-serif text-3xl font-semibold ${dark ? 'text-paper' : 'text-ink'}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Recent bids */}
        <div>
          <div className='flex items-center justify-between mb-4'>
            <h2 className='font-sans text-sm font-semibold uppercase tracking-widest text-mut'>Active Bids</h2>
            <Link href='/account/bids' className='font-sans text-xs text-gold hover:text-ink'>View all →</Link>
          </div>
          {/* Covers both "no bids yet" and a drifted/unparseable response — never leave the
              section silently blank when there is nothing safe to render. */}
          {!bids?.length && <p className='font-sans text-sm text-mut'>No active bids.</p>}
          <div className='flex flex-col divide-y divide-[var(--line)]'>
            {bids?.map(bid => (
              <div key={bid.lotId} className='py-4 flex items-center gap-4'>
                {/* Thumbnail — auction-engine has no lot image data; always show the placeholder */}
                <div className='relative w-[46px] h-[46px] shrink-0 border border-[var(--line)] overflow-hidden'>
                  <div className='w-full h-full bg-cream' />
                </div>
                <div className='flex-1 min-w-0'>
                  {/* No lot title or auctionId available from this endpoint — show the lot id as plain text */}
                  <span className='font-sans text-sm font-medium text-ink truncate block'>Lot {bid.lotId}</span>
                  <p className='font-sans text-xs text-mut mt-0.5'>Your bid: {bid.amount.toLocaleString()}</p>
                </div>
                <BidStatusBadge status={deriveBidBadgeStatus(bid)} />
                <CountdownTimer endAt={bid.endAt} />
              </div>
            ))}
          </div>
        </div>
      </AccountShell>
    </>
  );
}
