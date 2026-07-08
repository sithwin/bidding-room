import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LotCard } from './lot-card';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock('./countdown-timer', () => ({
  CountdownTimer: ({ endAt }: { endAt: string }) => <span data-testid='countdown'>{endAt}</span>,
}));

describe('LotCard', () => {
  it('renders current bid, lot number and countdown when bid data is present', () => {
    render(
      <LotCard
        lotId='lot-1' auctionId='auction-1' lotNumber='12' title='Cartier Love Ring'
        imageUrl='/ring.jpg' currentBid={3200} currency='AUD' endAt='2026-07-20T10:00:00Z'
      />,
    );

    expect(screen.getByText('Lot 12')).toBeTruthy();
    expect(screen.getByText('Current bid')).toBeTruthy();
    expect(screen.getByText('AUD 3,200')).toBeTruthy();
    expect(screen.getByTestId('countdown')).toBeTruthy();
  });

  it('renders the estimate when no bid data exists (catalogue-only lot)', () => {
    render(
      <LotCard
        lotId='lot-1' auctionId='auction-1' title='Cartier Love Ring'
        imageUrl='/ring.jpg' estimate={3000} currency='AUD'
      />,
    );

    expect(screen.getByText('Estimate')).toBeTruthy();
    expect(screen.getByText('AUD 3,000')).toBeTruthy();
    expect(screen.queryByText('Current bid')).toBeNull();
    expect(screen.queryByTestId('countdown')).toBeNull();
  });

  it('renders without crashing when only required fields are given', () => {
    render(<LotCard lotId='lot-1' auctionId='auction-1' title='Cartier Love Ring' />);

    expect(screen.getByText('Cartier Love Ring')).toBeTruthy();
    expect(screen.queryByText('Current bid')).toBeNull();
    expect(screen.queryByText('Estimate')).toBeNull();
  });
});
