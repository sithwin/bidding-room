'use client';

import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';

interface AuctionDetail {
  lotId: string;
  lotTitle: string;
  status: string;
  currentBid: number | null;
  bidCount: number;
  endAt: string;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function AuctionLiveStats({ lotId }: { lotId: string }) {
  const { data, error } = useSWR<{ data: AuctionDetail }>(
    `/api/admin/auctions/${lotId}`,
    fetcher,
    { refreshInterval: 5000 },
  );

  if (error) return <p className='text-sm text-destructive'>Failed to load live stats.</p>;
  if (!data) return <p className='text-sm text-muted-foreground'>Loading…</p>;

  const auction = data.data;
  const timeLeft = new Date(auction.endAt).getTime() - Date.now();
  const minutesLeft = Math.max(0, Math.floor(timeLeft / 60000));

  return (
    <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
      <Card>
        <CardHeader className='pb-1'>
          <CardTitle className='text-xs font-medium text-muted-foreground'>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusBadge status={auction.status} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className='pb-1'>
          <CardTitle className='text-xs font-medium text-muted-foreground'>Current Bid</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-2xl font-bold'>
            {auction.currentBid != null ? `£${auction.currentBid.toLocaleString()}` : 'No bids'}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className='pb-1'>
          <CardTitle className='text-xs font-medium text-muted-foreground'>Bids</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-2xl font-bold'>{auction.bidCount}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className='pb-1'>
          <CardTitle className='text-xs font-medium text-muted-foreground'>Time Remaining</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-2xl font-bold'>{minutesLeft}m</p>
        </CardContent>
      </Card>
    </div>
  );
}
