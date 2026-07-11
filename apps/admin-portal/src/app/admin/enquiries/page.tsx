import { adminApi } from '@/lib/admin-api';
import { EnquiriesTable, type EnquiryDto } from './_table';

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const query = status ? `?status=${status}` : '';
  const res = await adminApi.get<{ data: EnquiryDto[] }>(`/admin/api/enquiries${query}`);

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Valuation Enquiries</h1>
      <EnquiriesTable data={res.data} />
    </div>
  );
}
