'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';

function HeaderDarkSearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = e.target.value;
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) params.set('q', q); else params.delete('q');
      router.push(`/auctions?${params.toString()}`);
    }, 300);
  }, [router, searchParams]);

  return (
    <input
      type='search'
      defaultValue={searchParams.get('q') ?? ''}
      onChange={handleSearch}
      placeholder='Search lots…'
      className='w-full border border-white/20 bg-white/10 px-3 py-1.5 font-sans text-sm text-paper placeholder-white/40 focus:outline-none focus:border-white/60'
    />
  );
}

export function HeaderDark() {
  const { user, logout } = useAuth();

  return (
    <header className='bg-ink border-b border-white/10 px-6 py-4'>
      <div className='max-w-7xl mx-auto flex items-center gap-6'>
        <Link href='/' className='font-serif text-xl font-semibold tracking-wide text-paper shrink-0'>
          The Carat Room
        </Link>
        <div className='flex-1 max-w-sm'>
          <Suspense fallback={<input type='search' placeholder='Search lots…' disabled className='w-full border border-white/20 bg-white/10 px-3 py-1.5 font-sans text-sm text-paper placeholder-white/40' />}>
            <HeaderDarkSearchInput />
          </Suspense>
        </div>
        <nav className='hidden md:flex items-center gap-6 font-sans text-sm font-medium text-white/60'>
          <Link href='/auctions' className='hover:text-paper transition-colors'>Auctions</Link>
          <Link href='/account/watchlist' className='hover:text-paper transition-colors'>Watchlist</Link>
        </nav>
        <div className='shrink-0'>
          {user ? (
            <div className='flex items-center gap-3'>
              <Link href='/account/dashboard'>
                <div className='w-8 h-8 rounded-full bg-paper text-ink flex items-center justify-center font-sans text-xs font-semibold'>
                  {user.email[0].toUpperCase()}
                </div>
              </Link>
              <button onClick={logout} className='font-sans text-xs text-white/50 hover:text-paper'>Sign out</button>
            </div>
          ) : (
            <Link href='/account/login' className='font-sans text-sm font-medium text-paper border border-white/30 px-4 py-2 hover:bg-white/10 transition-colors'>
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
