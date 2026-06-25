import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhoneOtpInline } from './phone-otp-inline';

// Mock useAuth
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

describe('PhoneOtpInline', () => {
  const onVerified = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders phone input step by default', () => {
    render(<PhoneOtpInline onVerified={onVerified} onClose={onClose} />);
    expect(screen.getByPlaceholderText('+61 400 000 000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Code' })).toBeInTheDocument();
  });

  it('disables Send Code button when phone is empty', () => {
    render(<PhoneOtpInline onVerified={onVerified} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Send Code' })).toBeDisabled();
  });

  it('enables Send Code button when phone is entered', () => {
    render(<PhoneOtpInline onVerified={onVerified} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('+61 400 000 000'), { target: { value: '+61400000000' } });
    expect(screen.getByRole('button', { name: 'Send Code' })).not.toBeDisabled();
  });

  it('transitions to OTP step after successful phone request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);

    render(<PhoneOtpInline onVerified={onVerified} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('+61 400 000 000'), { target: { value: '+61400000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Code' }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument();
  });

  it('shows error message when phone request fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid phone number' }),
    } as Response);

    render(<PhoneOtpInline onVerified={onVerified} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('+61 400 000 000'), { target: { value: '+61400000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Code' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid phone number')).toBeInTheDocument();
    });
  });

  it('disables Verify button when OTP has fewer than 6 digits', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);

    render(<PhoneOtpInline onVerified={onVerified} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('+61 400 000 000'), { target: { value: '+61400000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Code' }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123' } });
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
  });

  it('calls onVerified after successful OTP verification', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true } as Response) // phone request
      .mockResolvedValueOnce({ ok: true } as Response); // otp verify

    render(<PhoneOtpInline onVerified={onVerified} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('+61 400 000 000'), { target: { value: '+61400000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Code' }));

    await waitFor(() => screen.getByPlaceholderText('000000'));
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error when OTP verification fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true } as Response) // phone request
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid code' }),
      } as Response); // otp verify

    render(<PhoneOtpInline onVerified={onVerified} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('+61 400 000 000'), { target: { value: '+61400000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Code' }));

    await waitFor(() => screen.getByPlaceholderText('000000'));
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid code')).toBeInTheDocument();
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    render(<PhoneOtpInline onVerified={onVerified} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
