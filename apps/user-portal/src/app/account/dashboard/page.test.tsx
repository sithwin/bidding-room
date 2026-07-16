import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { z } from 'zod';
import { accountBidsResponseSchema, accountStatsResponseSchema } from '@carat-room/shared-types';

vi.mock('@/components/layout/header', () => ({
  Header: () => <div data-testid='header' />,
}));

vi.mock('@/components/layout/account-shell', () => ({
  AccountShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'token-1', user: { userId: 'u1', email: 'buyer@example.com', verificationStatus: 'VERIFIED', role: 'USER' } }),
}));

vi.mock('swr', () => ({
  default: vi.fn(),
}));

import useSWR from 'swr';
import DashboardPage from './page';

// Mirrors the real auction-engine envelopes.
const statsFixture = {
  totalBids: 8, activeBids: 3, leadingBids: 2, lotsWon: 1,
} satisfies z.infer<typeof accountStatsResponseSchema>['data'];

const bidFixture = {
  lotId: 'lot-1', amount: 250, placedAt: '2026-07-12T09:00:00.000Z',
  isWinning: true, currentHighestBid: 250, status: 'LIVE', endAt: '2026-07-20T10:00:00.000Z',
} satisfies z.infer<typeof accountBidsResponseSchema>['data'][number];

function mockSwrByKey(responses: Record<string, unknown>) {
  vi.mocked(useSWR).mockImplementation(((key: unknown) => {
    const url = Array.isArray(key) ? key[0] : key;
    const data = typeof url === 'string' && url in responses ? responses[url] : undefined;
    return {
      data,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    };
  }) as typeof useSWR);
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReset();
  });

  it('renders stats and recent bids from real { data } envelopes without crashing', () => {
    mockSwrByKey({
      '/api/account/stats': { data: statsFixture },
      '/api/account/bids?pageSize=5': { data: [bidFixture], meta: { page: 1, total: 1 } },
    });

    render(<DashboardPage />);

    expect(screen.getByText('2')).toBeTruthy(); // Leading
    expect(screen.getByText('3')).toBeTruthy(); // Active Bids
    expect(screen.getByText('1')).toBeTruthy(); // Won This Year
    expect(screen.getByText('Lot lot-1')).toBeTruthy();
    expect(screen.getAllByText('Leading').length).toBeGreaterThan(0); // stat label + badge
    expect(screen.queryByText('Watching')).toBeNull();
  });

  it('renders a safe loading/fallback state without crashing when responses have drifted', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSwrByKey({
      '/api/account/stats': { activeBids: 3, leading: 2, watching: 0, wonThisYear: 1 },
      '/api/account/bids?pageSize=5': { bids: [bidFixture] },
    });

    render(<DashboardPage />);

    expect(screen.getByText("Here's your bidding overview.")).toBeTruthy();
    expect(screen.getByText('No active bids.')).toBeTruthy();
  });
});
