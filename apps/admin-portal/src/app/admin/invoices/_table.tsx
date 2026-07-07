'use client';

import Link from 'next/link';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import type { ColumnDef } from '@tanstack/react-table';

export interface InvoiceSummary {
  id: string;
  lotTitle: string | null;
  winnerEmail: string | null;
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

export function InvoicesTable({ data }: { data: InvoiceSummary[] }) {
  return <DataTable columns={columns} data={data} />;
}
