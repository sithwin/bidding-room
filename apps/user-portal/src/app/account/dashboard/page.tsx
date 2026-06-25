'use client';
import Image from 'next/image';
import useSWR from 'swr';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { BidStatusBadge } from '@/components/primitives/bid-status-badge';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { useAuth } from '@/lib/auth-context';

const fetcher = (url: string, token: string) =>
  fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());

type Stats = { activeBids: number; leading: number; watching: number; wonThisYear: number };
type Bid = { lotId: string; auctionId: string; title: string; imageUrl: string; yourBid: number; currentBid: number; status: 'leading' | 'outbid'; endAt: string };

export default function DashboardPage() {
  const { accessToken, user } = useAuth();
  const { data: stats } = useSWR<Stats>(
    accessToken ? ['/api/account/stats', accessToken] : null,
    ([url, tok]: [string, string]) => fetcher(url, tok),
    { refreshInterval: 5000 },
  );
  const { data: bidsData } = useSWR<{ bids: Bid[] }>(
    accessToken ? ['/api/account/bids?limit=5', accessToken] : null,
    ([url, tok]: [string, string]) => fetcher(url, tok),
    { refreshInterval: 5000 },
  );

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-2'>
          Welcome back{user ? `, ${user.email.split('@')[0]}` : ''}
        </h1>
        <p className='font-sans text-sm text-mut mb-8'>
          {stats
            ? `You are leading on ${stats.leading} lot${stats.leading !== 1 ? 's' : ''}${stats.activeBids > 0 ? `. ${stats.activeBids} bid${stats.activeBids !== 1 ? 's' : ''} active.` : '.'}`
            : 'Here\'s your bidding overview.'}
        </p>

        {/* Stat cards */}
        <div className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-10'>
          {[
            { label: 'Active Bids', value: stats?.activeBids ?? '—' },
            { label: 'Leading', value: stats?.leading ?? '—' },
            { label: 'Watching', value: stats?.watching ?? '—' },
            { label: 'Won This Year', value: stats?.wonThisYear ?? '—', dark: true },
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
          {bidsData?.bids.length === 0 && <p className='font-sans text-sm text-mut'>No active bids.</p>}
          <div className='flex flex-col divide-y divide-[var(--line)]'>
            {bidsData?.bids.map(bid => (
              <div key={bid.lotId} className='py-4 flex items-center gap-4'>
                {/* Thumbnail 46px */}
                <div className='relative w-[46px] h-[46px] shrink-0 border border-[var(--line)] overflow-hidden'>
                  {bid.imageUrl
                    ? <Image src={bid.imageUrl} alt={bid.title} fill className='object-cover' />
                    : <div className='w-full h-full bg-cream' />}
                </div>
                <div className='flex-1 min-w-0'>
                  <Link href={`/auctions/${bid.auctionId}/lots/${bid.lotId}`}
                    className='font-sans text-sm font-medium text-ink hover:underline truncate block'>{bid.title}</Link>
                  <p className='font-sans text-xs text-mut mt-0.5'>Your bid: {bid.yourBid.toLocaleString()}</p>
                </div>
                <BidStatusBadge status={bid.status} />
                <CountdownTimer endAt={bid.endAt} />
              </div>
            ))}
          </div>
        </div>
      </AccountShell>
    </>
  );
}
