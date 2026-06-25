import { Suspense } from 'react';
import { BrowseClient } from './browse-client';

export default function BrowsePage() {
  return (
    <Suspense fallback={<div className='min-h-screen bg-paper' />}>
      <BrowseClient />
    </Suspense>
  );
}
