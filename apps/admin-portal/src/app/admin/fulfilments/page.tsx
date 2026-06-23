import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import type { ColumnDef } from '@tanstack/react-table';

interface FulfilmentSummary {
  id: string;
  lotTitle: string;
  buyerEmail: string;
  method: string;
  status: string;
}

const columns: ColumnDef<FulfilmentSummary>[] = [
  { accessorKey: 'lotTitle', header: 'Lot' },
  { accessorKey: 'buyerEmail', header: 'Buyer' },
  { accessorKey: 'method', header: 'Method' },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Button variant='outline' size='sm' asChild>
        <Link href={`/admin/fulfilments/${row.original.id}`}>View</Link>
      </Button>
    ),
  },
];

export default async function FulfilmentsPage({ searchParams }: { searchParams: { status?: string } }) {
  const query = searchParams.status ? `?status=${searchParams.status}` : '';
  const res = await adminApi.get<{ data: FulfilmentSummary[] }>(`/admin/api/fulfilments${query}`);

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Fulfilments</h1>
      <DataTable columns={columns} data={res.data} />
    </div>
  );
}
