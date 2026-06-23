'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { ExtendDueDateSchema, CancelInvoiceSchema } from '@/lib/schemas/invoice.schema';

export async function extendDueDate(id: string, dueAt: string): Promise<{ ok: boolean; error?: unknown }> {
  const parsed = ExtendDueDateSchema.safeParse({ dueAt });
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/invoices/${id}/extend`, { dueAt });
    revalidatePath(`/admin/invoices/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function cancelInvoice(id: string, reason: string): Promise<{ ok: boolean; error?: unknown }> {
  const parsed = CancelInvoiceSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/invoices/${id}/cancel`, { reason });
    revalidatePath('/admin/invoices');
    revalidatePath(`/admin/invoices/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}
