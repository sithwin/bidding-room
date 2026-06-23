import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './confirm-dialog';
import { Button } from '@/components/ui/button';

describe('ConfirmDialog', () => {
  it('should_callOnConfirm_when_confirmButtonClicked', async () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        trigger={<Button>Delete</Button>}
        title='Delete lot?'
        description='This action cannot be undone.'
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
