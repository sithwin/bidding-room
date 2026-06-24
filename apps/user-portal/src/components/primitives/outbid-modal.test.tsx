import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OutbidModal } from './outbid-modal';

describe('OutbidModal', () => {
  const defaultProps = {
    yourBid: 1000,
    currentBid: 1200,
    currency: 'gbp',
    onBidAgain: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders the outbid heading', () => {
    render(<OutbidModal {...defaultProps} />);
    expect(screen.getByText("You've been outbid")).toBeInTheDocument();
  });

  it('renders your previous bid struck through', () => {
    render(<OutbidModal {...defaultProps} />);
    const yourBid = screen.getByText('GBP 1,000');
    expect(yourBid.className).toContain('line-through');
  });

  it('renders current (winning) bid', () => {
    render(<OutbidModal {...defaultProps} />);
    expect(screen.getByText('GBP 1,200')).toBeInTheDocument();
  });

  it('renders bid again button with suggested amount (currentBid + 100)', () => {
    render(<OutbidModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Bid GBP 1,300' })).toBeInTheDocument();
  });

  it('calls onBidAgain with suggested amount when bid button is clicked', () => {
    const onBidAgain = vi.fn();
    render(<OutbidModal {...defaultProps} onBidAgain={onBidAgain} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bid GBP 1,300' }));
    expect(onBidAgain).toHaveBeenCalledWith(1300);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<OutbidModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<OutbidModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
