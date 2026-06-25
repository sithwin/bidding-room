'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

interface PhoneOtpInlineProps {
  onVerified: () => void;
  onClose: () => void;
}

export function PhoneOtpInline({ onVerified, onClose }: PhoneOtpInlineProps) {
  const { accessToken } = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function requestCode() {
    setError('');
    setIsLoading(true);
    const res = await fetch('/api/auth/phone/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ phone }),
    });
    setIsLoading(false);
    if (res.ok) {
      setStep('otp');
    } else {
      const d = await res.json() as { error?: string };
      setError(d.error ?? 'Failed to send code');
    }
  }

  async function verifyCode() {
    setError('');
    setIsLoading(true);
    const res = await fetch('/api/auth/phone/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ otp }),
    });
    setIsLoading(false);
    if (res.ok) {
      onVerified();
    } else {
      const d = await res.json() as { error?: string };
      setError(d.error ?? 'Invalid code');
    }
  }

  return (
    <div className='space-y-4'>
      {step === 'phone' ? (
        <>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            type='tel'
            placeholder='+61 400 000 000'
            className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm'
          />
          {error && <p className='font-sans text-xs text-red-600'>{error}</p>}
          <button
            onClick={requestCode}
            disabled={isLoading || !phone}
            className='w-full bg-ink text-paper font-sans text-sm py-3 disabled:opacity-60'
          >
            {isLoading ? 'Sending…' : 'Send Code'}
          </button>
        </>
      ) : (
        <>
          <input
            value={otp}
            onChange={e => setOtp(e.target.value)}
            type='text'
            inputMode='numeric'
            maxLength={6}
            placeholder='000000'
            className='w-full border border-[var(--line)] px-3 py-2 font-sans text-2xl tracking-widest text-center'
          />
          {error && <p className='font-sans text-xs text-red-600'>{error}</p>}
          <button
            onClick={verifyCode}
            disabled={isLoading || otp.length !== 6}
            className='w-full bg-ink text-paper font-sans text-sm py-3 disabled:opacity-60'
          >
            {isLoading ? 'Verifying…' : 'Verify'}
          </button>
        </>
      )}
      <button onClick={onClose} className='w-full font-sans text-sm text-mut hover:text-ink'>
        Cancel
      </button>
    </div>
  );
}
