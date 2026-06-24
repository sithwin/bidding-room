import Link from 'next/link';

export function Header() {
  return (
    <header className='bg-paper border-b border-[var(--line)] px-6 py-4'>
      <div className='max-w-7xl mx-auto flex items-center justify-between'>
        <Link
          href='/'
          className='font-serif text-xl font-semibold tracking-wide text-ink'
        >
          The Carat Room
        </Link>
        <nav className='hidden md:flex items-center gap-8 font-sans text-sm font-medium text-mut'>
          <Link href='/auctions' className='hover:text-ink transition-colors'>
            Auctions
          </Link>
          <Link href='/calendar' className='hover:text-ink transition-colors'>
            Calendar
          </Link>
          <Link href='/sell' className='hover:text-ink transition-colors'>
            Sell
          </Link>
        </nav>
        <div className='flex items-center gap-4'>
          <Link
            href='/account/login'
            className='font-sans text-sm font-medium text-ink border border-[var(--line)] px-4 py-2 hover:bg-cream transition-colors'
          >
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}
