import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/auctions'),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import { MobileBottomNav } from './mobile-bottom-nav';

describe('MobileBottomNav', () => {
  it('renders all four nav items', () => {
    render(<MobileBottomNav />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Browse')).toBeInTheDocument();
    expect(screen.getByText('Watch')).toBeInTheDocument();
    expect(screen.getByText('Bids')).toBeInTheDocument();
  });

  it('renders correct hrefs', () => {
    render(<MobileBottomNav />);
    expect(screen.getByRole('link', { name: /Home/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Browse/ })).toHaveAttribute('href', '/auctions');
    expect(screen.getByRole('link', { name: /Watch/ })).toHaveAttribute('href', '/account/watchlist');
    expect(screen.getByRole('link', { name: /Bids/ })).toHaveAttribute('href', '/account/bids');
  });

  it('applies active styles when pathname matches', () => {
    render(<MobileBottomNav />);
    // pathname is '/auctions', so Browse should be active
    const browseLink = screen.getByRole('link', { name: /Browse/ });
    expect(browseLink.className).toContain('text-ink');
    expect(browseLink.className).toContain('font-semibold');
  });

  it('applies inactive styles to non-matching links', () => {
    render(<MobileBottomNav />);
    // pathname is '/auctions', so Home should be inactive
    const homeLink = screen.getByRole('link', { name: /Home/ });
    expect(homeLink.className).toContain('text-mut');
    expect(homeLink.className).not.toContain('font-semibold');
  });

  it('renders as a nav element', () => {
    render(<MobileBottomNav />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
