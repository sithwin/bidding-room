import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/link — Server Component renders require a simple anchor stub in jsdom.
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import { Header } from './header';
import { HeaderDark } from './header-dark';

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
  });

  it('renders the Sign In link', () => {
    render(<Header />);
    expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/account/login');
  });

  it('wordmark links to home', () => {
    render(<Header />);
    expect(screen.getByRole('link', { name: 'The Carat Room' })).toHaveAttribute('href', '/');
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
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/calendar');
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
});
