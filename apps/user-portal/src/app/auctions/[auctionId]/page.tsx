import { Header } from '@/components/layout/header';
import { notFound } from 'next/navigation';
import { CatalogueLots } from './catalogue-lots';

export const revalidate = 30;

const CATALOGUE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';

type Auction = { id: string; title: string; saleDate: string; location: string; description: string };

export default async function SaleCataloguePage({ params }: { params: { auctionId: string } }) {
  const auctionRes = await fetch(`${CATALOGUE_URL}/api/auctions/${params.auctionId}`, {
    next: { revalidate: 30 },
  });

  if (!auctionRes.ok) notFound();
  const auction = await auctionRes.json() as Auction;

  return (
    <>
      <Header />
      {/* Hero */}
      <section className='bg-ink text-paper px-6 py-16'>
        <div className='max-w-5xl mx-auto'>
          <p className='font-sans text-xs text-gold uppercase tracking-widest mb-3'>
            {new Date(auction.saleDate).toLocaleDateString('en-AU', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
          <h1 className='font-serif text-4xl font-semibold mb-2'>{auction.title}</h1>
          <p className='font-sans text-mut text-sm'>{auction.location}</p>
        </div>
      </section>

      {/* Action bar */}
      <div className='bg-cream border-b border-[var(--line)] px-6 py-4'>
        <div className='max-w-5xl mx-auto flex items-center gap-4'>
          <button className='bg-ink text-paper font-sans text-sm font-medium px-6 py-2 hover:bg-ink/90 transition-colors'>
            Register to Bid
          </button>
          <button className='border border-[var(--line)] font-sans text-sm px-6 py-2 text-ink hover:bg-paper transition-colors'>
            Download Catalogue
          </button>
          <button className='border border-[var(--line)] font-sans text-sm px-4 py-2 text-ink hover:bg-paper transition-colors flex items-center gap-2'>
            <span>♡</span> Follow Sale
          </button>
        </div>
      </div>

      {/* Lot grid with sort + pagination */}
      <CatalogueLots auctionId={params.auctionId} />
    </>
  );
}
