import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginClient } from './login-client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ login: vi.fn(), user: null, accessToken: null }),
}));

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
    <button type='button' onClick={() => onSuccess('mock-turnstile-token')}>solve-captcha</button>
  ),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

async function fillRegisterForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
  fireEvent.change(screen.getAllByLabelText('Email')[0], { target: { value: 'jane@example.com' } });
  fireEvent.change(screen.getAllByLabelText('Password')[0], { target: { value: 'secret123' } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'secret123' } });
}

describe('LoginClient human verification', () => {
  it('should_disableSubmit_when_noTurnstileToken', () => {
    render(<LoginClient />);

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(screen.getByRole('button', { name: 'Create Account', hidden: false })).toBeDefined();
    const submit = screen.getAllByRole('button').find(b => b.textContent === 'Create Account' && b.getAttribute('type') === 'submit');
    expect(submit?.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Please complete the verification')).toBeDefined();
  });

  it('should_sendTurnstileToken_when_registerSubmitted', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 201 }));
    render(<LoginClient />);
    await fillRegisterForm();

    fireEvent.click(screen.getByRole('button', { name: 'solve-captcha' }));
    const submit = screen.getAllByRole('button').find(b => b.textContent === 'Create Account' && b.getAttribute('type') === 'submit')!;
    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toMatchObject({
      email: 'jane@example.com',
      password: 'secret123',
      turnstileToken: 'mock-turnstile-token',
    });
  });

  it('should_renderServerError_when_captchaFailedReturned', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'CAPTCHA_FAILED', message: 'Human verification failed. Please try again.' } }),
      { status: 400 },
    ));
    render(<LoginClient />);
    await fillRegisterForm();

    fireEvent.click(screen.getByRole('button', { name: 'solve-captcha' }));
    const submit = screen.getAllByRole('button').find(b => b.textContent === 'Create Account' && b.getAttribute('type') === 'submit')!;
    fireEvent.click(submit);

    await waitFor(() =>
      expect(screen.getByText('Human verification failed. Please try again.')).toBeDefined(),
    );
  });
});
