import { adminApi } from '@/lib/admin-api';
import { AuctionLiveStats } from '@/components/auction-live-stats';
import { DataTable } from '@/components/data-table';
import type { ColumnDef } from '@tanstack/react-table';

interface Bid {
  id: string;
  userId: string;
  amount: number;
  placedAt: string;
}

interface AuctionDetail {
  lotId: string;
  lotTitle: string;
  status: string;
  currentBid: number | null;
  bidCount: number;
  endAt: string;
  bids: Bid[];
  autoExtendWindowMinutes: number;
  autoExtendDurationMinutes: number;
}

const bidColumns: ColumnDef<Bid>[] = [
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

export default async function AuctionDetailPage({ params }: { params: { lotId: string } }) {
  const res = await adminApi.get<{ data: AuctionDetail }>(`/admin/api/auctions/${params.lotId}`);
  const auction = res.data;

  return (
    <div className='space-y-6'>
      <h1 className='text-2xl font-semibold'>{auction.lotTitle}</h1>
      <AuctionLiveStats lotId={params.lotId} />
      <section className='space-y-2'>
        <h2 className='text-lg font-medium'>Bid History</h2>
        <DataTable columns={bidColumns} data={auction.bids} />
      </section>
    </div>
  );
}
