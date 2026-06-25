'use client';
import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Header } from '@/components/layout/header';
import { HeaderDark } from '@/components/layout/header-dark';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { BidConfirmedModal } from '@/components/primitives/bid-confirmed-modal';
import { OutbidModal } from '@/components/primitives/outbid-modal';
import { Toast } from '@/components/primitives/toast';
import { useLotSse } from '@/hooks/use-lot-sse';
import { useAuth } from '@/lib/auth-context';
import { createApi } from '@/lib/api';
import Image from 'next/image';

type Lot = {
  id: string; auctionId: string; lotNumber: string; title: string;
  department: string; medium: string; dimensions: string; catalogueNumber: string;
  imageUrls: string[]; currentBid: number; bidCount: number; currency: string;
  endAt: string; estimate: string; provenance: string; status: string;
};

export function LotDetailClient({ lot: initial }: { lot: Lot }) {
  const { user, accessToken } = useAuth();
  const api = createApi(() => accessToken);

  const [lot, setLot] = useState(initial);
  const [isLive, setIsLive] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [confirmedBid, setConfirmedBid] = useState<number | null>(null);
  const [outbidInfo, setOutbidInfo] = useState<{ yourBid: number; currentBid: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);

  const { lastEvent } = useLotSse(lot.id);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'bid_placed') {
      setLot(prev => ({ ...prev, currentBid: lastEvent.currentBid, bidCount: lastEvent.bidCount }));
      if (user && lastEvent.bidderId !== user.userId) {
        setOutbidInfo({ yourBid: lot.currentBid, currentBid: lastEvent.currentBid });
      }
    }
    if (lastEvent.type === 'timer_extended') setLot(prev => ({ ...prev, endAt: lastEvent.endAt }));
    if (lastEvent.type === 'closing_soon') setIsLive(true);
    if (lastEvent.type === 'auction_closed') setLot(prev => ({ ...prev, status: lastEvent.result }));
  }, [lastEvent]);

  async function placeBid() {
    const amount = Number(bidAmount);
    if (!amount || amount <= lot.currentBid) {
      setToast({ message: `Bid must exceed current bid of ${lot.currency.toUpperCase()} ${lot.currentBid.toLocaleString()}`, type: 'error' });
      return;
    }
    if (!user) { window.location.href = `/account/login?returnUrl=${encodeURIComponent(window.location.pathname)}`; return; }
    if (user.verificationStatus === 'PENDING_REVIEW') {
      setToast({ message: 'Your identity is under review. You\'ll be notified when approved.', type: 'info' }); return;
    }

    try {
      await api.post(`/api/auction/auctions/${lot.auctionId}/lots/${lot.id}/bids`, { amount });
      setConfirmedBid(amount);
      setBidAmount('');
    } catch {
      setToast({ message: 'Unable to place bid. Please try again.', type: 'error' });
    }
  }

  return (
    <AppShell isLive={isLive}>
      {isLive ? <HeaderDark /> : <Header />}

      {isLive ? (
        /* ── Live state ── */
        <div className='max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-2 gap-10'>
          <div>
            <div className='relative aspect-square border border-[var(--line)]'>
              <Image src={lot.imageUrls[selectedImage] ?? '/placeholder.jpg'} alt={lot.title} fill className='object-contain' />
              <div className='absolute top-3 left-3 bg-ink/80 text-paper font-sans text-xs px-3 py-1'>
                Lot {lot.lotNumber} · Now Selling
              </div>
            </div>
            <p className='font-serif text-lg font-semibold text-[var(--ink)] mt-4'>{lot.title}</p>
            <p className='font-sans text-sm text-[var(--mut)]'>Est. {lot.estimate}</p>
          </div>

          <div className='flex flex-col gap-6'>
            <div>
              <p className='font-sans text-xs text-[var(--mut)] uppercase tracking-widest mb-1'>Current Bid</p>
              <p className='font-serif text-5xl font-semibold text-[var(--ink)]'>
                {lot.currency.toUpperCase()} {lot.currentBid.toLocaleString()}
              </p>
            </div>

            <div className='text-center'>
              <p className='font-sans text-xs text-[var(--mut)] mb-1'>Time remaining</p>
              <CountdownTimer endAt={lot.endAt} />
            </div>

            <div>
              <input
                type='number' value={bidAmount} onChange={e => setBidAmount(e.target.value)}
                placeholder={`Min ${lot.currentBid + 100}`}
                className='w-full border border-[var(--line)] bg-transparent text-[var(--ink)] font-sans text-lg px-4 py-3 mb-3'
              />
              <button onClick={placeBid} className='w-full bg-[var(--ink)] text-paper font-sans font-semibold py-4 text-base hover:opacity-90 transition-opacity'>
                Bid {lot.currency.toUpperCase()} {bidAmount || '—'}
              </button>

              <div className='grid grid-cols-3 gap-2 mt-3'>
                {[2000, 4000].map(inc => (
                  <button key={inc} onClick={() => setBidAmount(String(lot.currentBid + inc))}
                    className='border border-[var(--line)] font-sans text-sm py-2 text-[var(--ink)] hover:bg-[var(--cream)]'>
                    +{(inc / 1000).toFixed(0)}k
                  </button>
                ))}
                <button onClick={() => setBidAmount('')} className='border border-[var(--line)] font-sans text-sm py-2 text-[var(--ink)] hover:bg-[var(--cream)]'>
                  Custom
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Standard state ── */
        <div className='max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-2 gap-10'>
          {/* Gallery */}
          <div>
            <div className='relative aspect-square border border-[var(--line)] mb-3'>
              <Image src={lot.imageUrls[selectedImage] ?? '/placeholder.jpg'} alt={lot.title} fill className='object-contain' />
            </div>
            {lot.imageUrls.length > 1 && (
              <div className='flex gap-2'>
                {lot.imageUrls.slice(0, 4).map((url, i) => (
                  <button key={i} onClick={() => setSelectedImage(i)}
                    className={`relative w-16 h-16 border-2 ${i === selectedImage ? 'border-ink' : 'border-[var(--line)]'}`}>
                    <Image src={url} alt='' fill className='object-cover' />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info + bid panel */}
          <div>
            <p className='font-sans text-xs text-gold uppercase tracking-widest mb-2'>{lot.department} · Lot {lot.lotNumber}</p>
            <h1 className='font-serif text-3xl font-semibold text-ink mb-3'>{lot.title}</h1>
            <p className='font-sans text-sm text-mut mb-6'>{lot.medium} · {lot.dimensions}</p>

            <div className='border border-[var(--line)] p-6 mb-4'>
              <div className='flex items-start justify-between mb-4'>
                <div>
                  <p className='font-sans text-xs text-mut uppercase tracking-wider mb-1'>Current Bid</p>
                  <p className='font-serif text-3xl font-semibold text-ink'>{lot.currency.toUpperCase()} {lot.currentBid.toLocaleString()}</p>
                  <p className='font-sans text-xs text-mut mt-1'>{lot.bidCount} bids</p>
                </div>
                <div className='text-right'>
                  <p className='font-sans text-xs text-mut uppercase tracking-wider mb-1'>Estimate</p>
                  <p className='font-sans text-sm text-ink'>{lot.estimate}</p>
                </div>
              </div>

              <div className='flex items-center gap-2 bg-cream px-3 py-2 mb-4'>
                <span className='inline-block w-2 h-2 rounded-full bg-ink'></span>
                <CountdownTimer endAt={lot.endAt} />
              </div>

              <input
                type='number' value={bidAmount} onChange={e => setBidAmount(e.target.value)}
                placeholder={`$ ${lot.currentBid + 100}`}
                className='w-full border border-[var(--line)] font-sans text-base px-4 py-3 mb-3'
              />
              <button onClick={placeBid} className='w-full bg-ink text-paper font-sans font-semibold py-3 hover:bg-ink/90 transition-colors'>
                Place Bid
              </button>
              <p className='font-sans text-xs text-mut mt-3 text-center'>22% buyer&apos;s premium applies</p>
            </div>

            <button onClick={() => setIsLive(true)} className='w-full border border-ink font-sans text-sm py-2 mb-6 hover:bg-cream transition-colors'>
              Enter Live Room
            </button>

            {lot.provenance && (
              <div>
                <p className='font-sans text-xs text-mut uppercase tracking-widest mb-2'>Provenance</p>
                <p className='font-sans text-sm text-ink'>{lot.provenance}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmedBid && (
        <BidConfirmedModal amount={confirmedBid} currency={lot.currency} lotTitle={lot.title} onClose={() => setConfirmedBid(null)} />
      )}
      {outbidInfo && (
        <OutbidModal {...outbidInfo} currency={lot.currency} onClose={() => setOutbidInfo(null)} onBidAgain={amount => { setBidAmount(String(amount)); setOutbidInfo(null); }} />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </AppShell>
  );
}
