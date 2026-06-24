import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';

/* Silence the logout DELETE fetch in unit tests */
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

function TestConsumer() {
  const { user, login, logout } = useAuth();
  return (
    <div>
      <span data-testid='user'>{user ? user.email : 'none'}</span>
      <button onClick={() => login('tok123', { userId: 'u1', email: 'a@b.com', verificationStatus: 'APPROVED_BIDDER', role: 'BUYER' })}>login</button>
      <button onClick={logout}>logout</button>
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
