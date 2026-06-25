import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => ({ get: vi.fn(() => null), toString: vi.fn(() => '') })),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: null, logout: vi.fn() })),
}));

import { Header } from './header';
import { HeaderDark } from './header-dark';
import * as authContext from '@/lib/auth-context';

describe('Header (light)', () => {
  it('renders the wordmark', () => {
    render(<Header />);
    expect(screen.getByText('The Carat Room')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(<Header />);
    expect(screen.getByRole('link', { name: 'Auctions' })).toHaveAttribute('href', '/auctions');
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/calendar');
    expect(screen.getByRole('link', { name: 'Sell' })).toHaveAttribute('href', '/sell');
    expect(screen.getByRole('link', { name: 'Watchlist' })).toHaveAttribute('href', '/account/watchlist');
  });

  it('renders the Sign In link when logged out', () => {
    render(<Header />);
    expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/account/login');
  });

  it('wordmark links to home', () => {
    render(<Header />);
    expect(screen.getByRole('link', { name: 'The Carat Room' })).toHaveAttribute('href', '/');
  });

  it('renders the search input', () => {
    render(<Header />);
    expect(screen.getByPlaceholderText('Search lots…')).toBeInTheDocument();
  });

  it('renders avatar and sign out button when logged in', () => {
    vi.mocked(authContext.useAuth).mockReturnValueOnce({
      user: { userId: '1', email: 'test@example.com', verificationStatus: 'VERIFIED', role: 'USER' },
      accessToken: null,
      login: vi.fn(),
      logout: vi.fn(),
      setAccessToken: vi.fn(),
    });
    render(<Header />);
    expect(screen.getByText('T')).toBeInTheDocument(); // avatar initial
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});

describe('HeaderDark', () => {
  it('renders the wordmark', () => {
    render(<HeaderDark />);
    expect(screen.getByText('The Carat Room')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(<HeaderDark />);
    expect(screen.getByRole('link', { name: 'Auctions' })).toHaveAttribute('href', '/auctions');
    expect(screen.getByRole('link', { name: 'Watchlist' })).toHaveAttribute('href', '/account/watchlist');
  });

  it('applies dark background class to header element', () => {
    render(<HeaderDark />);
    const headerEl = screen.getByRole('banner');
    expect(headerEl.className).toContain('bg-ink');
  });

  it('wordmark links to home', () => {
    render(<HeaderDark />);
    expect(screen.getByRole('link', { name: 'The Carat Room' })).toHaveAttribute('href', '/');
  });

  it('renders the search input', () => {
    render(<HeaderDark />);
    expect(screen.getByPlaceholderText('Search lots…')).toBeInTheDocument();
  });
});
