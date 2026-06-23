import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import type { ColumnDef } from '@tanstack/react-table';

interface UserSummary {
  id: string;
  email: string;
  status: string;
  country: string;
  registeredAt: string;
  bidCount: number;
}

const columns: ColumnDef<UserSummary>[] = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { accessorKey: 'country', header: 'Country' },
  { accessorKey: 'bidCount', header: 'Bids' },
  { accessorKey: 'registeredAt', header: 'Registered', cell: ({ row }) => new Date(row.original.registeredAt).toLocaleDateString() },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Button variant='outline' size='sm' asChild>
        <Link href={`/admin/users/${row.original.id}`}>View</Link>
      </Button>
    ),
  },
];

export default async function UsersPage({ searchParams }: { searchParams: { status?: string; search?: string } }) {
  const query = new URLSearchParams();
  if (searchParams.status) query.set('status', searchParams.status);
  if (searchParams.search) query.set('search', searchParams.search);

  const res = await adminApi.get<{ data: UserSummary[] }>(`/admin/api/users?${query.toString()}`);

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Users</h1>
      <DataTable columns={columns} data={res.data} />
    </div>
  );
}
