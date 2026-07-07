import { adminApi } from '@/lib/admin-api';
import { AuctionLiveStats } from '@/components/auction-live-stats';
import { BidsTable, type Bid } from './_bids-table';

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

export default async function AuctionDetailPage({ params }: { params: { lotId: string } }) {
  const res = await adminApi.get<{ data: AuctionDetail }>(`/admin/api/auctions/${params.lotId}`);
  const auction = res.data;

  return (
    <div className='space-y-6'>
      <h1 className='text-2xl font-semibold'>{auction.lotTitle}</h1>
      <AuctionLiveStats lotId={params.lotId} />
      <section className='space-y-2'>
        <h2 className='text-lg font-medium'>Bid History</h2>
        <BidsTable data={auction.bids} />
      </section>
    </div>
  );
}
