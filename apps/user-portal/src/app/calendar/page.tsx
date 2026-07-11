'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';

import { auctionsQuery, type CatalogueAuction } from '@carat-room/shared-types';
import { parseAuctionList } from '@/lib/catalogue';

type Tab = 'upcoming' | 'live' | 'results';

const fetcher = (url: string) => fetch(url).then(r => r.json());

function AuctionRow({ auction }: { auction: CatalogueAuction }) {
  const date = auction.saleDate ? new Date(auction.saleDate) : null;
  return (
    <div className='flex items-center gap-6 bg-paper border border-[var(--line)] p-5'>
      {/* Date column */}
      <div className='w-16 text-center shrink-0'>
        <p className='font-serif text-2xl font-semibold text-ink'>{date ? date.getDate() : '—'}</p>
        <p className='font-sans text-xs text-mut uppercase'>{date ? date.toLocaleString('en-AU', { month: 'short' }) : ''}</p>
      </div>

      {/* Thumbnail */}
      <div className='relative w-16 h-16 shrink-0 border border-[var(--line)] overflow-hidden'>
        <div className='w-full h-full bg-cream' />
      </div>

      {/* Text */}
      <div className='flex-1 min-w-0'>
        <p className='font-serif text-base font-semibold text-ink truncate'>{auction.title}</p>
        <p className='font-sans text-sm text-mut'>{auction.lotCount} lots · {auction.location ?? '—'}</p>
      </div>

      {/* CTA */}
      {auction.status === 'open'
        ? <a href={`/auctions/${auction.id}`} className='shrink-0 bg-ink text-paper font-sans text-sm px-5 py-2 hover:bg-ink/90 transition-colors'>View Catalogue</a>
        : <button className='shrink-0 border border-[var(--line)] font-sans text-sm px-5 py-2 text-mut hover:text-ink transition-colors'>Register Interest</button>}
    </div>
  );
}

export default function CalendarPage() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const { data } = useSWR<unknown>(`/api/catalogue/auctions?${auctionsQuery({ limit: 50 })}`, fetcher, { revalidateOnFocus: false });

  // undefined = still loading — do not run it through the schema (it would log a spurious contract error)
  const auctions = data === undefined ? [] : parseAuctionList(data);
  const filtered = {
    upcoming: auctions.filter(a => a.status === 'upcoming'),
    live:     auctions.filter(a => a.status === 'open'),
    results:  auctions.filter(a => a.status === 'closed'),
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'live',     label: 'Live Now' },
    { key: 'results',  label: 'Results' },
  ];

  return (
    <>
      <Header />
      <div className='max-w-4xl mx-auto px-6 py-12'>
        <h1 className='font-serif text-3xl font-semibold text-ink mb-8'>Auction Calendar</h1>

        {/* Tab bar */}
        <div className='flex border-b border-[var(--line)] mb-8'>
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-6 pb-3 font-sans text-sm font-medium transition-colors ${tab === key ? 'border-b-2 border-ink text-ink' : 'text-mut hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className='flex flex-col gap-3'>
          {filtered[tab].length === 0
            ? <p className='font-sans text-sm text-mut'>No auctions in this category.</p>
            : filtered[tab].map(a => <AuctionRow key={a.id} auction={a} />)}
        </div>
      </div>
    </>
  );
}
