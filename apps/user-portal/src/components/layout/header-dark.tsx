import Link from 'next/link';

export function HeaderDark() {
  return (
    <header className='bg-ink border-b border-[var(--line)] px-6 py-4'>
      <div className='max-w-7xl mx-auto flex items-center justify-between'>
        <Link
          href='/'
          className='font-serif text-xl font-semibold tracking-wide text-paper'
        >
          The Carat Room
        </Link>
        <nav className='hidden md:flex items-center gap-8 font-sans text-sm font-medium text-[var(--mut)]'>
          <Link href='/auctions' className='hover:text-paper transition-colors'>
            Auctions
          </Link>
          <Link href='/calendar' className='hover:text-paper transition-colors'>
            Calendar
          </Link>
        </nav>
      </div>
    </header>
  );
}
