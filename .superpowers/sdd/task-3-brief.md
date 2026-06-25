### Task 3: AuthContext — token memory store

**Files:**
- Create: `apps/user-portal/src/lib/auth-context.tsx`
- Create: `apps/user-portal/src/lib/auth-context.test.tsx`

**Interfaces:**
- Produces: `AuthProvider` (wrap in root layout), `useAuth()` → `{ user, accessToken, login, logout, setAccessToken }`
- `user`: `{ userId, email, verificationStatus, role } | null`
- `login(accessToken, user)` — stores token in memory
- `logout()` — clears token, calls `DELETE /api/auth/refresh` to clear cookie

- [ ] **Step 1: Write failing test**

```typescript
// apps/user-portal/src/lib/auth-context.test.tsx
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth-context';

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
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm turbo test --filter=user-portal
```

- [ ] **Step 3: Implement `apps/user-portal/src/lib/auth-context.tsx`**

```typescript
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
}

const AuthContext = createContext<AuthState | null>(null);

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

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout, setAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Add `AuthProvider` to root layout**

In `apps/user-portal/src/app/layout.tsx`, wrap children:
```typescript
import { AuthProvider } from '@/lib/auth-context';
// inside body:
<AuthProvider>{children}</AuthProvider>
```

- [ ] **Step 5: Run tests**

```bash
pnpm turbo test --filter=user-portal
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/user-portal/src/lib/auth-context.tsx apps/user-portal/src/lib/auth-context.test.tsx apps/user-portal/src/app/layout.tsx
git commit -m "feat(user-portal): AuthContext with in-memory token store"
```

---

