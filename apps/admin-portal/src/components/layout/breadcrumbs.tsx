'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  return (
    <nav className='flex items-center gap-1 text-sm text-muted-foreground'>
      {segments.map((seg, idx) => {
        const href = '/' + segments.slice(0, idx + 1).join('/');
        const label = seg.charAt(0).toUpperCase() + seg.slice(1);
        const isLast = idx === segments.length - 1;

        return (
          <span key={href} className='flex items-center gap-1'>
            {idx > 0 && <ChevronRight className='h-3 w-3' />}
            {isLast ? (
              <span className='font-medium text-foreground'>{label}</span>
            ) : (
              <Link href={href} className='hover:text-foreground'>
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
