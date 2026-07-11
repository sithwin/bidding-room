import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi } from '@/lib/admin-api';
import { getUploadUrl, confirmImage, deleteImage, reorderImages } from './_actions';

beforeEach(() => { vi.clearAllMocks(); });

describe('getUploadUrl', () => {
  it('should_returnUploadUrlAndImageKey_when_called', async () => {
    vi.mocked(adminApi.post).mockResolvedValue({ data: { uploadUrl: 'https://r2.example.com/put', imageKey: 'lots/lot-1/a' } });

    const result = await getUploadUrl('lot-1', 'image/jpeg');

    expect(adminApi.post).toHaveBeenCalledWith('/admin/api/lots/lot-1/images/upload-url', { contentType: 'image/jpeg' });
    expect(result).toEqual({ uploadUrl: 'https://r2.example.com/put', imageKey: 'lots/lot-1/a' });
  });
});

describe('confirmImage', () => {
  it('should_callConfirmEndpointAndReturnCreatedImage', async () => {
    vi.mocked(adminApi.post).mockResolvedValue({
      data: { id: 'img-1', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: true },
    });

    const result = await confirmImage('lot-1', 'lots/lot-1/a', true);

    expect(adminApi.post).toHaveBeenCalledWith('/admin/api/lots/lot-1/images/confirm', { imageKey: 'lots/lot-1/a', isPrimary: true });
    expect(result).toEqual({ id: 'img-1', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: true });
  });
});

describe('deleteImage', () => {
  it('should_callAdminApiDelete_and_revalidate', async () => {
    vi.mocked(adminApi.delete).mockResolvedValue({ data: null });

    await deleteImage('lot-1', 'img-1');

    expect(adminApi.delete).toHaveBeenCalledWith('/admin/api/lots/lot-1/images/img-1');
  });
});

describe('reorderImages', () => {
  it('should_callAdminApiPatchWithOrderedIds', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: null });

    await reorderImages('lot-1', ['img-2', 'img-1']);

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/lots/lot-1/images/reorder', { imageIds: ['img-2', 'img-1'] });
  });
});
