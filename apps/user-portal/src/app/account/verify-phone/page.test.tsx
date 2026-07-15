import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

import VerifyPhonePage from './page';

describe('VerifyPhonePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('sends the OTP as { code } to match the backend contract, not { otp }', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { message: 'sent' } }) } as Response) // phone request
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { message: 'verified' } }) } as Response); // otp verify

    render(<VerifyPhonePage />);
    fireEvent.change(screen.getByPlaceholderText('+61 400 000 000'), { target: { value: '+61400000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Code' }));

    await waitFor(() => screen.getByPlaceholderText('000000'));
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/account/register-to-bid');
    });

    const verifyCall = vi.mocked(fetch).mock.calls.find(call => call[0] === '/api/auth/phone/verify');
    expect(verifyCall).toBeDefined();
    const body = JSON.parse(verifyCall![1]!.body as string);
    expect(body).toEqual({ code: '123456' });
    expect(body).not.toHaveProperty('otp');
  });

  it('shows a decrementing attempt count on invalid-code responses without locking out on the first try', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { message: 'sent' } }) } as Response) // phone request
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: 'code is required' } }) } as Response); // otp verify fails

    render(<VerifyPhonePage />);
    fireEvent.change(screen.getByPlaceholderText('+61 400 000 000'), { target: { value: '+61400000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Code' }));

    await waitFor(() => screen.getByPlaceholderText('000000'));
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid code. 2 attempts remaining.')).toBeInTheDocument();
    });
  });
});
