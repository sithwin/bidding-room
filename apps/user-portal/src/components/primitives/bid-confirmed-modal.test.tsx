import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BidConfirmedModal } from './bid-confirmed-modal';

describe('BidConfirmedModal', () => {
  const defaultProps = {
    amount: 1500,
    currency: 'gbp',
    lotTitle: 'Diamond Ring',
    onClose: vi.fn(),
  };

  it('renders lot title and amount', () => {
    render(<BidConfirmedModal {...defaultProps} />);
    expect(screen.getByText('Diamond Ring')).toBeInTheDocument();
    expect(screen.getByText('GBP 1,500')).toBeInTheDocument();
  });

  it('renders the highest bidder heading', () => {
    render(<BidConfirmedModal {...defaultProps} />);
    expect(screen.getByText("You're the highest bidder")).toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<BidConfirmedModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when "Continue Browsing" button is clicked', () => {
    const onClose = vi.fn();
    render(<BidConfirmedModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue Browsing' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when the modal content itself is clicked', () => {
    const onClose = vi.fn();
    render(<BidConfirmedModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Diamond Ring'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('displays currency in uppercase', () => {
    render(<BidConfirmedModal {...defaultProps} currency='eur' />);
    expect(screen.getByText('EUR 1,500')).toBeInTheDocument();
  });
});
