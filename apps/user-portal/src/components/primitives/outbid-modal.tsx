'use client';

interface Props {
  yourBid: number;
  currentBid: number;
  currency: string;
  onBidAgain: (amount: number) => void;
  onClose: () => void;
}

export function OutbidModal({ yourBid, currentBid, currency, onBidAgain, onClose }: Props) {
  const suggested = currentBid + 100;
  return (
    <div className='fixed inset-0 bg-ink/60 flex items-center justify-center z-50' onClick={onClose}>
      <div className='bg-paper p-8 max-w-sm w-full mx-4 text-center' onClick={e => e.stopPropagation()}>
        <h2 className='font-serif text-xl font-semibold text-ink mb-2'>You&apos;ve been outbid</h2>
        <p className='font-sans text-sm text-mut line-through mb-1'>{currency.toUpperCase()} {yourBid.toLocaleString()}</p>
        <p className='font-sans text-2xl font-bold text-ink mb-6'>{currency.toUpperCase()} {currentBid.toLocaleString()}</p>
        <button onClick={() => onBidAgain(suggested)} className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 transition-colors mb-3'>
          Bid {currency.toUpperCase()} {suggested.toLocaleString()}
        </button>
        <button onClick={onClose} className='font-sans text-sm text-mut hover:text-ink'>Cancel</button>
      </div>
    </div>
  );
}
