import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { cancelAuction } from './_actions';
import type { ColumnDef } from '@tanstack/react-table';

interface AuctionSummary {
  lotId: string;
  lotTitle: string;
  status: string;
  currentBid: number | null;
  endAt: string;
}

const columns: ColumnDef<AuctionSummary>[] = [
  { accessorKey: 'lotTitle', header: 'Lot' },
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
          onConfirm={async () => { 'use server'; await cancelAuction(row.original.lotId); }}
          confirmLabel='Cancel Auction'
        />
      </div>
    ),
  },
];

export default async function AuctionsPage() {
  const res = await adminApi.get<{ data: AuctionSummary[] }>('/admin/api/auctions');

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Auctions</h1>
        <Button asChild>
          <Link href='/admin/auctions/new'>Schedule Auction</Link>
        </Button>
      </div>
      <DataTable columns={columns} data={res.data} />
    </div>
  );
}
