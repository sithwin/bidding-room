import { adminApi } from '@/lib/admin-api';
import { FulfilmentsTable, type FulfilmentSummary } from './_table';

export default async function FulfilmentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const query = status ? `?status=${status}` : '';
  const res = await adminApi.get<{ data: FulfilmentSummary[] }>(`/admin/api/fulfilments${query}`);

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Fulfilments</h1>
      <FulfilmentsTable data={res.data} />
    </div>
  );
}
