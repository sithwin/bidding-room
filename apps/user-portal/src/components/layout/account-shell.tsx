'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

const NAV = [
  { href: '/account/dashboard', label: 'Overview' },
  { href: '/account/bids',      label: 'My Bids' },
  { href: '/account/watchlist', label: 'Watchlist' },
  { href: '/account/won',       label: 'Won Lots' },
  { href: '/account/invoices',  label: 'Invoices & Payments' },
];

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className='max-w-7xl mx-auto px-6 py-10 flex gap-10'>
      <aside className='w-56 shrink-0'>
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
