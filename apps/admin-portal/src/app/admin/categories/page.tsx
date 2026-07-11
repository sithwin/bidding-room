import { categoryListResponseSchema } from '@carat-room/shared-types';
import { adminApi } from '@/lib/admin-api';
import { buildCategoryTree } from '@/lib/categories';
import { CategoryTree } from '@/components/category-tree';

export default async function CategoriesPage() {
  const res = await adminApi.get<unknown>('/admin/api/categories');
  const categories = buildCategoryTree(categoryListResponseSchema.parse(res).data);

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Categories</h1>
      <CategoryTree categories={categories} />
    </div>
  );
}
