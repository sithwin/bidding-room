import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { z } from 'zod';
import { lotListResponseSchema, auctionListResponseSchema } from '@carat-room/shared-types';

vi.mock('@/components/layout/header', () => ({
  Header: () => <div data-testid='header' />,
}));

vi.mock('@/components/primitives/lot-card', () => ({
  LotCard: ({ title }: { title: string }) => <div data-testid='lot-card'>{title}</div>,
}));

import HomePage from './page';

const lotFixture = {
  id: 'lot-1', title: 'Art Deco Diamond Ring', description: null, auctionId: 'auction-1',
  categoryId: null, condition: 'EXCELLENT', estimatedValue: 4200, status: 'ACTIVE',
  images: [{ id: 'img-1', lotId: 'lot-1', url: '/ring.jpg', thumbnailUrl: '/ring_t.jpg', displayOrder: 0, isPrimary: true }],
  createdBy: null, createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z',
} satisfies z.infer<typeof lotListResponseSchema>['data'][number];

const auctionFixture = {
  id: 'auction-1', title: 'July Fine Jewellery Sale', saleDate: '2026-07-20T10:00:00.000Z',
  location: 'Sydney', viewingDates: null, status: 'upcoming', lotCount: 42,
} satisfies z.infer<typeof auctionListResponseSchema>['data'][number];

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(lotsBody: unknown, auctionsBody: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) =>
    Promise.resolve({
      ok: true,
      json: async () => (url.includes('/api/lots') ? lotsBody : auctionsBody),
    }),
  ));
}

describe('HomePage', () => {
  it('renders lots and upcoming sales from real catalogue envelopes', async () => {
    stubFetch(
      { data: [lotFixture], meta: { total: 1, limit: 8, offset: 0 } },
      { data: [auctionFixture] },
    );

    render(await HomePage());

    expect(screen.getByText('Art Deco Diamond Ring')).toBeTruthy();
    expect(screen.getByText('July Fine Jewellery Sale')).toBeTruthy();
    expect(screen.getByText('42 lots')).toBeTruthy();
  });

  it('renders empty states on contract drift, never crashes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetch({ lots: [lotFixture] }, { auctions: [] });

    render(await HomePage());

    expect(screen.getByText('No lots currently open.')).toBeTruthy();
    expect(screen.queryByTestId('lot-card')).toBeNull();
  });

  it('renders the empty state when the catalogue is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    render(await HomePage());

    expect(screen.getByText('No lots currently open.')).toBeTruthy();
  });
});
