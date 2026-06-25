import { Header } from '@/components/layout/header';
import { LotCard } from '@/components/primitives/lot-card';
import Link from 'next/link';

export const revalidate = 60;

const CATALOGUE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';

async function getClosingSoonLots() {
  try {
    const res = await fetch(`${CATALOGUE_URL}/api/lots?status=open&sort=endAt&limit=8`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json() as { lots: Array<{ id: string; auctionId: string; lotNumber: string; title: string; imageUrl: string; currentBid: number; currency: string; endAt: string }> };
    return data.lots;
  } catch { return []; }
}

async function getUpcomingAuctions() {
  try {
    const res = await fetch(`${CATALOGUE_URL}/api/auctions?status=upcoming&limit=3`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json() as { auctions: Array<{ id: string; title: string; saleDate: string; lotCount: number }> };
    return data.auctions;
  } catch { return []; }
}

export default async function HomePage() {
  const [lots, auctions] = await Promise.all([getClosingSoonLots(), getUpcomingAuctions()]);

  return (
    <>
      <Header />
      {/* Hero */}
      <section className='bg-ink text-paper px-6 py-20 text-center'>
        <p className='font-sans text-xs uppercase tracking-widest text-gold mb-4'>Currently open</p>
        <h1 className='font-serif text-4xl md:text-6xl font-semibold mb-6'>Fine Jewellery &amp; Watches</h1>
        <Link href='/auctions' className='inline-block border border-paper font-sans text-sm px-8 py-3 hover:bg-paper hover:text-ink transition-colors'>
          View Catalogue
        </Link>
      </section>

      {/* Closing soon */}
      <section className='max-w-7xl mx-auto px-6 py-16'>
        <h2 className='font-serif text-2xl font-semibold text-ink mb-8'>Closing soon</h2>
        {lots.length === 0 ? (
          <p className='font-sans text-mut text-sm'>No lots currently open.</p>
        ) : (
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
            {lots.map(lot => <LotCard key={lot.id} lotId={lot.id} auctionId={lot.auctionId} lotNumber={lot.lotNumber} title={lot.title} imageUrl={lot.imageUrl} currentBid={lot.currentBid} currency={lot.currency} endAt={lot.endAt} />)}
          </div>
        )}
      </section>

      {/* Upcoming auctions strip */}
      {auctions.length > 0 && (
        <section className='bg-cream border-t border-[var(--line)] px-6 py-12'>
          <div className='max-w-7xl mx-auto'>
            <h2 className='font-serif text-2xl font-semibold text-ink mb-6'>Upcoming Sales</h2>
            <div className='flex flex-col md:flex-row gap-4'>
              {auctions.map(a => (
                <div key={a.id} className='flex-1 bg-paper border border-[var(--line)] p-6'>
                  <p className='font-sans text-xs text-gold uppercase tracking-wider mb-2'>
                    {new Date(a.saleDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  <p className='font-serif text-lg font-semibold text-ink mb-1'>{a.title}</p>
                  <p className='font-sans text-sm text-mut'>{a.lotCount} lots</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
