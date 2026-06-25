'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const NAV = [
  { href: '/auctions',          label: 'Auctions' },
  { href: '/calendar',          label: 'Calendar' },
  { href: '/sell',              label: 'Sell' },
  { href: '/account/watchlist', label: 'Watchlist' },
];

export function MobileNavDrawer({ isOpen, onClose }: Props) {
  const { user, logout } = useAuth();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className='fixed inset-0 bg-ink/40 z-40' onClick={onClose} />

      {/* Drawer */}
      <div className='fixed top-0 right-0 h-full w-72 bg-paper z-50 shadow-xl flex flex-col'>
        <div className='flex items-center justify-between px-6 py-5 border-b border-[var(--line)]'>
          <p className='font-serif text-base font-semibold text-ink'>Menu</p>
          <button onClick={onClose} className='font-sans text-2xl text-mut hover:text-ink leading-none'>×</button>
        </div>

        <nav className='flex-1 px-6 py-6 flex flex-col gap-4'>
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} onClick={onClose}
              className='font-sans text-base font-medium text-ink hover:text-mut'>
              {label}
            </Link>
          ))}
        </nav>

        <div className='px-6 py-6 border-t border-[var(--line)]'>
          {user ? (
            <div className='space-y-3'>
              <Link href='/account/dashboard' onClick={onClose}
                className='block font-sans text-sm font-medium text-ink'>My Account</Link>
              <button onClick={() => { logout(); onClose(); }}
                className='font-sans text-sm text-mut hover:text-ink'>Sign out</button>
            </div>
          ) : (
            <Link href='/account/login' onClick={onClose}
              className='block w-full text-center bg-ink text-paper font-sans text-sm font-medium py-3'>
              Sign In
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
