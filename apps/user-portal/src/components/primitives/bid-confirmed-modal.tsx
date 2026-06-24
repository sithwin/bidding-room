'use client';

interface Props {
  amount: number;
  currency: string;
  lotTitle: string;
  onClose: () => void;
}

export function BidConfirmedModal({ amount, currency, lotTitle, onClose }: Props) {
  return (
    <div className='fixed inset-0 bg-ink/60 flex items-center justify-center z-50' onClick={onClose}>
      <div className='bg-paper p-8 max-w-sm w-full mx-4 text-center' onClick={e => e.stopPropagation()}>
        <div className='w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4'>
          <svg className='w-6 h-6 text-green-700' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
          </svg>
        </div>
        <h2 className='font-serif text-xl font-semibold text-ink mb-2'>You&apos;re the highest bidder</h2>
        <p className='font-sans text-mut text-sm mb-1'>{lotTitle}</p>
        <p className='font-sans text-2xl font-bold text-ink mb-6'>{currency.toUpperCase()} {amount.toLocaleString()}</p>
        <button onClick={onClose} className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 transition-colors'>
          Continue Browsing
        </button>
      </div>
    </div>
  );
}
