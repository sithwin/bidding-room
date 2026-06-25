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

export default function FulfilmentPage({ params }: { params: { id: string } }) {
  const { accessToken } = useAuth();
  const [option, setOption] = useState<'ship' | 'collect'>('ship');
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  const form = useForm<AddressForm>({ resolver: zodResolver(addressSchema) });

  async function submitAddress(data: AddressForm) {
    const res = await fetch(`/api/shipping/fulfilments/${params.id}/address`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(data),
    });
    if (res.ok) setToast({ message: "Address saved. We'll be in touch with tracking details.", type: 'success' });
    else setToast({ message: 'Failed to save address.', type: 'error' });
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
            <div className='text-center py-8'>
              <p className='font-sans text-sm text-mut'>Collection slot booking coming soon. Please contact us at collections@caratroom.com.au</p>
            </div>
          )}
        </div>
      </AccountShell>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}