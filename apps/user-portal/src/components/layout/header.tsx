'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { MobileNavDrawer } from './mobile-nav-drawer';

export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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
    <>
      <header className='bg-paper border-b border-[var(--line)] px-6 py-4'>
        <div className='max-w-7xl mx-auto flex items-center gap-6'>
          <Link href='/' className='font-serif text-xl font-semibold tracking-wide text-ink shrink-0'>
            The Carat Room
          </Link>

          {/* Search bar — hidden on mobile */}
          <div className='hidden md:block flex-1 max-w-sm'>
            <input
              type='search'
              defaultValue={searchParams.get('q') ?? ''}
              onChange={handleSearch}
              placeholder='Search lots…'
              className='w-full border border-[var(--line)] bg-cream px-3 py-1.5 font-sans text-sm text-ink placeholder-mut focus:outline-none focus:border-ink'
            />
          </div>

          {/* Desktop nav */}
          <nav className='hidden md:flex items-center gap-6 font-sans text-sm font-medium text-mut'>
            <Link href='/auctions' className='hover:text-ink transition-colors'>Auctions</Link>
            <Link href='/calendar' className='hover:text-ink transition-colors'>Calendar</Link>
            <Link href='/sell' className='hover:text-ink transition-colors'>Sell</Link>
            <Link href='/account/watchlist' className='hover:text-ink transition-colors'>Watchlist</Link>
          </nav>

          <div className='flex items-center gap-3 ml-auto'>
            {/* Desktop: avatar / sign in */}
            <div className='hidden md:flex items-center gap-3'>
              {user ? (
                <>
                  <Link href='/account/dashboard'>
                    <div className='w-8 h-8 rounded-full bg-ink text-paper flex items-center justify-center font-sans text-xs font-semibold'>
                      {user.email[0].toUpperCase()}
                    </div>
                  </Link>
                  <button onClick={logout} className='font-sans text-xs text-mut hover:text-ink'>Sign out</button>
                </>
              ) : (
                <Link href='/account/login' className='font-sans text-sm font-medium text-ink border border-[var(--line)] px-4 py-2 hover:bg-cream transition-colors'>
                  Sign In
                </Link>
              )}
            </div>

            {/* Mobile: hamburger */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className='md:hidden flex flex-col gap-1.5 p-2'
              aria-label='Open menu'
            >
              <span className='block w-5 h-0.5 bg-ink' />
              <span className='block w-5 h-0.5 bg-ink' />
              <span className='block w-5 h-0.5 bg-ink' />
            </button>
          </div>
        </div>
      </header>

      <MobileNavDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}
