'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Header } from '@/components/layout/header';

const schema = z.object({
  category:    z.string().min(1, 'Select a category'),
  artistMaker: z.string().optional(),
  description: z.string().min(20, 'Please provide at least 20 characters'),
  name:        z.string().min(2),
  email:       z.string().email(),
});
type FormData = z.infer<typeof schema>;

const CATEGORIES = ['Jewellery', 'Watches', 'Designer Handbags', 'Art', 'Collectibles', 'Other'];

export default function SellPage() {
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  async function uploadPhoto(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/enquiries/valuation/upload', { method: 'POST', body: formData });
    if (!res.ok) { setUploadError('Upload failed. Please try again.'); return; }
    const { key } = await res.json() as { key: string };
    setPhotoKeys(prev => [...prev, key]);
  }

  async function submit(data: FormData) {
    const res = await fetch('/api/enquiries/valuation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, photoKeys }),
    });
    if (res.ok) setSubmitted(true);
    else form.setError('root', { message: 'Submission failed. Please try again.' });
  }

  return (
    <>
      <Header />
      <div className='min-h-screen flex'>
        {/* Left panel */}
        <div className='hidden md:flex w-2/5 bg-ink text-paper flex-col justify-center px-16'>
          <h1 className='font-serif text-4xl font-semibold mb-6 leading-tight'>Sell with The Carat Room</h1>
          <ul className='font-sans text-sm text-mut space-y-4'>
            <li>No upfront fees</li>
            <li>Global bidder reach</li>
            <li>Insured collection &amp; storage</li>
          </ul>
        </div>

        {/* Form */}
        <div className='flex-1 bg-paper px-8 py-16 flex items-start justify-center'>
          {submitted ? (
            <div className='text-center max-w-sm'>
              <h2 className='font-serif text-2xl font-semibold text-ink mb-3'>Request received</h2>
              <p className='font-sans text-sm text-mut'>We&apos;ll be in touch within two business days.</p>
            </div>
          ) : (
            <form onSubmit={form.handleSubmit(submit)} className='w-full max-w-md space-y-5'>
              <div>
                <label className='block font-sans text-sm font-medium text-ink mb-1'>Category</label>
                <select {...form.register('category')} className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm bg-white'>
                  <option value=''>Select...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {form.formState.errors.category && <p className='font-sans text-xs text-red-600 mt-1'>{form.formState.errors.category.message}</p>}
              </div>

              <div>
                <label className='block font-sans text-sm font-medium text-ink mb-1'>Artist / Maker (optional)</label>
                <input {...form.register('artistMaker')} className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
              </div>

              <div>
                <label className='block font-sans text-sm font-medium text-ink mb-1'>Description</label>
                <textarea {...form.register('description')} rows={4}
                  placeholder='Medium, dimensions, provenance, condition...'
                  className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm resize-none' />
                {form.formState.errors.description && <p className='font-sans text-xs text-red-600 mt-1'>{form.formState.errors.description.message}</p>}
              </div>

              <div>
                <label className='block font-sans text-sm font-medium text-ink mb-1'>Photographs (up to 6)</label>
                <input type='file' accept='image/jpeg,image/png,application/pdf' multiple disabled={photoKeys.length >= 6}
                  onChange={e => Array.from(e.target.files ?? []).forEach(uploadPhoto)}
                  className='block w-full font-sans text-sm text-mut file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-ink file:text-paper hover:file:bg-ink/90' />
                {uploadError && <p className='font-sans text-xs text-red-600 mt-1'>{uploadError}</p>}
                {photoKeys.length > 0 && <p className='font-sans text-xs text-mut mt-1'>{photoKeys.length} photo(s) uploaded</p>}
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='block font-sans text-sm font-medium text-ink mb-1'>Name</label>
                  <input {...form.register('name')} className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                </div>
                <div>
                  <label className='block font-sans text-sm font-medium text-ink mb-1'>Email</label>
                  <input {...form.register('email')} type='email' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                </div>
              </div>

              {form.formState.errors.root && <p className='font-sans text-xs text-red-600'>{form.formState.errors.root.message}</p>}

              <button type='submit' disabled={form.formState.isSubmitting}
                className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
                {form.formState.isSubmitting ? 'Submitting...' : 'Request Valuation'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}