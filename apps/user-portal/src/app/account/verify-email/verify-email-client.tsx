'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const userId = searchParams.get('userId');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [resent, setResent] = useState(false);

  async function resendEmail() {
    await fetch('/api/auth/resend-verification', { method: 'POST' });
    setResent(true);
  }

  useEffect(() => {
    if (!token || !userId) { setStatus('error'); return; }
    fetch(`/api/auth/verify-email?token=${token}&userId=${userId}`, { method: 'POST' })
      .then(r => {
        if (r.ok) { setStatus('success'); setTimeout(() => router.push('/account/login'), 3000); }
        else setStatus('error');
      })
      .catch(() => setStatus('error'));
  }, [token, router]);

  return (
    <div className='min-h-screen bg-paper flex items-center justify-center'>
      <div className='max-w-md text-center px-6'>
        {status === 'loading' && <p className='font-sans text-mut'>Verifying your email…</p>}
        {status === 'success' && (
          <>
            <h1 className='font-serif text-2xl font-semibold text-ink mb-3'>Email verified</h1>
            <p className='font-sans text-sm text-mut'>Redirecting you to sign in…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className='font-serif text-2xl font-semibold text-ink mb-3'>Link expired</h1>
            <p className='font-sans text-sm text-mut mb-4'>This verification link has expired or already been used.</p>
            {resent ? (
              <p className='font-sans text-sm text-green-700'>New link sent — check your inbox.</p>
            ) : (
              <button onClick={resendEmail} className='font-sans text-sm text-ink underline'>Resend verification email</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
