import { adminApi } from '@/lib/admin-api';
import { ImageUploader } from '@/components/image-uploader';
import { EditLotForm } from './_edit-form';

interface LotImage {
  id: string;
  publicUrl: string;
  isPrimary: boolean;
}

interface Lot {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  condition: string;
  estimatedValue: number;
  images: LotImage[];
}

export default async function EditLotPage({ params }: { params: { id: string } }) {
  const res = await adminApi.get<{ data: Lot }>(`/admin/api/lots/${params.id}`);
  const lot = res.data;

  return (
    <div className='max-w-lg space-y-8'>
      <h1 className='text-2xl font-semibold'>Edit Lot</h1>
      <EditLotForm lot={lot} />
      <section className='space-y-2'>
        <h2 className='text-lg font-medium'>Images</h2>
        <ImageUploader lotId={lot.id} initialImages={lot.images} />
      </section>
    </div>
  );
}
