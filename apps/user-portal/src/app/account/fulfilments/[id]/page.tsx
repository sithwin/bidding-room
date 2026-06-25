'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { Toast } from '@/components/primitives/toast';
import { useAuth } from '@/lib/auth-context';

const addressSchema = z.object({
  name: z.string().min(2), address1: z.string().min(5), address2: z.string().optional(),
  city: z.string().min(2), postcode: z.string().min(4), country: z.string().min(2),
});
type AddressForm = z.infer<typeof addressSchema>;

const collectSchema = z.object({
  locationId: z.string().min(1, 'Select a location'),
  date:       z.string().min(1, 'Select a date'),
  timeSlot:   z.string().min(1, 'Select a time slot'),
});
type CollectForm = z.infer<typeof collectSchema>;

export default function FulfilmentPage({ params }: { params: { id: string } }) {
  const { accessToken } = useAuth();
  const [option, setOption] = useState<'ship' | 'collect'>('ship');
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  const form = useForm<AddressForm>({ resolver: zodResolver(addressSchema) });
  const collectForm = useForm<CollectForm>({ resolver: zodResolver(collectSchema) });

  async function submitAddress(data: AddressForm) {
    const res = await fetch(`/api/shipping/fulfilments/${params.id}/address`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(data),
    });
    if (res.ok) setToast({ message: "Address saved. We'll be in touch with tracking details.", type: 'success' });
    else setToast({ message: 'Failed to save address.', type: 'error' });
  }

  async function submitCollect(data: CollectForm) {
    const res = await fetch(`/api/shipping/fulfilments/${params.id}/collection-slot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(data),
    });
    if (res.ok) setToast({ message: 'Collection slot booked. We\'ll confirm by email.', type: 'success' });
    else setToast({ message: 'Failed to book slot. Please try again.', type: 'error' });
  }

  return (
    <>
      <Header />
      <AccountShell>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>Delivery Options</h1>
        <div className='max-w-lg'>
          {/* Option selector */}
          <div className='grid grid-cols-2 gap-3 mb-8'>
            {(['ship', 'collect'] as const).map(opt => (
              <button key={opt} onClick={() => setOption(opt)}
                className={`py-4 border font-sans text-sm font-medium transition-colors ${option === opt ? 'border-ink bg-ink text-paper' : 'border-[var(--line)] text-ink hover:bg-cream'}`}>
                {opt === 'ship' ? 'Ship to me' : 'Collect in person'}
              </button>
            ))}
          </div>

          {option === 'ship' && (
            <form onSubmit={form.handleSubmit(submitAddress)} className='space-y-4'>
              {([['name', 'Full name'], ['address1', 'Address line 1'], ['address2', 'Address line 2 (optional)'], ['city', 'City'], ['postcode', 'Postcode'], ['country', 'Country']] as const).map(([field, label]) => (
                <div key={field}>
                  <label className='block font-sans text-sm font-medium text-ink mb-1'>{label}</label>
                  <input {...form.register(field)} className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                  {form.formState.errors[field] && <p className='font-sans text-xs text-red-600 mt-1'>{form.formState.errors[field]?.message}</p>}
                </div>
              ))}
              <button type='submit' disabled={form.formState.isSubmitting}
                className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
                {form.formState.isSubmitting ? 'Saving...' : 'Confirm Shipping Address'}
              </button>
            </form>
          )}

          {option === 'collect' && (
            <form onSubmit={collectForm.handleSubmit(submitCollect)} className='space-y-4'>
              <div>
                <label className='block font-sans text-sm font-medium text-ink mb-1'>Collection location</label>
                <select {...collectForm.register('locationId')}
                  className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm bg-white'>
                  <option value=''>Select location…</option>
                  <option value='sydney-cbd'>Sydney CBD</option>
                  <option value='sydney-east'>Eastern Suburbs</option>
                  <option value='melbourne-cbd'>Melbourne CBD</option>
                </select>
                {collectForm.formState.errors.locationId && (
                  <p className='font-sans text-xs text-red-600 mt-1'>{collectForm.formState.errors.locationId.message}</p>
                )}
              </div>

              <div>
                <label className='block font-sans text-sm font-medium text-ink mb-1'>Date</label>
                <input {...collectForm.register('date')} type='date'
                  min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                  className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                {collectForm.formState.errors.date && (
                  <p className='font-sans text-xs text-red-600 mt-1'>{collectForm.formState.errors.date.message}</p>
                )}
              </div>

              <div>
                <label className='block font-sans text-sm font-medium text-ink mb-1'>Time slot</label>
                <select {...collectForm.register('timeSlot')}
                  className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm bg-white'>
                  <option value=''>Select time…</option>
                  <option value='09:00-11:00'>9:00 am – 11:00 am</option>
                  <option value='11:00-13:00'>11:00 am – 1:00 pm</option>
                  <option value='13:00-15:00'>1:00 pm – 3:00 pm</option>
                  <option value='15:00-17:00'>3:00 pm – 5:00 pm</option>
                </select>
                {collectForm.formState.errors.timeSlot && (
                  <p className='font-sans text-xs text-red-600 mt-1'>{collectForm.formState.errors.timeSlot.message}</p>
                )}
              </div>

              <button type='submit' disabled={collectForm.formState.isSubmitting}
                className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
                {collectForm.formState.isSubmitting ? 'Booking…' : 'Confirm Collection Slot'}
              </button>
            </form>
          )}
        </div>
      </AccountShell>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}