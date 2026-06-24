'use client';
import { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
  isLive?: boolean;
}

export function AppShell({ children, isLive = false }: AppShellProps) {
  return (
    <div className={isLive ? 'theme-live min-h-screen' : 'min-h-screen bg-canvas'}>
      {children}
    </div>
  );
}
