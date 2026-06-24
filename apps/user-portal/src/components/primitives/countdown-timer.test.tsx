import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CountdownTimer } from './countdown-timer';

describe('CountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders formatted time with hours when more than 1 hour remains', () => {
    const endAt = new Date(Date.now() + 2 * 3600 * 1000 + 5 * 60 * 1000 + 30 * 1000).toISOString();
    render(<CountdownTimer endAt={endAt} />);
    expect(screen.getByText('2:05:30')).toBeInTheDocument();
  });

  it('renders formatted time without hours when less than 1 hour remains', () => {
    const endAt = new Date(Date.now() + 10 * 60 * 1000 + 5 * 1000).toISOString();
    render(<CountdownTimer endAt={endAt} />);
    expect(screen.getByText('10:05')).toBeInTheDocument();
  });

  it('shows 0:00:00 when time has passed', () => {
    const endAt = new Date(Date.now() - 1000).toISOString();
    render(<CountdownTimer endAt={endAt} />);
    expect(screen.getByText('0:00:00')).toBeInTheDocument();
  });

  it('applies urgent styling when 3 minutes or less remain', () => {
    const endAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    render(<CountdownTimer endAt={endAt} />);
    const span = screen.getByText('2:00');
    expect(span.className).toContain('text-red-600');
  });

  it('applies normal styling when more than 3 minutes remain', () => {
    const endAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    render(<CountdownTimer endAt={endAt} />);
    const span = screen.getByText('10:00');
    expect(span.className).toContain('text-ink');
    expect(span.className).not.toContain('text-red-600');
  });

  it('counts down over time', () => {
    const endAt = new Date(Date.now() + 65 * 1000).toISOString();
    render(<CountdownTimer endAt={endAt} />);
    expect(screen.getByText('1:05')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('1:00')).toBeInTheDocument();
  });
});
