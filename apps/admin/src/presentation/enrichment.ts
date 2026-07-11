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

export interface LotSummary {
  title: string | null;
  categoryId: string | null;
}

export async function fetchLotSummary(
  catalogue: ServiceClient,
  lotId: string,
  token: string,
): Promise<LotSummary> {
  try {
    const res = await catalogue.get<{ data: { title?: string; categoryId?: string } }>(`/api/lots/${lotId}`, token);
    return { title: res.data?.title ?? null, categoryId: res.data?.categoryId ?? null };
  } catch {
    return { title: null, categoryId: null };
  }
}

export async function fetchCategoryNameMap(
  catalogue: ServiceClient,
  token: string,
): Promise<Map<string, string>> {
  try {
    // /api/categories returns a FLAT list ({ id, name, slug, parentId, displayOrder })
    // — see categoryListResponseSchema in @carat-room/shared-types
    const res = await catalogue.get<{ data: Array<{ id: string; name: string }> }>('/api/categories', token);
    const categories = Array.isArray(res.data) ? res.data : [];
    return new Map(categories.map(category => [category.id, category.name]));
  } catch {
    return new Map();
  }
}

// Auction status is event-sourced and owned entirely by auction-engine — this is a read-only
// lookup, never written from admin-service. Lists stay usable even when auction-engine is down,
// so lookups fail soft to null.
export async function fetchLotAuctionStatus(
  auction: ServiceClient,
  lotId: string,
  token: string,
): Promise<string | null> {
  try {
    const res = await auction.get<{ data: { status?: string } }>(`/api/auctions/${lotId}`, token);
    return res.data?.status ?? null;
  } catch {
    return null;
  }
}
