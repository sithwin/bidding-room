import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { z } from 'zod';
import { accountBidsResponseSchema } from '@carat-room/shared-types';

vi.mock('@/components/layout/header', () => ({
  Header: () => <div data-testid='header' />,
}));

vi.mock('@/components/layout/account-shell', () => ({
  AccountShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'token-1', user: null }),
}));

vi.mock('swr', () => ({
  default: vi.fn(),
}));

import useSWR from 'swr';
import BidsPage from './page';

// Mirrors the real auction-engine envelope: { data, meta }. No title/imageUrl/
// currency/auctionId — auction-engine's read model has no catalogue data.
const bidFixture = {
  lotId: 'lot-1', amount: 250, placedAt: '2026-07-12T09:00:00.000Z',
  isWinning: false, currentHighestBid: 300, status: 'LIVE', endAt: '2026-07-20T10:00:00.000Z',
} satisfies z.infer<typeof accountBidsResponseSchema>['data'][number];

describe('BidsPage', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReset();
  });

  it('renders bid rows from a real { data, meta } envelope without crashing', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { data: [bidFixture], meta: { page: 1, total: 1 } },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as ReturnType<typeof useSWR>);

    render(<BidsPage />);

    expect(screen.getByText('Lot lot-1')).toBeTruthy();
    expect(screen.getByText('Outbid')).toBeTruthy();
    expect(screen.getByText('300')).toBeTruthy();
  });

  it('shows the leading badge when the user holds the current highest bid', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { data: [{ ...bidFixture, isWinning: true }], meta: { page: 1, total: 1 } },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as ReturnType<typeof useSWR>);

    render(<BidsPage />);

    expect(screen.getByText('Leading')).toBeTruthy();
  });

  it('renders the empty state without crashing when the response shape has drifted', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(useSWR).mockReturnValue({
      data: { bids: [bidFixture] },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as ReturnType<typeof useSWR>);

    render(<BidsPage />);

    expect(screen.getByText('You have no active bids.')).toBeTruthy();
  });

  it('renders the empty state while still loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      isValidating: false,
      mutate: vi.fn(),
    } as ReturnType<typeof useSWR>);

    render(<BidsPage />);

    expect(screen.getByText('You have no active bids.')).toBeTruthy();
  });
});
