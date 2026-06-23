'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Gem,
  Gavel,
  Users,
  FileText,
  Package,
  Tag,
  BarChart3,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/lots', label: 'Lots', icon: Gem },
  { href: '/admin/categories', label: 'Categories', icon: Tag },
  { href: '/admin/auctions', label: 'Auctions', icon: Gavel },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/invoices', label: 'Invoices', icon: FileText },
  { href: '/admin/fulfilments', label: 'Fulfilments', icon: Package },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className='flex h-full w-56 flex-col border-r bg-card px-3 py-4'>
      <p className='mb-6 px-2 text-sm font-semibold tracking-tight'>Carat Room Admin</p>
      <ul className='space-y-1'>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors',
                pathname.startsWith(href)
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className='h-4 w-4' />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
