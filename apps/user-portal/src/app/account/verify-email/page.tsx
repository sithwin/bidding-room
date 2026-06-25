import { Suspense } from 'react';
import { VerifyEmailClient } from './verify-email-client';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className='min-h-screen bg-paper flex items-center justify-center'><p className='font-sans text-mut'>Verifying your email…</p></div>}>
      <VerifyEmailClient />
    </Suspense>
  );
}
