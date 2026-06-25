import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/account/bids'),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: vi.fn(() => ({
    user: { userId: '1', email: 'test@example.com', verificationStatus: 'VERIFIED', role: 'USER' },
    accessToken: null,
    login: vi.fn(),
    logout: vi.fn(),
    setAccessToken: vi.fn(),
  })),
}));

import { AccountShell } from './account-shell';

describe('AccountShell', () => {
  it('renders children in the main area', () => {
    render(<AccountShell><p>page content</p></AccountShell>);
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('renders all nav links (both mobile strip and desktop sidebar)', () => {
    render(<AccountShell><span /></AccountShell>);
    // Nav links appear twice: once in mobile strip, once in desktop sidebar
    const overviewLinks = screen.getAllByRole('link', { name: 'Overview' });
    expect(overviewLinks.length).toBeGreaterThanOrEqual(1);
    expect(overviewLinks[0]).toHaveAttribute('href', '/account/dashboard');

    const bidsLinks = screen.getAllByRole('link', { name: 'My Bids' });
    expect(bidsLinks.length).toBeGreaterThanOrEqual(1);
    expect(bidsLinks[0]).toHaveAttribute('href', '/account/bids');

    const watchLinks = screen.getAllByRole('link', { name: 'Watchlist' });
    expect(watchLinks[0]).toHaveAttribute('href', '/account/watchlist');

    const wonLinks = screen.getAllByRole('link', { name: 'Won Lots' });
    expect(wonLinks[0]).toHaveAttribute('href', '/account/won');

    const invoicesLinks = screen.getAllByRole('link', { name: 'Invoices & Payments' });
    expect(invoicesLinks[0]).toHaveAttribute('href', '/account/invoices');

    const profileLinks = screen.getAllByRole('link', { name: 'Profile & Paddle' });
    expect(profileLinks[0]).toHaveAttribute('href', '/account/profile');
  });

  it('applies active styles to the current pathname in desktop sidebar', () => {
    render(<AccountShell><span /></AccountShell>);
    // Desktop sidebar active link has bg-ink text-paper
    const activeLinks = screen.getAllByRole('link', { name: 'My Bids' });
    const sidebarActive = activeLinks.find(el => el.className.includes('bg-ink'));
    expect(sidebarActive).toBeDefined();
    expect(sidebarActive!.className).toContain('text-paper');
  });

  it('applies active styles to the current pathname in mobile tab strip', () => {
    render(<AccountShell><span /></AccountShell>);
    // Mobile strip active link has border-ink text-ink font-medium
    const activeLinks = screen.getAllByRole('link', { name: 'My Bids' });
    const mobileActive = activeLinks.find(el => el.className.includes('border-ink'));
    expect(mobileActive).toBeDefined();
    expect(mobileActive!.className).toContain('font-medium');
  });

  it('applies inactive styles to non-active links in desktop sidebar', () => {
    render(<AccountShell><span /></AccountShell>);
    const overviewLinks = screen.getAllByRole('link', { name: 'Overview' });
    const sidebarInactive = overviewLinks.find(el => el.className.includes('text-mut') && !el.className.includes('border-b-2'));
    expect(sidebarInactive).toBeDefined();
    expect(sidebarInactive!.className).not.toContain('bg-ink');
  });

  it('renders the user avatar initial', () => {
    render(<AccountShell><span /></AccountShell>);
    expect(screen.getByText('T')).toBeInTheDocument(); // first letter of test@example.com
  });

  it('renders the user email', () => {
    render(<AccountShell><span /></AccountShell>);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('renders collectorSince when provided', () => {
    render(<AccountShell collectorSince='2024'><span /></AccountShell>);
    expect(screen.getByText('Collector since 2024')).toBeInTheDocument();
  });

  it('does not render collectorSince paragraph when not provided', () => {
    render(<AccountShell><span /></AccountShell>);
    expect(screen.queryByText(/Collector since/)).toBeNull();
  });
});
