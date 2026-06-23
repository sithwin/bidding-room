import type { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Breadcrumbs } from './breadcrumbs';

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className='flex h-screen overflow-hidden'>
      <Sidebar />
      <div className='flex flex-1 flex-col overflow-auto'>
        <header className='border-b px-6 py-3'>
          <Breadcrumbs />
        </header>
        <main className='flex-1 p-6'>{children}</main>
      </div>
    </div>
  );
}
