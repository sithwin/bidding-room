'use client';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface AuthUser {
  userId: string;
  email: string;
  verificationStatus: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
  refreshAccessToken: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);

  const login = useCallback((token: string, u: AuthUser) => {
    setAccessTokenState(token);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    setAccessTokenState(null);
    setUser(null);
    await fetch('/api/auth/refresh', { method: 'DELETE' });
  }, []);

  const setAccessToken = useCallback((token: string) => {
    setAccessTokenState(token);
  }, []);

  const refreshAccessToken = useCallback(async () => {
    const res = await fetch('/api/auth/refresh', { method: 'GET' });
    if (!res.ok) return;
    const data = (await res.json()) as { accessToken: string; user: AuthUser };
    setAccessTokenState(data.accessToken);
    setUser(data.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout, setAccessToken, refreshAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
