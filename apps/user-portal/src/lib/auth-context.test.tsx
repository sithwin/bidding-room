import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { accessTokenResponseSchema } from '@carat-room/shared-types';
import { AuthProvider, useAuth } from './auth-context';

// A JWT whose payload decodes to { userId: 'u1', email: 'a@b.com', verificationStatus: 'PHONE_VERIFIED', role: 'BUYER' }
// Fabricated test fixture, not a real credential - literal 'sig' segment, no key ever signed this. NOSONAR
const REFRESHED_JWT = // NOSONAR
  'eyJhbGciOiJSUzI1NiJ9.eyJ1c2VySWQiOiJ1MSIsImVtYWlsIjoiYUBiLmNvbSIsInZlcmlmaWNhdGlvblN0YXR1cyI6IlBIT05FX1ZFUklGSUVEIiwicm9sZSI6IkJVWUVSIn0=.sig';

const refreshFixture = {
  data: { accessToken: REFRESHED_JWT },
} satisfies z.infer<typeof accessTokenResponseSchema>;

/* Silence the logout DELETE fetch in unit tests */
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => refreshFixture,
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
