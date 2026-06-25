import { Header } from '@/components/layout/header';
import Link from 'next/link';

export const revalidate = 60;

const CATALOGUE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';

type Auction = { id: string; title: string; saleDate: string; lotCount: number; status: 'upcoming' | 'open' | 'closed'; location: string };

async function getAuctions(): Promise<{ upcoming: Auction[]; live: Auction[]; results: Auction[] }> {
  try {
    const res = await fetch(`${CATALOGUE_URL}/api/auctions?limit=50`, { next: { revalidate: 60 } });
    if (!res.ok) return { upcoming: [], live: [], results: [] };
    const data = await res.json() as { auctions: Auction[] };
    return {
      upcoming: data.auctions.filter(a => a.status === 'upcoming'),
      live:     data.auctions.filter(a => a.status === 'open'),
      results:  data.auctions.filter(a => a.status === 'closed'),
    };
  } catch { return { upcoming: [], live: [], results: [] }; }
}

function AuctionRow({ auction }: { auction: Auction }) {
  const date = new Date(auction.saleDate);
  return (
    <div className='flex items-center gap-6 bg-paper border border-[var(--line)] p-5'>
      <div className='w-16 text-center shrink-0'>
        <p className='font-serif text-2xl font-semibold text-ink'>{date.getDate()}</p>
        <p className='font-sans text-xs text-mut uppercase'>{date.toLocaleString('en-AU', { month: 'short' })}</p>
      </div>
      <div className='flex-1 min-w-0'>
        <p className='font-serif text-base font-semibold text-ink truncate'>{auction.title}</p>
        <p className='font-sans text-sm text-mut'>{auction.lotCount} lots · {auction.location}</p>
      </div>
      {auction.status === 'open' ? (
        <Link href={`/auctions/${auction.id}`} className='shrink-0 bg-ink text-paper font-sans text-sm px-5 py-2 hover:bg-ink/90 transition-colors'>View Catalogue</Link>
      ) : (
        <button className='shrink-0 border border-[var(--line)] font-sans text-sm px-5 py-2 text-mut hover:text-ink transition-colors'>Register Interest</button>
      )}
    </div>
  );
}

export default async function CalendarPage() {
  const { upcoming, live, results } = await getAuctions();

  return (
    <>
      <Header />
      <div className='max-w-4xl mx-auto px-6 py-12'>
        <h1 className='font-serif text-3xl font-semibold text-ink mb-10'>Auction Calendar</h1>

        {live.length > 0 && (
          <section className='mb-10'>
            <h2 className='font-sans text-xs uppercase tracking-widest text-gold mb-4'>Live Now</h2>
            <div className='flex flex-col gap-3'>{live.map(a => <AuctionRow key={a.id} auction={a} />)}</div>
          </section>
        )}

        <section className='mb-10'>
          <h2 className='font-sans text-xs uppercase tracking-widest text-gold mb-4'>Upcoming</h2>
          {upcoming.length === 0 ? <p className='font-sans text-mut text-sm'>No upcoming auctions.</p>
            : <div className='flex flex-col gap-3'>{upcoming.map(a => <AuctionRow key={a.id} auction={a} />)}</div>}
        </section>

        <section>
          <h2 className='font-sans text-xs uppercase tracking-widest text-gold mb-4'>Results</h2>
          {results.length === 0 ? <p className='font-sans text-mut text-sm'>No past results yet.</p>
            : <div className='flex flex-col gap-3'>{results.map(a => <AuctionRow key={a.id} auction={a} />)}</div>}
        </section>
      </div>
    </>
  );
}
