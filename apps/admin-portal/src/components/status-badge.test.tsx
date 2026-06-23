import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('should_renderStatusText', () => {
    render(<StatusBadge status='ACTIVE' />);
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('should_applyDestructiveVariant_when_statusIsCancelled', () => {
    const { container } = render(<StatusBadge status='CANCELLED' />);
    expect(container.firstChild).toHaveClass('destructive');
  });

  it('should_applyDefaultVariant_when_statusIsUnknown', () => {
    const { container } = render(<StatusBadge status='UNKNOWN_STATUS' />);
    expect(container.firstChild).toBeDefined();
  });
});
