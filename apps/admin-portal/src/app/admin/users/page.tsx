import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { UsersTable, type UserSummary } from './_table';

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ status?: string; search?: string }> }) {
  const { status, search } = await searchParams;
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (search) query.set('search', search);

  const res = await adminApi.get<{ data: UserSummary[] }>(`/admin/api/users?${query.toString()}`);

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Users</h1>
        <Button asChild>
          <Link href='/admin/users/new'>New User</Link>
        </Button>
      </div>
      <UsersTable data={res.data} />
    </div>
  );
}
