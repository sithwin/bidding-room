import { categoryListResponseSchema } from '@carat-room/shared-types';
import { adminApi } from '@/lib/admin-api';
import { categoryOptions } from '@/lib/categories';
import { ImageUploader } from '@/components/image-uploader';
import { EditLotForm } from './_edit-form';

interface LotImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  displayOrder: number;
  isPrimary: boolean;
}

interface Lot {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  condition: string;
  estimatedValue: number;
  status: string;
  auctionStatus: string | null;
  images: LotImage[];
}

export default async function EditLotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lotRes, categoriesRes] = await Promise.all([
    adminApi.get<{ data: Lot }>(`/admin/api/lots/${id}`),
    adminApi.get<unknown>('/admin/api/categories'),
  ]);
  const lot = lotRes.data;
  const categories = categoryOptions(categoryListResponseSchema.parse(categoriesRes).data);

  return (
    <div className='max-w-lg space-y-8'>
      <h1 className='text-2xl font-semibold'>Edit Lot</h1>
      <EditLotForm lot={lot} categories={categories} />
      <section className='space-y-2'>
        <h2 className='text-lg font-medium'>Images</h2>
        <ImageUploader lotId={lot.id} initialImages={lot.images} />
      </section>
    </div>
  );
}
