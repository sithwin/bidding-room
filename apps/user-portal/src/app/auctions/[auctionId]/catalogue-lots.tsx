'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { useFormatter } from 'next-intl';
import { LotCard } from '@/components/primitives/lot-card';

type Lot = {
  id: string;
  auctionId: string;
  lotNumber: string;
  title: string;
  imageUrl: string;
  currentBid: number;
  currency: string;
  endAt: string;
};
type Sort = 'lotNumber' | 'endAt' | 'price';

const fetcher = (url: string) => fetch(url).then(r => r.json());
const PAGE_SIZE = 24;

export function CatalogueLots({ auctionId }: { auctionId: string }) {
  const [sort, setSort] = useState<Sort>('lotNumber');
  const [page, setPage] = useState(1);
  const format = useFormatter();

  const { data, error } = useSWR<{ lots: Lot[]; total: number }>(
    `/api/catalogue/lots?auctionId=${auctionId}&sort=${sort}&page=${page}&limit=${PAGE_SIZE}`,
    fetcher,
    { refreshInterval: 30000 },
  );

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  if (error) return <p className='font-sans text-sm text-mut'>Unable to load lots.</p>;

  return (
    <div className='max-w-7xl mx-auto px-6 py-12'>
      {/* Sort controls */}
      <div className='flex items-center justify-between mb-6'>
        <p className='font-sans text-sm text-mut'>
          {data?.total != null ? format.number(data.total) : '—'} lots
        </p>
        <div className='flex gap-2'>
          {(
            [
              ['lotNumber', 'Lot Number'],
              ['endAt', 'Ending Soonest'],
              ['price', 'Price'],
            ] as [Sort, string][]
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => {
                setSort(val);
                setPage(1);
              }}
              className={`font-sans text-xs px-3 py-1.5 border transition-colors ${
                sort === val
                  ? 'bg-ink text-paper border-ink'
                  : 'border-[var(--line)] text-mut hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lot grid */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-8'>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex items-center justify-center gap-2'>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className='font-sans text-sm px-4 py-2 border border-[var(--line)] text-mut hover:text-ink disabled:opacity-40'
          >
            ← Prev
          </button>
          <span className='font-sans text-sm text-mut px-4'>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className='font-sans text-sm px-4 py-2 border border-[var(--line)] text-mut hover:text-ink disabled:opacity-40'
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
