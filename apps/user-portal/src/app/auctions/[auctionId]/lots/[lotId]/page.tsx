import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { parseLot } from '@/lib/catalogue';
import { parseLotStatus } from '@/lib/auction';
import { AUCTION_ENGINE_URL, CATALOGUE_SERVICE_URL, forwardedForHeader } from '@/lib/service-config';
import { LotDetailClient } from './lot-detail-client';

export default async function LotDetailPage({ params }: { params: Promise<{ auctionId: string; lotId: string }> }) {
  const { lotId } = await params;
  const forwardedFor = forwardedForHeader(await headers());

  const lotRes = await fetch(`${CATALOGUE_SERVICE_URL}/api/lots/${lotId}`, {
    headers: forwardedFor,
    cache: 'no-store',
  });
  if (!lotRes.ok) notFound();
  const lot = parseLot(await lotRes.json());
  if (!lot) notFound();

  let liveStatus = null;
  try {
    const statusRes = await fetch(`${AUCTION_ENGINE_URL}/api/auctions/${lotId}`, {
      headers: forwardedFor,
      cache: 'no-store',
    });
    if (statusRes.ok) liveStatus = parseLotStatus(await statusRes.json());
  } catch {
    // Auction engine unreachable — page renders without live bidding.
  }

  return <LotDetailClient lot={lot} liveStatus={liveStatus} />;
}
