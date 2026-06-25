import { notFound } from 'next/navigation';
import { LotDetailClient } from './lot-detail-client';

const CATALOGUE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';

type Lot = {
  id: string; auctionId: string; lotNumber: string; title: string;
  department: string; medium: string; dimensions: string; catalogueNumber: string;
  imageUrls: string[]; currentBid: number; bidCount: number; currency: string;
  endAt: string; estimate: string; provenance: string; status: string;
};

export default async function LotDetailPage({ params }: { params: { auctionId: string; lotId: string } }) {
  const res = await fetch(`${CATALOGUE_URL}/api/lots/${params.lotId}`, { cache: 'no-store' });
  if (!res.ok) notFound();
  const lot = await res.json() as Lot;

  return <LotDetailClient lot={lot} />;
}
