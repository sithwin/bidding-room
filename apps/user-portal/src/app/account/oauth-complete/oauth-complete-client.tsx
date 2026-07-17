'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export function OAuthCompleteClient() {
  const { refreshAccessToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') ?? '/account/dashboard';

  useEffect(() => {
    refreshAccessToken()
      .then((didHydrate) => {
        router.replace(didHydrate ? returnUrl : '/account/login?googleError=failed');
      })
      .catch(() => {
        router.replace('/account/login?googleError=failed');
      });
  }, [refreshAccessToken, router, returnUrl]);

  return (
    <div className='min-h-screen bg-paper flex items-center justify-center'>
      <p className='font-sans text-sm text-mut'>Signing you in…</p>
    </div>
  );
}
