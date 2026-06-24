import Link from 'next/link';
import Image from 'next/image';
import { CountdownTimer } from './countdown-timer';

export interface LotCardProps {
  lotId: string;
  auctionId: string;
  lotNumber: string;
  title: string;
  imageUrl: string;
  currentBid: number;
  currency: string;
  endAt: string;
}

export function LotCard({ lotId, auctionId, lotNumber, title, imageUrl, currentBid, currency, endAt }: LotCardProps) {
  const href = `/auctions/${auctionId}/lots/${lotId}`;
  return (
    <Link href={href} className='group block bg-paper border border-[var(--line)] overflow-hidden hover:shadow-md transition-shadow'>
      <div className='relative overflow-hidden aspect-square'>
        <Image src={imageUrl} alt={title} fill className='object-cover group-hover:scale-105 transition-transform duration-300' />
      </div>
      <div className='p-4'>
        <p className='font-sans text-xs text-mut mb-1'>Lot {lotNumber}</p>
        <p className='font-serif text-sm font-medium text-ink leading-snug line-clamp-2 mb-3'>{title}</p>
        <div className='flex items-center justify-between'>
          <div>
            <p className='font-sans text-[10px] text-mut uppercase tracking-wider'>Current bid</p>
            <p className='font-sans text-sm font-semibold text-ink'>{currency.toUpperCase()} {currentBid.toLocaleString()}</p>
          </div>
          <CountdownTimer endAt={endAt} />
        </div>
      </div>
    </Link>
  );
}
