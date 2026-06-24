import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Toast } from './toast';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the message', () => {
    render(<Toast message='Something happened' onDismiss={vi.fn()} />);
    expect(screen.getByText('Something happened')).toBeInTheDocument();
  });

  it('applies info styles by default', () => {
    render(<Toast message='Info' onDismiss={vi.fn()} />);
    const el = screen.getByText('Info');
    expect(el.className).toContain('bg-ink');
    expect(el.className).toContain('text-paper');
  });

  it('applies error styles when type is error', () => {
    render(<Toast message='Error!' type='error' onDismiss={vi.fn()} />);
    const el = screen.getByText('Error!');
    expect(el.className).toContain('bg-red-600');
  });

  it('applies success styles when type is success', () => {
    render(<Toast message='Done!' type='success' onDismiss={vi.fn()} />);
    const el = screen.getByText('Done!');
    expect(el.className).toContain('bg-green-700');
  });

  it('calls onDismiss after 4 seconds', () => {
    const onDismiss = vi.fn();
    render(<Toast message='Auto dismiss' onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not call onDismiss before 4 seconds', () => {
    const onDismiss = vi.fn();
    render(<Toast message='Wait' onDismiss={onDismiss} />);
    act(() => { vi.advanceTimersByTime(3999); });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
