'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { ScheduleAuctionSchema, RescheduleAuctionSchema } from '@/lib/schemas/auction.schema';

type ActionState = { ok?: boolean; errors?: Record<string, string[] | undefined>; [key: string]: unknown };

export async function scheduleAuction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    lotId: formData.get('lotId'),
    startAt: formData.get('startAt'),
    endAt: formData.get('endAt'),
    reservePrice: Number(formData.get('reservePrice')),
    minBidIncrement: Number(formData.get('minBidIncrement')),
    autoExtendWindowMinutes: Number(formData.get('autoExtendWindowMinutes')),
    autoExtendDurationMinutes: Number(formData.get('autoExtendDurationMinutes')),
  };

  const parsed = ScheduleAuctionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors };

  try {
    const res = await adminApi.post<{ data: { lotId: string } }>('/admin/api/auctions', parsed.data);
    revalidatePath('/admin/auctions');
    return { ok: true, lotId: res.data.lotId };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function rescheduleAuction(lotId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    startAt: formData.get('startAt'),
    endAt: formData.get('endAt'),
  };

  const parsed = RescheduleAuctionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/auctions/${lotId}/reschedule`, parsed.data);
    revalidatePath('/admin/auctions');
    revalidatePath(`/admin/auctions/${lotId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function cancelAuction(lotId: string): Promise<void> {
  await adminApi.delete(`/admin/api/auctions/${lotId}`);
  revalidatePath('/admin/auctions');
}
