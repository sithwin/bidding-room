'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { SuspendUserSchema } from '@/lib/schemas/user.schema';

export async function suspendUser(id: string, reason: string): Promise<{ ok: boolean; error?: unknown }> {
  const parsed = SuspendUserSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/users/${id}/suspend`, { reason });
    revalidatePath(`/admin/users/${id}`);
    revalidatePath('/admin/users');
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function reinstateUser(id: string): Promise<void> {
  await adminApi.patch(`/admin/api/users/${id}/reinstate`, {});
  revalidatePath(`/admin/users/${id}`);
  revalidatePath('/admin/users');
}

export async function manuallyApproveUser(id: string): Promise<void> {
  await adminApi.patch(`/admin/api/users/${id}/approve`, {});
  revalidatePath(`/admin/users/${id}`);
  revalidatePath('/admin/users');
}
