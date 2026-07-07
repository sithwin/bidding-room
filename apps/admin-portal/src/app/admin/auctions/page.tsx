import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { AuctionsTable, type AuctionSummary } from './_table';

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
      <AuctionsTable data={res.data} />
    </div>
  );
}
