'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';
import { LotCard } from '@/components/primitives/lot-card';

type Lot = { id: string; auctionId: string; lotNumber: string; title: string; imageUrl: string; currentBid: number; currency: string; endAt: string };

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function BrowsePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const q      = searchParams.get('q') ?? '';
  const sort   = searchParams.get('sort') ?? 'endAt';
  const minPrice = searchParams.get('min') ?? '';
  const maxPrice = searchParams.get('max') ?? '';

  const params = new URLSearchParams({ sort, ...(q && { q }), ...(minPrice && { minPrice }), ...(maxPrice && { maxPrice }) });
  const { data, isLoading } = useSWR<{ lots: Lot[]; total: number }>(
    `/api/catalogue/lots?${params}`,
    fetcher,
    { refreshInterval: 15000 },
  );

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`/auctions?${next.toString()}`);
  }

  return (
    <>
      <Header />
      <div className='max-w-7xl mx-auto px-6 py-10 flex gap-8'>
        {/* Sidebar filters */}
        <aside className='w-56 shrink-0 hidden md:block'>
          <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-4'>Sort by</h3>
          {[['endAt','Ending Soonest'],['lotNumber','Lot Number'],['priceAsc','Price Low→High'],['priceDesc','Price High→Low']].map(([val, label]) => (
            <label key={val} className='flex items-center gap-2 font-sans text-sm text-ink mb-2 cursor-pointer'>
              <input type='radio' name='sort' value={val} checked={sort === val} onChange={() => setParam('sort', val)} />
              {label}
            </label>
          ))}
          <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-4 mt-6'>Price range</h3>
          <div className='flex gap-2'>
            <input type='number' placeholder='Min' value={minPrice} onChange={e => setParam('min', e.target.value)}
              className='w-full border border-[var(--line)] px-2 py-1 font-sans text-sm' />
            <input type='number' placeholder='Max' value={maxPrice} onChange={e => setParam('max', e.target.value)}
              className='w-full border border-[var(--line)] px-2 py-1 font-sans text-sm' />
          </div>
        </aside>

        {/* Results */}
        <div className='flex-1 min-w-0'>
          <div className='flex items-center justify-between mb-6'>
            <p className='font-sans text-sm text-mut'>{data?.total ?? '—'} lots found</p>
          </div>
          {isLoading ? (
            <p className='font-sans text-sm text-mut'>Loading…</p>
          ) : data?.lots.length === 0 ? (
            <p className='font-sans text-sm text-mut'>No lots match your filters.</p>
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              {data?.lots.map(lot => (
                <LotCard
                  key={lot.id}
                  lotId={lot.id}
                  auctionId={lot.auctionId}
                  lotNumber={lot.lotNumber}
                  title={lot.title}
                  imageUrl={lot.imageUrl}
                  currentBid={lot.currentBid}
                  currency={lot.currency}
                  endAt={lot.endAt}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
