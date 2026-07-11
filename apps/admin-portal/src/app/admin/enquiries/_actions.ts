'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';

export async function updateEnquiryStatus(
  id: string,
  status: 'RESPONDED' | 'CLOSED',
): Promise<{ ok: boolean; error?: unknown }> {
  try {
    await adminApi.patch(`/admin/api/enquiries/${id}/status`, { status });
    revalidatePath('/admin/enquiries');
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}
