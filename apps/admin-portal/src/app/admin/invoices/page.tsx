import { adminApi } from '@/lib/admin-api';
import { InvoicesTable, type InvoiceSummary } from './_table';

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const query = status ? `?status=${status}` : '';
  const res = await adminApi.get<{ data: InvoiceSummary[] }>(`/admin/api/invoices${query}`);

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Invoices</h1>
      <InvoicesTable data={res.data} />
    </div>
  );
}
