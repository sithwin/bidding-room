import { Suspense } from 'react';
import { OAuthCompleteClient } from './oauth-complete-client';

export default function OAuthCompletePage() {
  return (
    <Suspense fallback={<div className='min-h-screen bg-paper' />}>
      <OAuthCompleteClient />
    </Suspense>
  );
}
