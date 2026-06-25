'use client';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { useAuth } from '@/lib/auth-context';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>Profile & Paddle</h1>
        <div className='max-w-sm space-y-4'>
          <div>
            <p className='font-sans text-xs text-mut uppercase tracking-wider mb-1'>Email</p>
            <p className='font-sans text-sm text-ink'>{user?.email}</p>
          </div>
          <div>
            <p className='font-sans text-xs text-mut uppercase tracking-wider mb-1'>Bidder Status</p>
            <p className='font-sans text-sm text-ink capitalize'>{user?.verificationStatus?.toLowerCase().replace('_', ' ')}</p>
          </div>
        </div>
      </AccountShell>
    </>
  );
}
