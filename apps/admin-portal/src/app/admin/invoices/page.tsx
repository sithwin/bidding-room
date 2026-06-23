import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import type { ColumnDef } from '@tanstack/react-table';

interface InvoiceSummary {
  id: string;
  lotTitle: string;
  winnerEmail: string;
  amount: number;
  currency: string;
  status: string;
  dueAt: string;
}

const columns: ColumnDef<InvoiceSummary>[] = [
  { accessorKey: 'lotTitle', header: 'Lot' },
  { accessorKey: 'winnerEmail', header: 'Winner' },
  { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => `${row.original.currency} ${row.original.amount.toLocaleString()}` },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { accessorKey: 'dueAt', header: 'Due', cell: ({ row }) => new Date(row.original.dueAt).toLocaleDateString() },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Button variant='outline' size='sm' asChild>
        <Link href={`/admin/invoices/${row.original.id}`}>View</Link>
      </Button>
    ),
  },
];

export default async function InvoicesPage({ searchParams }: { searchParams: { status?: string } }) {
  const query = searchParams.status ? `?status=${searchParams.status}` : '';
  const res = await adminApi.get<{ data: InvoiceSummary[] }>(`/admin/api/invoices${query}`);

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Invoices</h1>
      <DataTable columns={columns} data={res.data} />
    </div>
  );
}
