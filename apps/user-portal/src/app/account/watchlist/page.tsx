'use client';
import useSWR from 'swr';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { LotCard, LotCardProps } from '@/components/primitives/lot-card';
import { useAuth } from '@/lib/auth-context';

export default function WatchlistPage() {
  const { accessToken } = useAuth();
  const { data, mutate } = useSWR<{ lots: LotCardProps[] }>(
    accessToken ? '/api/account/watchlist' : null,
    (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
    { refreshInterval: 5000 },
  );

  async function removeFromWatchlist(lotId: string) {
    mutate(prev => prev ? { lots: prev.lots.filter(l => l.lotId !== lotId) } : prev, false);
    await fetch(`/api/lots/${lotId}/watchlist`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
    mutate();
  }

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>Watchlist</h1>
        {!data?.lots.length ? (
          <p className='font-sans text-sm text-mut'>Your watchlist is empty.</p>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            {data.lots.map(lot => (
              <div key={lot.lotId} className='relative group'>
                <LotCard {...lot} />
                <button onClick={() => removeFromWatchlist(lot.lotId)}
                  className='absolute top-2 right-2 bg-ink text-paper w-7 h-7 rounded-full flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-opacity'>
                  ♡
                </button>
              </div>
            ))}
          </div>
        )}
      </AccountShell>
    </>
  );
}
