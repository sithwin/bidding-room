'use client';
import { useState, useEffect } from 'react';
import type { z } from 'zod';
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
import { lotsQuery, placeBidRequestSchema, type AuctionLotStatus } from '@carat-room/shared-types';
import { parseLotList, toLotCardProps, type CatalogueLot } from '@/lib/catalogue';
import { parsePlacedBid } from '@/lib/auction';
import { DISPLAY_CURRENCY } from '@/lib/service-config';
import Image from 'next/image';

export type LotDetailProps = { lot: CatalogueLot; liveStatus: AuctionLotStatus | null };

export function LotDetailClient({ lot, liveStatus }: LotDetailProps) {
  const { user, accessToken, refreshAccessToken } = useAuth();
  const api = createApi(() => accessToken);

  const imageUrls = [...lot.images].sort((a, b) => a.displayOrder - b.displayOrder).map((img) => img.url);
  const estimateLabel = lot.estimatedValue !== null
    ? `${DISPLAY_CURRENCY} ${lot.estimatedValue.toLocaleString()}`
    : null;
  const auctionId = lot.auctionId ?? '';

  const [currentBid, setCurrentBid] = useState(liveStatus?.currentHighestBid ?? null);
  const [bidCount, setBidCount] = useState(liveStatus?.bidCount ?? 0);
  const [endAt, setEndAt] = useState(liveStatus?.endAt ?? null);
  const [auctionStatus, setAuctionStatus] = useState(liveStatus?.status ?? 'SCHEDULED');

  const [isLive, setIsLive] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [confirmedBid, setConfirmedBid] = useState<number | null>(null);
  const [outbidInfo, setOutbidInfo] = useState<{ yourBid: number; currentBid: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);

  const [bidActivity, setBidActivity] = useState<Array<{ paddle: string; amount: number; isYou: boolean }>>([]);
  const [isLeading, setIsLeading] = useState(false);
  const [hasParticipated, setHasParticipated] = useState(false);
  const [isAuctionClosed, setIsAuctionClosed] = useState(auctionStatus === 'SOLD' || auctionStatus === 'UNSOLD');
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [relatedLots, setRelatedLots] = useState<LotCardProps[]>([]);
  const [nextLots, setNextLots] = useState<LotCardProps[]>([]);

  const { lastEvent, isReconnecting } = useLotSse(lot.id);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'bid_placed') {
      setCurrentBid(lastEvent.currentBid);
      setBidCount(lastEvent.bidCount);
      const isYou = !!user && lastEvent.bidderId === user.userId;
      setIsLeading(isYou);
      if (isYou) setHasParticipated(true);
      setBidActivity(prev => [
        { paddle: isYou ? 'You' : `Paddle ${lastEvent.bidderId.slice(-4)}`, amount: lastEvent.currentBid, isYou },
        ...prev.slice(0, 19),
      ]);
      if (!isYou && user) setOutbidInfo({ yourBid: currentBid ?? 0, currentBid: lastEvent.currentBid });
    }
    if (lastEvent.type === 'timer_extended') setEndAt(lastEvent.endAt);
    if (lastEvent.type === 'closing_soon') setIsLive(true);
    if (lastEvent.type === 'auction_closed') {
      setIsAuctionClosed(true);
      setAuctionStatus(lastEvent.result);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  // Fetch related lots (same collection) — exclude the lot being viewed
  useEffect(() => {
    if (!lot.auctionId) return;
    fetch(`/api/catalogue/lots?${lotsQuery({ auctionId: lot.auctionId, limit: 5 })}`)
      .then(r => r.json())
      .then((d: unknown) => setRelatedLots(
        parseLotList(d).lots.filter(l => l.id !== lot.id).slice(0, 4).map(l => toLotCardProps(l, auctionId)),
      ))
      .catch(() => {});
  }, [lot.auctionId, lot.id, auctionId]);

  // Fetch "Up Next" lots (live mode only)
  useEffect(() => {
    if (!isLive || !lot.auctionId) return;
    fetch(`/api/catalogue/lots?${lotsQuery({ auctionId: lot.auctionId, limit: 3 })}`)
      .then(r => r.json())
      .then((d: unknown) => setNextLots(
        parseLotList(d).lots.filter(l => l.id !== lot.id).slice(0, 2).map(l => toLotCardProps(l, auctionId)),
      ))
      .catch(() => {});
  }, [isLive, lot.auctionId, lot.id, auctionId]);

  async function placeBid() {
    if (isAuctionClosed) return;
    const amount = Number(bidAmount);
    const minimumBid = currentBid ?? 0;
    if (!amount || amount <= minimumBid) {
      setToast({ message: `Bid must exceed current bid of ${DISPLAY_CURRENCY} ${minimumBid.toLocaleString()}`, type: 'error' });
      return;
    }
    if (!user) { window.location.href = `/account/login?returnUrl=${encodeURIComponent(window.location.pathname)}`; return; }
    // EMAIL_VERIFIED with no phone → inline modal
    if (user.verificationStatus === 'EMAIL_VERIFIED') { setShowPhoneModal(true); return; }
    if (user.verificationStatus === 'PENDING_REVIEW') {
      setToast({ message: 'Your identity is under review.', type: 'info' }); return;
    }

    // APPROVED_BIDDER but no saved payment method on file
    if (user.verificationStatus === 'APPROVED_BIDDER') {
      try {
        const profileRes = await fetch('/api/payments/profile', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const profile = await profileRes.json() as { stripePaymentMethodId: string | null };
        if (!profile.stripePaymentMethodId) {
          window.location.href = '/account/register-to-bid?step=3';
          return;
        }
      } catch {
        setToast({ message: 'Unable to verify payment method. Please try again.', type: 'error' });
        return;
      }
    }

    try {
      const body = { amount } satisfies z.infer<typeof placeBidRequestSchema>;
      const json = await api.post(`/api/auctions/${lot.id}/bids`, body);
      const placed = parsePlacedBid(json);
      if (!placed) {
        setToast({ message: 'Unable to place bid. Please try again.', type: 'error' });
        return;
      }
      setConfirmedBid(placed.amount);
      setBidAmount('');
    } catch {
      setToast({ message: 'Unable to place bid. Please try again.', type: 'error' });
    }
  }

  function toggleWatchlist() {
    if (!user) { window.location.href = `/account/login?returnUrl=${encodeURIComponent(window.location.pathname)}`; return; }
    // Watchlist toggle — POST/DELETE handled by catalogue service
    // TODO(G3, plan 2026-07-11-api-contracts-phase-2): watchlist endpoints do not exist yet
    fetch(`/api/catalogue/watchlist/${lot.id}`, { method: 'POST', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
      .catch(() => {});
  }

  return (
    <AppShell isLive={isLive}>
      {isLive ? <HeaderDark /> : <Header />}

      {isLive ? (
        /* ── Live state ── */
        <div className='max-w-6xl mx-auto px-6 py-10 pb-20 md:pb-10 grid grid-cols-1 md:grid-cols-2 gap-10'>
          <div>
            <div className='relative aspect-square border border-[var(--line)]'>
              <Image src={imageUrls[selectedImage] ?? '/placeholder.jpg'} alt={lot.title} fill className='object-contain' />
              <div className='absolute top-3 left-3 bg-ink/80 text-paper font-sans text-xs px-3 py-1'>
                Now Selling
              </div>
            </div>
            <p className='font-serif text-lg font-semibold text-[var(--ink)] mt-4'>{lot.title}</p>
            <p className='font-sans text-sm text-[var(--mut)]'>Est. {estimateLabel ?? '—'}</p>

            {/* Up Next strip */}
            {nextLots.length > 0 && (
              <div className='border-t border-[var(--line)] mt-8 pt-4'>
                <p className='font-sans text-xs text-[var(--mut)] uppercase tracking-widest mb-3'>Up Next</p>
                <div className='flex gap-4'>
                  {nextLots.map(l => (
                    <Link key={l.lotId} href={`/auctions/${l.auctionId}/lots/${l.lotId}`} className='flex gap-3 items-center hover:opacity-80'>
                      <div className='relative w-12 h-12 shrink-0'>
                        {l.imageUrl ? (
                          <Image src={l.imageUrl} alt={l.title} fill className='object-cover' />
                        ) : (
                          <div className='absolute inset-0 bg-cream' aria-hidden='true' />
                        )}
                      </div>
                      <div>
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
                {DISPLAY_CURRENCY} {(currentBid ?? 0).toLocaleString()}
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
              {endAt !== null ? (
                <CountdownTimer endAt={endAt} urgentAtMs={60_000} />
              ) : (
                <span className='font-sans text-sm text-[var(--mut)]'>Bidding not yet scheduled</span>
              )}
            </div>

            {/* Bid activity feed */}
            {bidActivity.length > 0 && (
              <div className='border border-[var(--line)] divide-y divide-[var(--line)] max-h-40 overflow-y-auto'>
                {bidActivity.map((entry, i) => (
                  <div key={i} className='flex justify-between px-3 py-2 font-sans text-xs'>
                    <span className={entry.isYou ? 'text-[var(--gold)]' : 'text-[var(--mut)]'}>{entry.paddle}</span>
                    <span className='text-[var(--ink)]'>{DISPLAY_CURRENCY} {entry.amount.toLocaleString()}</span>
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
                placeholder={`Min ${(currentBid ?? 0) + 100}`}
                disabled={isAuctionClosed}
                className='w-full border border-[var(--line)] bg-transparent text-[var(--ink)] font-sans text-lg px-4 py-3 mb-3 disabled:opacity-50'
              />
              <button
                onClick={placeBid}
                disabled={isAuctionClosed}
                className='w-full bg-[var(--ink)] text-paper font-sans font-semibold py-4 text-base hover:opacity-90 transition-opacity disabled:opacity-50'
              >
                Bid {DISPLAY_CURRENCY} {bidAmount || '—'}
              </button>

              <div className='grid grid-cols-3 gap-2 mt-3'>
                {[2000, 4000].map(inc => (
                  <button key={inc} onClick={() => setBidAmount(String((currentBid ?? 0) + inc))}
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
          <div className='max-w-6xl mx-auto px-6 py-10 pb-20 md:pb-10 grid grid-cols-1 md:grid-cols-2 gap-10'>
            {/* Gallery */}
            <div>
              <div className='relative aspect-square border border-[var(--line)] mb-3'>
                <Image src={imageUrls[selectedImage] ?? '/placeholder.jpg'} alt={lot.title} fill className='object-contain' />
              </div>
              {imageUrls.length > 1 && (
                <div className='flex gap-2'>
                  {imageUrls.slice(0, 4).map((url, i) => (
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
              <h1 className='font-serif text-3xl font-semibold text-ink mb-3'>{lot.title}</h1>

              <div className='border border-[var(--line)] p-6 mb-4'>
                <div className='flex items-start justify-between mb-4'>
                  <div>
                    <p className='font-sans text-xs text-mut uppercase tracking-wider mb-1'>Current Bid</p>
                    <p className='font-serif text-3xl font-semibold text-ink'>{DISPLAY_CURRENCY} {(currentBid ?? 0).toLocaleString()}</p>
                    <p className='font-sans text-xs text-mut mt-1'>{bidCount} bids</p>
                  </div>
                  <div className='text-right'>
                    <p className='font-sans text-xs text-mut uppercase tracking-wider mb-1'>Estimate</p>
                    <p className='font-sans text-sm text-ink'>{estimateLabel ?? '—'}</p>
                  </div>
                </div>

                <div className='flex items-center gap-2 bg-cream px-3 py-2 mb-4'>
                  <span className='inline-block w-2 h-2 rounded-full bg-ink'></span>
                  {endAt !== null ? (
                    <CountdownTimer endAt={endAt} />
                  ) : (
                    <span className='font-sans text-sm text-mut'>Bidding not yet scheduled</span>
                  )}
                </div>

                {/* Auction closed banner */}
                {isAuctionClosed && (
                  <div className='bg-ink/10 border border-[var(--line)] px-4 py-3 mb-4 text-center'>
                    <p className='font-sans text-sm font-medium text-ink'>This auction has closed</p>
                  </div>
                )}

                {/* Minimum bid notice */}
                <p className='font-sans text-xs text-mut text-center mb-2'>
                  Minimum bid: {DISPLAY_CURRENCY} {((currentBid ?? 0) + 100).toLocaleString()}
                </p>

                <input
                  type='number'
                  value={bidAmount}
                  onChange={e => setBidAmount(e.target.value)}
                  placeholder={`$ ${(currentBid ?? 0) + 100}`}
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

              {lot.description && (
                <div>
                  <p className='font-sans text-xs text-mut uppercase tracking-widest mb-2'>Description</p>
                  <p className='font-sans text-sm text-ink'>{lot.description}</p>
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

      {/* Mobile sticky bid bar */}
      <div className='md:hidden fixed bottom-0 left-0 right-0 bg-paper border-t border-[var(--line)] flex items-center gap-3 px-4 py-3 z-40'>
        <div className='flex-1'>
          <p className='font-sans text-xs text-mut'>Current bid</p>
          <p className='font-sans text-sm font-semibold text-ink'>{DISPLAY_CURRENCY} {(currentBid ?? 0).toLocaleString()}</p>
        </div>
        <button onClick={placeBid} disabled={isAuctionClosed}
          className='bg-ink text-paper font-sans text-sm font-medium px-6 py-3 disabled:opacity-60'>
          Place Bid · {DISPLAY_CURRENCY} {bidAmount || ((currentBid ?? 0) + 100).toLocaleString()}
        </button>
      </div>

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
        <BidConfirmedModal amount={confirmedBid} currency={DISPLAY_CURRENCY} lotTitle={lot.title} onClose={() => setConfirmedBid(null)} />
      )}
      {outbidInfo && (
        <OutbidModal {...outbidInfo} currency={DISPLAY_CURRENCY} onClose={() => setOutbidInfo(null)} onBidAgain={amount => { setBidAmount(String(amount)); setOutbidInfo(null); }} />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </AppShell>
  );
}
