import { adminApi } from '@/lib/admin-api';
import { ScheduleAuctionForm } from './_schedule-form';

interface Lot {
  id: string;
  title: string;
  status: string;
}

export default async function NewAuctionPage({ searchParams }: { searchParams: Promise<{ lotId?: string }> }) {
  const { lotId } = await searchParams;
  const res = await adminApi.get<{ data: Lot[] }>('/admin/api/lots');
  const lots = (Array.isArray(res.data) ? res.data : [])
    .filter(lot => lot.status !== 'INACTIVE')
    .map(lot => ({ id: lot.id, title: lot.title }));

  return (
    <div className='max-w-lg space-y-4'>
      <h1 className='text-2xl font-semibold'>Schedule Auction</h1>
      <ScheduleAuctionForm lots={lots} preselectedLotId={lotId} />
    </div>
  );
}
