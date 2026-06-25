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

  it('renders all nav links', () => {
    render(<AccountShell><span /></AccountShell>);
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/account/dashboard');
    expect(screen.getByRole('link', { name: 'My Bids' })).toHaveAttribute('href', '/account/bids');
    expect(screen.getByRole('link', { name: 'Watchlist' })).toHaveAttribute('href', '/account/watchlist');
    expect(screen.getByRole('link', { name: 'Won Lots' })).toHaveAttribute('href', '/account/won');
    expect(screen.getByRole('link', { name: 'Invoices & Payments' })).toHaveAttribute('href', '/account/invoices');
    expect(screen.getByRole('link', { name: 'Profile & Paddle' })).toHaveAttribute('href', '/account/profile');
  });

  it('applies active styles to the current pathname', () => {
    render(<AccountShell><span /></AccountShell>);
    const activeLink = screen.getByRole('link', { name: 'My Bids' });
    expect(activeLink.className).toContain('bg-ink');
    expect(activeLink.className).toContain('text-paper');
  });

  it('applies inactive styles to non-active links', () => {
    render(<AccountShell><span /></AccountShell>);
    const inactiveLink = screen.getByRole('link', { name: 'Overview' });
    expect(inactiveLink.className).toContain('text-mut');
    expect(inactiveLink.className).not.toContain('bg-ink');
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
