'use server';

import { revalidatePath } from 'next/cache';
import { adminApi } from '@/lib/admin-api';

export async function getUploadUrl(
  lotId: string,
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; imageId: string; publicUrl: string }> {
  const res = await adminApi.post<{ data: { uploadUrl: string; imageId: string; publicUrl: string } }>(
    `/admin/api/lots/${lotId}/images/upload-url`,
    { filename, contentType },
  );
  return res.data;
}

export async function deleteImage(lotId: string, imageId: string): Promise<void> {
  await adminApi.delete(`/admin/api/lots/${lotId}/images/${imageId}`);
  revalidatePath(`/admin/lots/${lotId}`);
}

export async function reorderImages(lotId: string, imageIds: string[]): Promise<void> {
  await adminApi.patch(`/admin/api/lots/${lotId}/images/reorder`, { imageIds });
  revalidatePath(`/admin/lots/${lotId}`);
}
