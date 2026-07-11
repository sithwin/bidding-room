'use server';

import { revalidatePath } from 'next/cache';
import { adminApi } from '@/lib/admin-api';

export async function getUploadUrl(
  lotId: string,
  contentType: string,
): Promise<{ uploadUrl: string; imageKey: string }> {
  const res = await adminApi.post<{ data: { uploadUrl: string; imageKey: string } }>(
    `/admin/api/lots/${lotId}/images/upload-url`,
    { contentType },
  );
  return res.data;
}

export interface ConfirmedImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  displayOrder: number;
  isPrimary: boolean;
}

export async function confirmImage(
  lotId: string,
  imageKey: string,
  isPrimary: boolean,
): Promise<ConfirmedImage> {
  const res = await adminApi.post<{ data: ConfirmedImage }>(
    `/admin/api/lots/${lotId}/images/confirm`,
    { imageKey, isPrimary },
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
