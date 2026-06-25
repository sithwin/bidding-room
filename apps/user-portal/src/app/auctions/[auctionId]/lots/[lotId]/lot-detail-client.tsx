'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Header } from '@/components/layout/header';
import { HeaderDark } from '@/components/layout/header-dark';
import { CountdownTimer } from '@/components/primitives/countdown-timer';
import { BidConfirmedModal } from '@/components/primitives/bid-confirmed-modal';
import { OutbidModal } from '@/components/primitives/outbid-modal';
import { Toast } from '@/components/primitives/toast';
import { LotCard, type LotCardProps } from '@/components/primitives/lot-card';
import { PhoneOtpInline } from '@/components/primitives/phone-otp-inline';
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
  const { user, accessToken, refreshAccessToken } = useAuth();
  const api = createApi(() => accessToken);

  const [lot, setLot] = useState(initial);
  const [isLive, setIsLive] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [confirmedBid, setConfirmedBid] = useState<number | null>(null);
  const [outbidInfo, setOutbidInfo] = useState<{ yourBid: number; currentBid: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);

  const [bidActivity, setBidActivity] = useState<Array<{ paddle: string; amount: number; isYou: boolean }>>([]);
  const [isLeading, setIsLeading] = useState(false);
  const [hasParticipated, setHasParticipated] = useState(false);
  const [isAuctionClosed, setIsAuctionClosed] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [relatedLots, setRelatedLots] = useState<LotCardProps[]>([]);
  const [nextLots, setNextLots] = useState<LotCardProps[]>([]);

  const { lastEvent, isReconnecting } = useLotSse(lot.id);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'bid_placed') {
      setLot(prev => ({ ...prev, currentBid: lastEvent.currentBid, bidCount: lastEvent.bidCount }));
      const isYou = !!user && lastEvent.bidderId === user.userId;
      setIsLeading(isYou);
      if (isYou) setHasParticipated(true);
      setBidActivity(prev => [
        { paddle: isYou ? 'You' : `Paddle ${lastEvent.bidderId.slice(-4)}`, amount: lastEvent.currentBid, isYou },
        ...prev.slice(0, 19),
      ]);
      if (!isYou && user) setOutbidInfo({ yourBid: lot.currentBid, currentBid: lastEvent.currentBid });
    }
    if (lastEvent.type === 'timer_extended') setLot(prev => ({ ...prev, endAt: lastEvent.endAt }));
    if (lastEvent.type === 'closing_soon') setIsLive(true);
    if (lastEvent.type === 'auction_closed') {
      setIsAuctionClosed(true);
      setLot(prev => ({ ...prev, status: lastEvent.result }));
    }
  }, [lastEvent]);

  // Fetch related lots (same collection)
  useEffect(() => {
    fetch(`/api/catalogue/lots?auctionId=${lot.auctionId}&limit=4&exclude=${lot.id}`)
      .then(r => r.json())
      .then((d: { lots: LotCardProps[] }) => setRelatedLots(d.lots))
      .catch(() => {});
  }, [lot.auctionId, lot.id]);

  // Fetch "Up Next" lots (live mode only)
  useEffect(() => {
    if (!isLive) return;
    fetch(`/api/catalogue/lots?auctionId=${lot.auctionId}&after=${lot.lotNumber}&limit=2`)
      .then(r => r.json())
      .then((d: { lots: LotCardProps[] }) => setNextLots(d.lots))
      .catch(() => {});
  }, [isLive, lot.auctionId, lot.lotNumber]);

  async function placeBid() {
    if (isAuctionClosed) return;
    const amount = Number(bidAmount);
    if (!amount || amount <= lot.currentBid) {
      setToast({ message: `Bid must exceed current bid of ${lot.currency.toUpperCase()} ${lot.currentBid.toLocaleString()}`, type: 'error' });
      return;
    }
    if (!user) { window.location.href = `/account/login?returnUrl=${encodeURIComponent(window.location.pathname)}`; return; }
    // EMAIL_VERIFIED with no phone → inline modal
    if (user.verificationStatus === 'EMAIL_VERIFIED') { setShowPhoneModal(true); return; }
    if (user.verificationStatus === 'PENDING_REVIEW') {
      setToast({ message: 'Your identity is under review.', type: 'info' }); return;
    }

    try {
      await api.post(`/api/auction/auctions/${lot.auctionId}/lots/${lot.id}/bids`, { amount });
      setConfirmedBid(amount);
      setBidAmount('');
    } catch {
      setToast({ message: 'Unable to place bid. Please try again.', type: 'error' });
    }
  }

  function toggleWatchlist() {
    if (!user) { window.location.href = `/account/login?returnUrl=${encodeURIComponent(window.location.pathname)}`; return; }
    // Watchlist toggle — POST/DELETE handled by catalogue service
    fetch(`/api/catalogue/watchlist/${lot.id}`, { method: 'POST', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
      .catch(() => {});
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

            {/* Up Next strip */}
            {nextLots.length > 0 && (
              <div className='border-t border-[var(--line)] mt-8 pt-4'>
                <p className='font-sans text-xs text-[var(--mut)] uppercase tracking-widest mb-3'>Up Next</p>
                <div className='flex gap-4'>
                  {nextLots.map(l => (
                    <Link key={l.lotId} href={`/auctions/${l.auctionId}/lots/${l.lotId}`} className='flex gap-3 items-center hover:opacity-80'>
                      <div className='relative w-12 h-12 shrink-0'>
                        <Image src={l.imageUrl} alt={l.title} fill className='object-cover' />
                      </div>
                      <div>
                        <p className='font-sans text-xs text-[var(--mut)]'>Lot {l.lotNumber}</p>
                        <p className='font-serif text-sm text-[var(--ink)] line-clamp-1'>{l.title}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className='flex flex-col gap-6'>
            <div>
              <p className='font-sans text-xs text-[var(--mut)] uppercase tracking-widest mb-1'>Current Bid</p>
              <p className='font-serif text-5xl font-semibold text-[var(--ink)]'>
                {lot.currency.toUpperCase()} {lot.currentBid.toLocaleString()}
              </p>
            </div>

            {/* Status line */}
            {user && hasParticipated && (
              <p className={`font-sans text-sm font-medium ${isLeading ? 'text-[var(--gold)]' : 'text-red-400'}`}>
                {isLeading ? 'You are leading' : 'You\'ve been outbid'}
              </p>
            )}

            <div className='text-center'>
              <p className='font-sans text-xs text-[var(--mut)] mb-1'>Time remaining</p>
              <CountdownTimer endAt={lot.endAt} />
            </div>

            {/* Bid activity feed */}
            {bidActivity.length > 0 && (
              <div className='border border-[var(--line)] divide-y divide-[var(--line)] max-h-40 overflow-y-auto'>
                {bidActivity.map((entry, i) => (
                  <div key={i} className='flex justify-between px-3 py-2 font-sans text-xs'>
                    <span className={entry.isYou ? 'text-[var(--gold)]' : 'text-[var(--mut)]'}>{entry.paddle}</span>
                    <span className='text-[var(--ink)]'>{lot.currency.toUpperCase()} {entry.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Auction closed banner */}
            {isAuctionClosed && (
              <div className='bg-ink/10 border border-[var(--line)] px-4 py-3 text-center'>
                <p className='font-sans text-sm font-medium text-ink'>This auction has closed</p>
              </div>
            )}

            <div>
              <input
                type='number'
                value={bidAmount}
                onChange={e => setBidAmount(e.target.value)}
                placeholder={`Min ${lot.currentBid + 100}`}
                disabled={isAuctionClosed}
                className='w-full border border-[var(--line)] bg-transparent text-[var(--ink)] font-sans text-lg px-4 py-3 mb-3 disabled:opacity-50'
              />
              <button
                onClick={placeBid}
                disabled={isAuctionClosed}
                className='w-full bg-[var(--ink)] text-paper font-sans font-semibold py-4 text-base hover:opacity-90 transition-opacity disabled:opacity-50'
              >
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
        <>
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

                {/* Auction closed banner */}
                {isAuctionClosed && (
                  <div className='bg-ink/10 border border-[var(--line)] px-4 py-3 mb-4 text-center'>
                    <p className='font-sans text-sm font-medium text-ink'>This auction has closed</p>
                  </div>
                )}

                {/* Minimum bid notice */}
                <p className='font-sans text-xs text-mut text-center mb-2'>
                  Minimum bid: {lot.currency.toUpperCase()} {(lot.currentBid + 100).toLocaleString()}
                </p>

                <input
                  type='number'
                  value={bidAmount}
                  onChange={e => setBidAmount(e.target.value)}
                  placeholder={`$ ${lot.currentBid + 100}`}
                  disabled={isAuctionClosed}
                  className='w-full border border-[var(--line)] font-sans text-base px-4 py-3 mb-3 disabled:opacity-50'
                />
                <button
                  onClick={placeBid}
                  disabled={isAuctionClosed}
                  className='w-full bg-ink text-paper font-sans font-semibold py-3 hover:bg-ink/90 transition-colors disabled:opacity-50'
                >
                  Place Bid
                </button>
                <p className='font-sans text-xs text-mut mt-3 text-center'>22% buyer&apos;s premium applies</p>
              </div>

              {/* Add to Watchlist + Enquire + Condition */}
              <div className='flex gap-3 mb-6'>
                <button onClick={toggleWatchlist} className='flex-1 border border-[var(--line)] font-sans text-sm py-2 hover:bg-cream transition-colors'>
                  ♡ Add to Watchlist
                </button>
                <button className='flex-1 border border-[var(--line)] font-sans text-sm py-2 hover:bg-cream transition-colors'>
                  Enquire
                </button>
                <button
                  onClick={() => { const el = document.getElementById('condition'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}
                  className='flex-1 border border-[var(--line)] font-sans text-sm py-2 hover:bg-cream transition-colors'
                >
                  Condition
                </button>
              </div>

              {/* Trust marks */}
              <div className='flex gap-6 py-4 border-t border-[var(--line)] mb-6'>
                <p className='font-sans text-xs text-mut'>✓ Authenticity guaranteed</p>
                <p className='font-sans text-xs text-mut'>✓ Insured shipping worldwide</p>
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

          {/* From the same collection */}
          {relatedLots.length > 0 && (
            <div className='max-w-6xl mx-auto px-6 pb-16'>
              <h2 className='font-serif text-xl font-semibold text-ink mb-6'>From the same collection</h2>
              <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                {relatedLots.map(l => <LotCard key={l.lotId} {...l} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Reconnecting badge */}
      {isReconnecting && (
        <div className='fixed bottom-4 left-1/2 -translate-x-1/2 bg-ink text-paper font-sans text-xs px-4 py-2 rounded-full'>
          Reconnecting…
        </div>
      )}

      {/* Inline phone OTP modal */}
      {showPhoneModal && (
        <div className='fixed inset-0 bg-ink/60 flex items-center justify-center z-50'>
          <div className='bg-paper p-8 max-w-sm w-full mx-4'>
            <h2 className='font-serif text-xl font-semibold text-ink mb-4'>Verify your phone first</h2>
            <PhoneOtpInline
              onVerified={() => {
                  setShowPhoneModal(false);
                  void (async () => {
                    await refreshAccessToken();
                    void placeBid();
                  })();
                }}
              onClose={() => setShowPhoneModal(false)}
            />
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
