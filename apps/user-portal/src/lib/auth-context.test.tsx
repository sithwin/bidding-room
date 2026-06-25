import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';

/* Silence the logout DELETE fetch in unit tests */
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ accessToken: 'new-tok', user: { userId: 'u1', email: 'a@b.com', verificationStatus: 'PHONE_VERIFIED', role: 'BUYER' } }),
  }));
});

function TestConsumer() {
  const { user, login, logout, refreshAccessToken } = useAuth();
  return (
    <div>
      <span data-testid='user'>{user ? user.email : 'none'}</span>
      <span data-testid='status'>{user ? user.verificationStatus : 'none'}</span>
      <button onClick={() => login('tok123', { userId: 'u1', email: 'a@b.com', verificationStatus: 'APPROVED_BIDDER', role: 'BUYER' })}>login</button>
      <button onClick={logout}>logout</button>
      <button onClick={() => void refreshAccessToken()}>refresh</button>
    </div>
  );
}

describe('AuthContext', () => {
  it('starts with no user', () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('stores user after login', async () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await act(async () => { screen.getByText('login').click(); });
    expect(screen.getByTestId('user')).toHaveTextContent('a@b.com');
  });

  it('clears user after logout', async () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await act(async () => { screen.getByText('login').click(); });
    await act(async () => { screen.getByText('logout').click(); });
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('updates user and token after refreshAccessToken', async () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await act(async () => { screen.getByText('login').click(); });
    expect(screen.getByTestId('status')).toHaveTextContent('APPROVED_BIDDER');
    await act(async () => { screen.getByText('refresh').click(); });
    expect(screen.getByTestId('status')).toHaveTextContent('PHONE_VERIFIED');
  });

  it('throws when useAuth is called outside AuthProvider', () => {
    /* Suppress the expected React error boundary console output */
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bare() {
      useAuth();
      return null;
    }
    expect(() => render(<Bare />)).toThrow('useAuth must be used within AuthProvider');
    consoleError.mockRestore();
  });
});
