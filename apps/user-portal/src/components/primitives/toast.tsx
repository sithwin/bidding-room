'use client';
import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'info' | 'error' | 'success';
  onDismiss: () => void;
}

export function Toast({ message, type = 'info', onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const colours = { info: 'bg-ink text-paper', error: 'bg-red-600 text-paper', success: 'bg-green-700 text-paper' };
  return (
    <div className={`fixed top-4 right-4 z-50 px-5 py-3 font-sans text-sm font-medium shadow-lg ${colours[type]}`}>
      {message}
    </div>
  );
}
