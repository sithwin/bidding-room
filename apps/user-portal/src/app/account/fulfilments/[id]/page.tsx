'use client';
import { use, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { chooseShipRequestSchema, chooseCollectRequestSchema } from '@carat-room/shared-types';
import { Header } from '@/components/layout/header';
import { AccountShell } from '@/components/layout/account-shell';
import { Toast } from '@/components/primitives/toast';
import { useAuth } from '@/lib/auth-context';
import { parseFulfilmentSuccess } from '@/lib/shipping';
import { errorMessage } from '@/lib/user-auth';

// Form field names mirror the shipping router's chooseShip/chooseCollect
// request bodies (fullName/line1/line2/city/state/postcode/country and
// location/date/timeSlot) — the router's names win over the old
// name/address1/address2/locationId naming this page used before D5 was fixed.
const addressSchema = z.object({
  fullName: z.string().min(2), line1: z.string().min(5), line2: z.string().optional(),
  city: z.string().min(2), state: z.string().optional(), postcode: z.string().min(4), country: z.string().min(2),
});
type AddressForm = z.infer<typeof addressSchema>;

const collectSchema = z.object({
  location: z.string().min(1, 'Select a location'),
  date:     z.string().min(1, 'Select a date'),
  timeSlot: z.string().min(1, 'Select a time slot'),
});
type CollectForm = z.infer<typeof collectSchema>;

export default function FulfilmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { accessToken } = useAuth();
  const [option, setOption] = useState<'ship' | 'collect'>('ship');
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  const form = useForm<AddressForm>({ resolver: zodResolver(addressSchema) });
  const collectForm = useForm<CollectForm>({ resolver: zodResolver(collectSchema) });

  async function submitAddress(data: AddressForm) {
    const payload = chooseShipRequestSchema.parse({
      fullName: data.fullName, line1: data.line1, line2: data.line2 || undefined,
      city: data.city, state: data.state || undefined, postcode: data.postcode, country: data.country,
    });
    const res = await fetch(`/api/shipping/fulfilments/${id}/address`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (parseFulfilmentSuccess(json)) {
      setToast({ message: "Address saved. We'll be in touch with tracking details.", type: 'success' });
    } else {
      setToast({ message: errorMessage(json, 'Unable to save your choice.'), type: 'error' });
    }
  }

  async function submitCollect(data: CollectForm) {
    const payload = chooseCollectRequestSchema.parse({
      location: data.location, date: data.date, timeSlot: data.timeSlot,
    });
    const res = await fetch(`/api/shipping/fulfilments/${id}/collection-slot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (parseFulfilmentSuccess(json)) {
      setToast({ message: 'Collection slot booked. We\'ll confirm by email.', type: 'success' });
    } else {
      setToast({ message: errorMessage(json, 'Unable to save your choice.'), type: 'error' });
    }
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
              {([['fullName', 'Full name'], ['line1', 'Address line 1'], ['line2', 'Address line 2 (optional)'], ['city', 'City'], ['state', 'State (optional)'], ['postcode', 'Postcode'], ['country', 'Country']] as const).map(([field, label]) => (
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
                <select {...collectForm.register('location')}
                  className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm bg-white'>
                  <option value=''>Select location…</option>
                  <option value='sydney-cbd'>Sydney CBD</option>
                  <option value='sydney-east'>Eastern Suburbs</option>
                  <option value='melbourne-cbd'>Melbourne CBD</option>
                </select>
                {collectForm.formState.errors.location && (
                  <p className='font-sans text-xs text-red-600 mt-1'>{collectForm.formState.errors.location.message}</p>
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