import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CatalogueLots } from './catalogue-lots';

// Mock useSWR
vi.mock('swr', () => ({
  default: vi.fn(),
}));

// Mock LotCard
vi.mock('@/components/primitives/lot-card', () => ({
  LotCard: ({ title }: { title: string }) => <div data-testid='lot-card'>{title}</div>,
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useFormatter: () => ({
    number: (n: number) => String(n),
    dateTime: (d: Date) => d.toISOString(),
  }),
}));

import useSWR from 'swr';

const mockLots = Array.from({ length: 3 }, (_, i) => ({
  id: `lot-${i}`,
  auctionId: 'auction-1',
  lotNumber: `${i + 1}`,
  title: `Lot ${i + 1} Title`,
  imageUrl: '/placeholder.jpg',
  currentBid: 1000 * (i + 1),
  currency: 'AUD',
  endAt: new Date(Date.now() + 3600000).toISOString(),
}));

describe('CatalogueLots', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: { lots: mockLots, total: 3 },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as ReturnType<typeof useSWR>);
  });

  it('renders lot count and lot cards', () => {
    render(<CatalogueLots auctionId='auction-1' />);
    expect(screen.getByText('3 lots')).toBeTruthy();
    expect(screen.getAllByTestId('lot-card')).toHaveLength(3);
  });

  it('renders sort buttons', () => {
    render(<CatalogueLots auctionId='auction-1' />);
    expect(screen.getByText('Lot Number')).toBeTruthy();
    expect(screen.getByText('Ending Soonest')).toBeTruthy();
    expect(screen.getByText('Price')).toBeTruthy();
  });

  it('highlights the active sort button', () => {
    render(<CatalogueLots auctionId='auction-1' />);
    const lotNumberBtn = screen.getByText('Lot Number');
    expect(lotNumberBtn.className).toContain('bg-ink');
  });

  it('changes sort on button click', () => {
    render(<CatalogueLots auctionId='auction-1' />);
    const priceBtn = screen.getByText('Price');
    fireEvent.click(priceBtn);
    expect(priceBtn.className).toContain('bg-ink');
  });

  it('does not render pagination when total <= PAGE_SIZE', () => {
    render(<CatalogueLots auctionId='auction-1' />);
    expect(screen.queryByText(/← Prev/)).toBeNull();
    expect(screen.queryByText(/Next →/)).toBeNull();
  });

  it('renders pagination when total exceeds PAGE_SIZE', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { lots: mockLots, total: 50 },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as ReturnType<typeof useSWR>);

    render(<CatalogueLots auctionId='auction-1' />);
    expect(screen.getByText(/← Prev/)).toBeTruthy();
    expect(screen.getByText(/Next →/)).toBeTruthy();
    expect(screen.getByText('Page 1 of 3')).toBeTruthy();
  });

  it('shows dash when data is undefined', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      isValidating: true,
      mutate: vi.fn(),
    } as ReturnType<typeof useSWR>);

    render(<CatalogueLots auctionId='auction-1' />);
    expect(screen.getByText('— lots')).toBeTruthy();
  });

  it('shows error message when SWR returns an error', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error('Network error'),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as ReturnType<typeof useSWR>);

    render(<CatalogueLots auctionId='auction-1' />);
    expect(screen.getByText('Unable to load lots.')).toBeTruthy();
  });
});
