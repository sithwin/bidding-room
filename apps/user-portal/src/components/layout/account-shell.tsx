'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';

const NAV = [
  { href: '/account/dashboard', label: 'Overview' },
  { href: '/account/bids',      label: 'My Bids' },
  { href: '/account/watchlist', label: 'Watchlist' },
  { href: '/account/won',       label: 'Won Lots' },
  { href: '/account/invoices',  label: 'Invoices & Payments' },
  { href: '/account/profile',   label: 'Profile & Paddle' },
];

export function AccountShell({ children, collectorSince }: { children: ReactNode; collectorSince?: string }) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className='max-w-7xl mx-auto px-6 py-10 flex gap-10'>
      <aside className='w-56 shrink-0'>
        {/* Avatar + name */}
        <div className='mb-6 pb-6 border-b border-[var(--line)]'>
          <div className='w-12 h-12 rounded-full bg-ink text-paper flex items-center justify-center font-sans text-lg font-semibold mb-3'>
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <p className='font-sans text-sm font-medium text-ink truncate'>{user?.email ?? ''}</p>
          {collectorSince && (
            <p className='font-sans text-xs text-mut mt-0.5'>Collector since {collectorSince}</p>
          )}
        </div>

        <nav className='flex flex-col gap-1'>
          {NAV.map(({ href, label }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`font-sans text-sm px-4 py-2 rounded transition-colors ${isActive ? 'bg-ink text-paper font-medium' : 'text-mut hover:text-ink'}`}>
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className='flex-1 min-w-0'>{children}</main>
    </div>
  );
}
