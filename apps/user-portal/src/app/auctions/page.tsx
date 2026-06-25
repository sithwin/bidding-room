'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import useSWR from 'swr';
import * as Slider from '@radix-ui/react-slider';
import { Header } from '@/components/layout/header';
import { LotCard } from '@/components/primitives/lot-card';

type Lot = { id: string; auctionId: string; lotNumber: string; title: string; imageUrl: string; currentBid: number; currency: string; endAt: string };
type Facets = { departments: Array<{ name: string; count: number }>; auctions: Array<{ id: string; title: string }> };

const fetcher = (url: string) => fetch(url).then(r => r.json());

const STATUS_OPTIONS = [
  { value: 'open',    label: 'Open for bidding' },
  { value: 'closing', label: 'Ending today' },
  { value: 'reserve', label: 'No reserve' },
];

export default function BrowsePage() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  const q           = searchParams.get('q') ?? '';
  const sort        = searchParams.get('sort') ?? 'endAt';
  const minPrice    = searchParams.get('min') ?? '0';
  const maxPrice    = searchParams.get('max') ?? '100000';
  const departments = searchParams.getAll('dept');
  const statuses    = searchParams.getAll('status');
  const auctions    = searchParams.getAll('auction');

  const lotsParams = new URLSearchParams({ sort, ...(q && { q }), ...(minPrice !== '0' && { minPrice }), ...(maxPrice !== '100000' && { maxPrice }) });
  departments.forEach(d => lotsParams.append('department', d));
  statuses.forEach(s => lotsParams.append('status', s));
  auctions.forEach(a => lotsParams.append('auctionId', a));

  const { data, isLoading } = useSWR<{ lots: Lot[]; total: number }>(
    `/api/catalogue/lots?${lotsParams}`,
    fetcher,
    { refreshInterval: 15000 },
  );

  const facetsParams = new URLSearchParams({ ...(q && { q }) });
  const { data: facets } = useSWR<Facets>(`/api/catalogue/facets?${facetsParams}`, fetcher, { revalidateOnFocus: false });

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`/auctions?${next.toString()}`);
  }

  function toggleMulti(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    const existing = next.getAll(key);
    if (existing.includes(value)) {
      next.delete(key);
      existing.filter(v => v !== value).forEach(v => next.append(key, v));
    } else {
      next.append(key, value);
    }
    router.push(`/auctions?${next.toString()}`);
  }

  const handlePriceChange = useCallback((values: number[]) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('min', String(values[0]));
    next.set('max', String(values[1]));
    router.push(`/auctions?${next.toString()}`);
  }, [searchParams, router]);

  return (
    <>
      <Header />
      <div className='max-w-7xl mx-auto px-6 py-10 flex gap-8'>

        {/* ── Filter Sidebar ── */}
        <aside className='w-60 shrink-0 hidden xl:block space-y-8'>

          {/* Sort */}
          <div>
            <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-3'>Sort</h3>
            {[['endAt','Ending Soonest'],['lotNumber','Lot Number'],['priceAsc','Price Low→High'],['priceDesc','Price High→Low']].map(([val, label]) => (
              <label key={val} className='flex items-center gap-2 font-sans text-sm text-ink mb-2 cursor-pointer'>
                <input type='radio' name='sort' value={val} checked={sort === val} onChange={() => setParam('sort', val as string)} />
                {label}
              </label>
            ))}
          </div>

          {/* Department */}
          <div>
            <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-3'>Department</h3>
            {(facets?.departments ?? []).map(({ name, count }) => (
              <label key={name} className='flex items-center justify-between gap-2 font-sans text-sm text-ink mb-2 cursor-pointer'>
                <span className='flex items-center gap-2'>
                  <input type='checkbox' checked={departments.includes(name)} onChange={() => toggleMulti('dept', name)} />
                  {name}
                </span>
                <span className='text-mut text-xs'>{count}</span>
              </label>
            ))}
          </div>

          {/* Price range */}
          <div>
            <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-3'>Price range</h3>
            <Slider.Root
              className='relative flex items-center select-none touch-none w-full h-5 mb-3'
              min={0} max={100000} step={500}
              value={[Number(minPrice), Number(maxPrice)]}
              onValueCommit={handlePriceChange}
            >
              <Slider.Track className='bg-cream relative grow rounded-full h-1 border border-[var(--line)]'>
                <Slider.Range className='absolute bg-ink rounded-full h-full' />
              </Slider.Track>
              <Slider.Thumb className='block w-4 h-4 bg-ink rounded-full cursor-pointer focus:outline-none' />
              <Slider.Thumb className='block w-4 h-4 bg-ink rounded-full cursor-pointer focus:outline-none' />
            </Slider.Root>
            <div className='flex gap-2'>
              <input type='number' value={minPrice} onChange={e => setParam('min', e.target.value)}
                className='w-full border border-[var(--line)] px-2 py-1 font-sans text-xs' placeholder='Min' />
              <input type='number' value={maxPrice} onChange={e => setParam('max', e.target.value)}
                className='w-full border border-[var(--line)] px-2 py-1 font-sans text-xs' placeholder='Max' />
            </div>
          </div>

          {/* Status */}
          <div>
            <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-3'>Status</h3>
            {STATUS_OPTIONS.map(({ value, label }) => (
              <label key={value} className='flex items-center gap-2 font-sans text-sm text-ink mb-2 cursor-pointer'>
                <input type='checkbox' checked={statuses.includes(value)} onChange={() => toggleMulti('status', value)} />
                {label}
              </label>
            ))}
          </div>

          {/* Auction */}
          <div>
            <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-3'>Auction</h3>
            {(facets?.auctions ?? []).map(({ id, title }) => (
              <label key={id} className='flex items-center gap-2 font-sans text-sm text-ink mb-2 cursor-pointer'>
                <input type='checkbox' checked={auctions.includes(id)} onChange={() => toggleMulti('auction', id)} />
                <span className='line-clamp-1'>{title}</span>
              </label>
            ))}
          </div>

        </aside>

        {/* ── Results area ── */}
        <div className='flex-1 min-w-0'>
          {/* Tablet filter toggle — visible md to xl only */}
          <div className='hidden md:flex xl:hidden justify-end mb-4'>
            <button onClick={() => setFiltersOpen(true)}
              className='font-sans text-sm font-medium border border-[var(--line)] px-4 py-2 flex items-center gap-2'>
              <svg width='16' height='16' fill='none' stroke='currentColor' strokeWidth='1.5' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' d='M3 6h18M6 12h12M9 18h6' />
              </svg>
              Filters
            </button>
          </div>

          {/* Tablet filter drawer */}
          {filtersOpen && (
            <div className='fixed inset-0 z-50 xl:hidden' onClick={() => setFiltersOpen(false)}>
              <div className='absolute inset-y-0 left-0 w-72 bg-paper shadow-xl p-6 overflow-y-auto' onClick={e => e.stopPropagation()}>
                <div className='flex items-center justify-between mb-6'>
                  <h2 className='font-sans text-sm font-semibold uppercase tracking-widest text-mut'>Filters</h2>
                  <button onClick={() => setFiltersOpen(false)} className='font-sans text-xl text-mut hover:text-ink'>×</button>
                </div>

                {/* Sort */}
                <div className='mb-6'>
                  <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-3'>Sort</h3>
                  {[['endAt','Ending Soonest'],['lotNumber','Lot Number'],['priceAsc','Price Low→High'],['priceDesc','Price High→Low']].map(([val, label]) => (
                    <label key={val} className='flex items-center gap-2 font-sans text-sm text-ink mb-2 cursor-pointer'>
                      <input type='radio' name='sort-drawer' value={val} checked={sort === val} onChange={() => { setParam('sort', val as string); setFiltersOpen(false); }} />
                      {label}
                    </label>
                  ))}
                </div>

                {/* Department checkboxes */}
                <div className='mb-6'>
                  <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-3'>Department</h3>
                  {(facets?.departments ?? []).map(({ name, count }) => (
                    <label key={name} className='flex items-center justify-between gap-2 font-sans text-sm text-ink mb-2 cursor-pointer'>
                      <span className='flex items-center gap-2'>
                        <input type='checkbox' checked={departments.includes(name)} onChange={() => toggleMulti('dept', name)} className='accent-ink' />
                        {name}
                      </span>
                      <span className='text-mut text-xs'>{count}</span>
                    </label>
                  ))}
                </div>

                {/* Status checkboxes */}
                <div className='mb-6'>
                  <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-3'>Status</h3>
                  {STATUS_OPTIONS.map(({ value, label }) => (
                    <label key={value} className='flex items-center gap-2 font-sans text-sm text-ink mb-2 cursor-pointer'>
                      <input type='checkbox' checked={statuses.includes(value)} onChange={() => toggleMulti('status', value)} className='accent-ink' />
                      {label}
                    </label>
                  ))}
                </div>

                {/* Auction checkboxes */}
                <div className='mb-6'>
                  <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-3'>Auction</h3>
                  {(facets?.auctions ?? []).map(({ id, title }) => (
                    <label key={id} className='flex items-center gap-2 font-sans text-sm text-ink mb-2 cursor-pointer'>
                      <input type='checkbox' checked={auctions.includes(id)} onChange={() => toggleMulti('auction', id)} className='accent-ink' />
                      <span className='line-clamp-1'>{title}</span>
                    </label>
                  ))}
                </div>

                {/* Price range */}
                <div className='mb-6'>
                  <h3 className='font-sans text-xs font-semibold uppercase tracking-widest text-mut mb-3'>Price range</h3>
                  <Slider.Root
                    className='relative flex items-center select-none touch-none w-full h-5 mb-3'
                    min={0} max={100000} step={500}
                    value={[Number(minPrice), Number(maxPrice)]}
                    onValueCommit={handlePriceChange}
                  >
                    <Slider.Track className='bg-cream relative grow rounded-full h-1 border border-[var(--line)]'>
                      <Slider.Range className='absolute bg-ink rounded-full h-full' />
                    </Slider.Track>
                    <Slider.Thumb className='block w-4 h-4 bg-ink rounded-full cursor-pointer focus:outline-none' />
                    <Slider.Thumb className='block w-4 h-4 bg-ink rounded-full cursor-pointer focus:outline-none' />
                  </Slider.Root>
                  <div className='flex gap-2'>
                    <input type='number' value={minPrice} onChange={e => setParam('min', e.target.value)}
                      className='w-full border border-[var(--line)] px-2 py-1 font-sans text-xs' placeholder='Min' />
                    <input type='number' value={maxPrice} onChange={e => setParam('max', e.target.value)}
                      className='w-full border border-[var(--line)] px-2 py-1 font-sans text-xs' placeholder='Max' />
                  </div>
                </div>

                <button onClick={() => setFiltersOpen(false)}
                  className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90'>
                  Apply
                </button>
              </div>
            </div>
          )}

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
