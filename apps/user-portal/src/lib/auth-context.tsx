'use client';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { parseAccessToken } from '@/lib/user-auth';
import { decodeJwtPayload } from '@/lib/jwt';
import type { JwtPayload } from '@carat-room/shared-auth';

interface AuthState {
  user: JwtPayload | null;
  accessToken: string | null;
  login: (token: string, user: JwtPayload) => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
  refreshAccessToken: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<JwtPayload | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);

  const login = useCallback((token: string, u: JwtPayload) => {
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
    const accessToken = parseAccessToken(await res.json());
    if (!accessToken) return;
    const payload = decodeJwtPayload(accessToken);
    if (!payload) return;
    setAccessTokenState(accessToken);
    setUser(payload);
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
