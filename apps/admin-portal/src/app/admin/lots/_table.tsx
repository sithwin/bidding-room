'use client';

import Link from 'next/link';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import type { ColumnDef } from '@tanstack/react-table';

export interface Lot {
  id: string;
  title: string;
  categoryName: string | null;
  status: string;
  auctionStatus: string | null;
  createdAt: string;
}

const columns: ColumnDef<Lot>[] = [
  { accessorKey: 'title', header: 'Title' },
  {
    accessorKey: 'categoryName',
    header: 'Category',
    cell: ({ row }) => row.original.categoryName ?? '—',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'auctionStatus',
    header: 'Auction Status',
    cell: ({ row }) =>
      row.original.auctionStatus ? <StatusBadge status={row.original.auctionStatus} /> : '—',
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

export function LotsTable({ data }: { data: Lot[] }) {
  return <DataTable columns={columns} data={data} />;
}
