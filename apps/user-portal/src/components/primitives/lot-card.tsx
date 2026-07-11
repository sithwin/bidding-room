import Link from 'next/link';
import Image from 'next/image';
import { CountdownTimer } from './countdown-timer';
import { DISPLAY_CURRENCY } from '@/lib/service-config';

export interface LotCardProps {
  lotId: string;
  auctionId: string;
  title: string;
  lotNumber?: string;
  imageUrl?: string;
  currentBid?: number;
  estimate?: number;
  currency?: string;
  endAt?: string;
}

export function LotCard({ lotId, auctionId, lotNumber, title, imageUrl, currentBid, estimate, currency, endAt }: LotCardProps) {
  const href = `/auctions/${auctionId}/lots/${lotId}`;
  const priceLabel = currentBid != null ? 'Current bid' : estimate != null ? 'Estimate' : null;
  const priceAmount = currentBid ?? estimate;
  return (
    <Link href={href} className='group block bg-paper border border-[var(--line)] overflow-hidden hover:shadow-md transition-shadow'>
      <div className='relative overflow-hidden aspect-square'>
        {imageUrl ? (
          <Image src={imageUrl} alt={title} fill className='object-cover group-hover:scale-105 transition-transform duration-300' />
        ) : (
          <div className='absolute inset-0 bg-cream' aria-hidden='true' />
        )}
      </div>
      <div className='p-4'>
        {lotNumber && <p className='font-sans text-xs text-mut mb-1'>Lot {lotNumber}</p>}
        <p className='font-serif text-sm font-medium text-ink leading-snug line-clamp-2 mb-3'>{title}</p>
        <div className='flex items-center justify-between'>
          {priceLabel && priceAmount != null && (
            <div>
              <p className='font-sans text-[10px] text-mut uppercase tracking-wider'>{priceLabel}</p>
              <p className='font-sans text-sm font-semibold text-ink'>{(currency ?? DISPLAY_CURRENCY).toUpperCase()} {priceAmount.toLocaleString()}</p>
            </div>
          )}
          {endAt && <CountdownTimer endAt={endAt} />}
        </div>
      </div>
    </Link>
  );
}
