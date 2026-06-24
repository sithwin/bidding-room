import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BidStatusBadge } from './bid-status-badge';

describe('BidStatusBadge', () => {
  it('renders "Leading" label with green styles', () => {
    render(<BidStatusBadge status='leading' />);
    const badge = screen.getByText('Leading');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
  });

  it('renders "Outbid" label with red styles', () => {
    render(<BidStatusBadge status='outbid' />);
    const badge = screen.getByText('Outbid');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-red-100');
    expect(badge.className).toContain('text-red-800');
  });

  it('renders "Closed" label with grey styles', () => {
    render(<BidStatusBadge status='closed' />);
    const badge = screen.getByText('Closed');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-gray-100');
    expect(badge.className).toContain('text-gray-600');
  });
});
