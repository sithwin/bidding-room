import { adminApi } from '@/lib/admin-api';
import { CategoryTree } from '@/components/category-tree';

interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  children: Category[];
}

export default async function CategoriesPage() {
  const res = await adminApi.get<{ data: Category[] }>('/admin/api/categories');

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Categories</h1>
      <CategoryTree categories={res.data} />
    </div>
  );
}
