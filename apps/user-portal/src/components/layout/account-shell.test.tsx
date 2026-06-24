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
});
