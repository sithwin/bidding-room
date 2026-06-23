'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { CategoryFormSchema } from '@/lib/schemas/category.schema';

export async function createCategory(data: { name: string; slug: string; parentId?: string }): Promise<{ ok: boolean; error?: unknown }> {
  const parsed = CategoryFormSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.post('/admin/api/categories', parsed.data);
    revalidatePath('/admin/categories');
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: (err.body as { error: unknown }).error };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await adminApi.patch(`/admin/api/categories/${id}`, { name });
  revalidatePath('/admin/categories');
}

export async function deleteCategory(id: string): Promise<{ ok: boolean; error?: unknown }> {
  try {
    await adminApi.delete(`/admin/api/categories/${id}`);
    revalidatePath('/admin/categories');
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: (err.body as { error: unknown }).error };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}
