import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { LotsTable, type Lot } from './_table';

export default async function LotsPage() {
  const res = await adminApi.get<{ data: Lot[] }>('/admin/api/lots');

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Lots</h1>
        <Button asChild>
          <Link href='/admin/lots/new'>New Lot</Link>
        </Button>
      </div>
      <LotsTable data={res.data} />
    </div>
  );
}
