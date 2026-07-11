'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { CreateUserSchema, UpdateUserSchema } from '@/lib/schemas/user.schema';

type ActionState = { ok?: boolean; errors?: Record<string, string[] | undefined>; [key: string]: unknown };

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role'),
    country: formData.get('country') ?? undefined,
  };

  const parsed = CreateUserSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors };

  try {
    const res = await adminApi.post<{ data: { id: string } }>('/admin/api/users', parsed.data);
    revalidatePath('/admin/users');
    return { ok: true, id: res.data.id };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}

export async function updateUser(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    email: formData.get('email'),
    country: formData.get('country') ?? undefined,
  };

  const parsed = UpdateUserSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await adminApi.patch(`/admin/api/users/${id}`, parsed.data);
    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.body };
    return { ok: false, error: { code: 'UNKNOWN' } };
  }
}
