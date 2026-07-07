'use client';

import { DataTable } from '@/components/data-table';
import type { ColumnDef } from '@tanstack/react-table';

export interface Bid {
  id: string;
  userId: string;
  amount: number;
  placedAt: string;
}

const columns: ColumnDef<Bid>[] = [
  { accessorKey: 'userId', header: 'User ID' },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => `£${row.original.amount.toLocaleString()}`,
  },
  {
    accessorKey: 'placedAt',
    header: 'Placed At',
    cell: ({ row }) => new Date(row.original.placedAt).toLocaleString(),
  },
];

export function BidsTable({ data }: { data: Bid[] }) {
  return <DataTable columns={columns} data={data} />;
}
