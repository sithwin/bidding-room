import { categoryListResponseSchema } from '@carat-room/shared-types';
import { adminApi } from '@/lib/admin-api';
import { categoryOptions } from '@/lib/categories';
import { NewLotForm } from './_new-lot-form';

export default async function NewLotPage() {
  const res = await adminApi.get<unknown>('/admin/api/categories');
  const categories = categoryOptions(categoryListResponseSchema.parse(res).data);

  return (
    <div className='max-w-lg space-y-4'>
      <h1 className='text-2xl font-semibold'>New Lot</h1>
      <NewLotForm categories={categories} />
    </div>
  );
}
