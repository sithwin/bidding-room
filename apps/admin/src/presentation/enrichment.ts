import { ServiceClient } from '../infrastructure/service-client';

// Lists stay usable even when a sibling service is down, so lookups fail soft to null

export async function fetchLotTitle(
  catalogue: ServiceClient,
  lotId: string,
  token: string,
): Promise<string | null> {
  try {
    const res = await catalogue.get<{ data: { title?: string } }>(`/api/lots/${lotId}`, token);
    return res.data?.title ?? null;
  } catch {
    return null;
  }
}

export async function fetchUserEmail(
  user: ServiceClient,
  userId: string,
  token: string,
): Promise<string | null> {
  try {
    const res = await user.get<{ email?: string }>(`/api/users/${userId}/email`, token);
    return res.email ?? null;
  } catch {
    return null;
  }
}
