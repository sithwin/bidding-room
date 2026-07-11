'use client';

import Link from 'next/link';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { cancelAuction } from './_actions';
import type { ColumnDef } from '@tanstack/react-table';

export interface AuctionSummary {
  lotId: string;
  lotTitle: string | null;
  status: string;
  currentBid: number | null;
  endAt: string;
}

const columns: ColumnDef<AuctionSummary>[] = [
  {
    accessorKey: 'lotTitle',
    header: 'Lot',
    cell: ({ row }) => row.original.lotTitle ?? '—',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'currentBid',
    header: 'Current Bid',
    cell: ({ row }) => row.original.currentBid != null ? `£${row.original.currentBid.toLocaleString()}` : '—',
  },
  {
    accessorKey: 'endAt',
    header: 'Ends',
    cell: ({ row }) => new Date(row.original.endAt).toLocaleString(),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <div className='flex gap-2'>
        <Button variant='outline' size='sm' asChild>
          <Link href={`/admin/auctions/${row.original.lotId}`}>View</Link>
        </Button>
        <ConfirmDialog
          trigger={<Button variant='destructive' size='sm'>Cancel</Button>}
          title='Cancel auction?'
          description='This will end the auction immediately. All bids will be void.'
          onConfirm={async () => { await cancelAuction(row.original.lotId); }}
          confirmLabel='Cancel Auction'
        />
      </div>
    ),
  },
];

export function AuctionsTable({ data }: { data: AuctionSummary[] }) {
  return <DataTable columns={columns} data={data} />;
}
