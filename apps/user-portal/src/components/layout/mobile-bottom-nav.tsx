'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/',                  label: 'Home',   icon: '⌂' },
  { href: '/auctions',          label: 'Browse', icon: '⊞' },
  { href: '/account/watchlist', label: 'Watch',  icon: '♡' },
  { href: '/account/bids',      label: 'Bids',   icon: '↑' },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className='md:hidden fixed bottom-0 left-0 right-0 bg-paper border-t border-[var(--line)] flex z-40'>
      {NAV.map(({ href, label, icon }) => {
        const isActive = pathname !== null && (pathname === href || (href !== '/' && pathname.startsWith(href)));
        return (
          <Link key={href} href={href}
            className={`flex-1 flex flex-col items-center py-3 gap-1 font-sans text-[10px] ${isActive ? 'text-ink font-semibold' : 'text-mut'}`}>
            <span className='text-base leading-none'>{icon}</span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
