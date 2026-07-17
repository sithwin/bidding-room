import { Suspense } from 'react';
import { SettingsClient } from './settings-client';

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className='min-h-screen bg-paper' />}>
      <SettingsClient />
    </Suspense>
  );
}
