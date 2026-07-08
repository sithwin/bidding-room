import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/layout/header', () => ({
  Header: () => <div data-testid='header' />,
}));

vi.mock('@/components/primitives/lot-card', () => ({
  LotCard: ({ title }: { title: string }) => <div data-testid='lot-card'>{title}</div>,
}));

import HomePage from './page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  it('renders the empty state when the catalogue returns its { data, meta } envelope', async () => {
    // The catalogue service wraps list responses as { data: [...], meta: {...} },
    // not { lots: [...] } / { auctions: [...] } — the page must not crash on that shape
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], meta: { total: 0, limit: 8, offset: 0 } }),
    }));

    render(await HomePage());

    expect(screen.getByText('No lots currently open.')).toBeTruthy();
    expect(screen.queryByTestId('lot-card')).toBeNull();
  });

  it('renders the empty state when the catalogue is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    render(await HomePage());

    expect(screen.getByText('No lots currently open.')).toBeTruthy();
  });

  it('renders lot cards when the response matches the expected shape', async () => {
    const lot = {
      id: 'lot-1', auctionId: 'auction-1', lotNumber: '1', title: 'Art Deco Diamond Ring',
      imageUrl: '/ring.jpg', currentBid: 4200, currency: 'AUD', endAt: new Date().toISOString(),
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () => (url.includes('/api/lots') ? { lots: [lot] } : { data: [] }),
      }),
    ));

    render(await HomePage());

    expect(screen.getByText('Art Deco Diamond Ring')).toBeTruthy();
  });

  it('renders upcoming sales from the catalogue { data } envelope', async () => {
    const auction = { id: 'auction-1', title: 'July Fine Jewellery Sale', saleDate: '2026-07-20T10:00:00Z', lotCount: 42 };
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () => (url.includes('/api/auctions') ? { data: [auction] } : { data: [] }),
      }),
    ));

    render(await HomePage());

    expect(screen.getByText('July Fine Jewellery Sale')).toBeTruthy();
    expect(screen.getByText('42 lots')).toBeTruthy();
  });
});
