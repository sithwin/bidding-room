import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { z } from 'zod';
import { auctionListResponseSchema } from '@carat-room/shared-types';

vi.mock('@/components/layout/header', () => ({
  Header: () => <div data-testid='header' />,
}));

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img alt={props.alt as string} />,
}));

vi.mock('swr', () => ({
  default: vi.fn(),
}));

import useSWR from 'swr';
import CalendarPage from './page';

// Mirrors the catalogue service's { data, meta } list envelope
const auctionFixture = {
  id: 'auction-1', title: 'July Fine Jewellery Sale', saleDate: '2026-07-20T10:00:00.000Z',
  location: 'Sydney', viewingDates: null, status: 'upcoming', lotCount: 42,
} satisfies z.infer<typeof auctionListResponseSchema>['data'][number];

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReset();
  });

  it('renders the auction title from a real { data, meta } envelope', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { data: [auctionFixture], meta: { total: 1 } },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as ReturnType<typeof useSWR>);

    render(<CalendarPage />);

    expect(screen.getByText('July Fine Jewellery Sale')).toBeTruthy();
  });

  it('renders the empty state without crashing when the response shape has drifted', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(useSWR).mockReturnValue({
      data: { auctions: [auctionFixture] },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as ReturnType<typeof useSWR>);

    render(<CalendarPage />);

    expect(screen.getByText('No auctions in this category.')).toBeTruthy();
  });
});
