import { adminApi } from '@/lib/admin-api';
import { UsersTable, type UserSummary } from './_table';

export default async function UsersPage({ searchParams }: { searchParams: { status?: string; search?: string } }) {
  const query = new URLSearchParams();
  if (searchParams.status) query.set('status', searchParams.status);
  if (searchParams.search) query.set('search', searchParams.search);

  const res = await adminApi.get<{ data: UserSummary[] }>(`/admin/api/users?${query.toString()}`);

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Users</h1>
      <UsersTable data={res.data} />
    </div>
  );
}
