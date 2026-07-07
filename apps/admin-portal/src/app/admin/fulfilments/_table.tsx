'use client';

import Link from 'next/link';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import type { ColumnDef } from '@tanstack/react-table';

export interface FulfilmentSummary {
  id: string;
  lotTitle: string | null;
  buyerEmail: string | null;
  method: string | null;
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

export function FulfilmentsTable({ data }: { data: FulfilmentSummary[] }) {
  return <DataTable columns={columns} data={data} />;
}
