'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { MarkDispatchedSchema } from '@/lib/schemas/fulfilment.schema';

export async function markDispatched(id: string, trackingNumber: string, carrier: string): Promise<{ ok: boolean; error?: unknown }> {
  const parsed = MarkDispatchedSchema.safeParse({ trackingNumber, carrier });
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/fulfilments/${id}/dispatch`, { trackingNumber, carrier });
    revalidatePath(`/admin/fulfilments/${id}`);
    revalidatePath('/admin/fulfilments');
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function markCollected(id: string): Promise<void> {
  await adminApi.patch(`/admin/api/fulfilments/${id}/collect`, {});
  revalidatePath(`/admin/fulfilments/${id}`);
  revalidatePath('/admin/fulfilments');
}
