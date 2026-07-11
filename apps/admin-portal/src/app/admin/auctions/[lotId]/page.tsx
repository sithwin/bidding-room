import { adminApi } from '@/lib/admin-api';
import { AuctionLiveStats } from '@/components/auction-live-stats';
import { BidsTable, type Bid } from './_bids-table';

interface AuctionDetail {
  lotId: string;
  lotTitle: string | null;
  status: string;
  currentBid: number | null;
  bidCount: number;
  endAt: string;
  bids: Bid[];
}

export default async function AuctionDetailPage({ params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  const res = await adminApi.get<{ data: AuctionDetail }>(`/admin/api/auctions/${lotId}`);
  const auction = res.data;

  return (
    <div className='space-y-6'>
      <h1 className='text-2xl font-semibold'>{auction.lotTitle ?? auction.lotId}</h1>
      <AuctionLiveStats lotId={lotId} />
      <section className='space-y-2'>
        <h2 className='text-lg font-medium'>Bid History</h2>
        <BidsTable data={auction.bids} />
      </section>
    </div>
  );
}
