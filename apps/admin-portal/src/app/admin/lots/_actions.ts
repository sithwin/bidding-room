'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { LotFormSchema } from '@/lib/schemas/lot.schema';

type ActionState = { ok?: boolean; errors?: Record<string, string[] | undefined>; [key: string]: unknown };

export async function createLot(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    title: formData.get('title'),
    description: formData.get('description'),
    categoryId: formData.get('categoryId'),
    condition: formData.get('condition'),
    estimatedValue: Number(formData.get('estimatedValue')),
  };

  const parsed = LotFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors };

  try {
    const res = await adminApi.post<{ data: { id: string } }>('/admin/api/lots', parsed.data);
    revalidatePath('/admin/lots');
    return { ok: true, id: res.data.id };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function updateLot(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    title: formData.get('title'),
    description: formData.get('description'),
    categoryId: formData.get('categoryId'),
    condition: formData.get('condition'),
    estimatedValue: Number(formData.get('estimatedValue')),
  };

  const parsed = LotFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/lots/${id}`, parsed.data);
    revalidatePath('/admin/lots');
    revalidatePath(`/admin/lots/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function deleteLot(id: string): Promise<void> {
  await adminApi.delete(`/admin/api/lots/${id}`);
  revalidatePath('/admin/lots');
}
