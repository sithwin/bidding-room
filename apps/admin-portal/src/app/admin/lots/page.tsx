import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import type { ColumnDef } from '@tanstack/react-table';

interface Lot {
  id: string;
  title: string;
  categoryName: string;
  status: string;
  createdAt: string;
}

const columns: ColumnDef<Lot>[] = [
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'categoryName', header: 'Category' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <div className='flex gap-2'>
        <Button variant='outline' size='sm' asChild>
          <Link href={`/admin/lots/${row.original.id}`}>Edit</Link>
        </Button>
        <Button variant='outline' size='sm' asChild>
          <Link href={`/admin/auctions/new?lotId=${row.original.id}`}>Schedule Auction</Link>
        </Button>
      </div>
    ),
  },
];

export default async function LotsPage() {
  const res = await adminApi.get<{ data: Lot[] }>('/admin/api/lots');

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Lots</h1>
        <Button asChild>
          <Link href='/admin/lots/new'>New Lot</Link>
        </Button>
      </div>
      <DataTable columns={columns} data={res.data} />
    </div>
  );
}
