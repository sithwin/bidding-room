import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { z } from 'zod';
import { lotResponseSchema, lotStatusResponseSchema } from '@carat-room/shared-types';
import { LotDetailClient } from './lot-detail-client';

// ── Mocks: SSE hook, next/image, auth, and layout chrome that needs a router ──

const mockUseLotSse = vi.fn();
vi.mock('@/hooks/use-lot-sse', () => ({
  useLotSse: () => mockUseLotSse(),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: null, accessToken: null, refreshAccessToken: vi.fn() }),
}));

vi.mock('@/components/layout/header', () => ({ Header: () => <header data-testid='header' /> }));
vi.mock('@/components/layout/header-dark', () => ({ HeaderDark: () => <header data-testid='header-dark' /> }));
vi.mock('@/components/primitives/phone-otp-inline', () => ({ PhoneOtpInline: () => <div data-testid='phone-otp' /> }));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [], meta: { total: 0 } }) }));
  mockUseLotSse.mockReturnValue({ lastEvent: null, isConnected: true, isReconnecting: false });
});

const lotFixture = {
  id: 'lot-1', title: 'Art Deco Ring', description: 'A fine ring', auctionId: 'auc-1',
  categoryId: 'cat-1', condition: 'EXCELLENT', estimatedValue: 5000, status: 'ACTIVE',
  images: [{ id: 'img-1', lotId: 'lot-1', url: 'https://cdn/img.jpg', thumbnailUrl: 'https://cdn/t.jpg', displayOrder: 0, isPrimary: true }],
  createdBy: 'admin', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
} satisfies z.infer<typeof lotResponseSchema>['data'];

const statusFixture = {
  lotId: 'lot-1', status: 'LIVE', currentHighestBid: 5500, bidCount: 3,
  endAt: '2026-07-12T10:00:00.000Z',
} satisfies z.infer<typeof lotStatusResponseSchema>['data'];

describe('LotDetailClient', () => {
  it('renders title, image, formatted current bid and bid count from the fixtures', () => {
    render(<LotDetailClient lot={lotFixture} liveStatus={statusFixture} />);

    expect(screen.getByText('Art Deco Ring')).toBeInTheDocument();
    expect(screen.getByAltText('Art Deco Ring')).toHaveAttribute('src', 'https://cdn/img.jpg');
    // Current bid renders both in the main panel and the mobile sticky bar.
    expect(screen.getAllByText('AUD 5,500').length).toBeGreaterThan(0);
    expect(screen.getByText('3 bids')).toBeInTheDocument();
  });

  it('renders the lot without crashing and shows the not-yet-scheduled state when liveStatus is null', () => {
    render(<LotDetailClient lot={lotFixture} liveStatus={null} />);

    expect(screen.getByText('Art Deco Ring')).toBeInTheDocument();
    expect(screen.getAllByText('AUD 0').length).toBeGreaterThan(0);
    expect(screen.getByText('0 bids')).toBeInTheDocument();
    expect(screen.getByText('Bidding not yet scheduled')).toBeInTheDocument();
  });

  it('renders without crashing when the lot has no bids yet (currentHighestBid: null)', () => {
    render(<LotDetailClient lot={lotFixture} liveStatus={{ ...statusFixture, currentHighestBid: null, bidCount: 0 }} />);

    expect(screen.getByText('Art Deco Ring')).toBeInTheDocument();
    expect(screen.getAllByText('AUD 0').length).toBeGreaterThan(0);
    expect(screen.getByText('0 bids')).toBeInTheDocument();
  });
});
