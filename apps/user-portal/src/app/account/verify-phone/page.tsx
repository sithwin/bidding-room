'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function VerifyPhonePage() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function requestCode() {
    setError(''); setIsLoading(true);
    const res = await fetch('/api/auth/phone/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ phone }),
    });
    setIsLoading(false);
    if (res.ok) setStep('otp');
    else { const d = await res.json() as { error?: string }; setError(d.error ?? 'Failed to send code'); }
  }

  async function verifyCode() {
    setError(''); setIsLoading(true);
    const res = await fetch('/api/auth/phone/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ otp }),
    });
    setIsLoading(false);
    if (res.ok) router.push('/account/register-to-bid');
    else { const d = await res.json() as { error?: string }; setError(d.error ?? 'Invalid code'); }
  }

  return (
    <div className='min-h-screen bg-paper flex items-center justify-center'>
      <div className='w-full max-w-sm px-6'>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-2'>Verify your phone</h1>
        <p className='font-sans text-sm text-mut mb-8'>We&apos;ll send a 6-digit code to confirm your number.</p>

        {step === 'phone' ? (
          <div className='space-y-4'>
            <input value={phone} onChange={e => setPhone(e.target.value)} type='tel' placeholder='+61 400 000 000'
              className='w-full border border-[var(--line)] px-3 py-3 font-sans text-sm' />
            {error && <p className='font-sans text-xs text-red-600'>{error}</p>}
            <button onClick={requestCode} disabled={isLoading || !phone}
              className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
              {isLoading ? 'Sending…' : 'Send Code'}
            </button>
          </div>
        ) : (
          <div className='space-y-4'>
            <p className='font-sans text-sm text-ink'>Enter the 6-digit code sent to {phone}</p>
            <input value={otp} onChange={e => setOtp(e.target.value)} type='text' inputMode='numeric' maxLength={6} placeholder='000000'
              className='w-full border border-[var(--line)] px-3 py-3 font-sans text-2xl tracking-widest text-center' />
            {error && <p className='font-sans text-xs text-red-600'>{error}</p>}
            <button onClick={verifyCode} disabled={isLoading || otp.length !== 6}
              className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
              {isLoading ? 'Verifying…' : 'Verify'}
            </button>
            <button onClick={() => { setStep('phone'); setOtp(''); }} className='w-full font-sans text-sm text-mut hover:text-ink'>
              Change number
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
