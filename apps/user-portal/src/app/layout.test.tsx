/**
 * Smoke tests for the root layout component.
 *
 * Next.js font objects are mocked so the test runs in jsdom without
 * attempting real network requests or CSS injection.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

/* Mock next/font/google — in a jsdom environment the real module would
   attempt to resolve font files from the filesystem at build time. */
vi.mock('next/font/google', () => ({
  Bodoni_Moda: () => ({ variable: '--font-bodoni', className: 'bodoni' }),
  Mulish: () => ({ variable: '--font-mulish', className: 'mulish' }),
}));

/* Mock the CSS import — vitest/jsdom cannot process @tailwind directives. */
vi.mock('./globals.css', () => ({}));

/* Mock next/navigation — MobileBottomNav calls usePathname inside the layout. */
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}));

/* Mock next/link — used by MobileBottomNav. */
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

/* Mock AuthProvider — used in the root layout body. */
vi.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(() => ({ user: null, accessToken: null, login: vi.fn(), logout: vi.fn(), setAccessToken: vi.fn() })),
}));

import RootLayout from './layout';

describe('RootLayout', () => {
  it('renders children inside the document', () => {
    render(
      <RootLayout>
        <p>Hello Carat Room</p>
      </RootLayout>,
    );

    expect(screen.getByText('Hello Carat Room')).toBeInTheDocument();
  });

  it('applies font CSS variable classes to the html element', () => {
    const { container } = render(
      <RootLayout>
        <span>content</span>
      </RootLayout>,
    );

    /* The outerHTML wraps in a div by RTL — check the html element inside */
    const html = container.querySelector('html');
    expect(html?.className).toContain('--font-bodoni');
    expect(html?.className).toContain('--font-mulish');
  });
});
