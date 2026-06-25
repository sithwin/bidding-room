'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getStripe } from '@/lib/stripe';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import useSWR from 'swr';

const STEPS = ['Account', 'Identity', 'Payment', 'Approved'] as const;

function ProgressBar({ step }: { step: number }) {
  return (
    <div className='flex items-center gap-2 mb-10'>
      {STEPS.map((label, i) => (
        <div key={label} className='flex items-center gap-2 flex-1'>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-sans text-xs font-semibold
            ${i + 1 <= step ? 'bg-ink text-paper' : 'border border-[var(--line)] text-mut'}`}>
            {i + 1}
          </div>
          <span className={`font-sans text-xs ${i + 1 <= step ? 'text-ink font-medium' : 'text-mut'}`}>{label}</span>
          {i < STEPS.length - 1 && <div className={`flex-1 h-px ${i + 1 < step ? 'bg-ink' : 'bg-[var(--line)]'}`} />}
        </div>
      ))}
    </div>
  );
}

function Step2Identity({ onDone }: { onDone: () => void }) {
  const { accessToken } = useAuth();
  const [legalName, setLegalName] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!legalName || !dob || !address) {
      setError('Please complete all fields');
      return;
    }
    if (!file) return;
    setError(''); setIsLoading(true);
    const form = new FormData();
    form.append('file', file);
    form.append('legalName', legalName);
    form.append('dob', dob);
    form.append('address', address);
    const res = await fetch('/api/users/identity-document', {
      method: 'POST',
      headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: form,
    });
    setIsLoading(false);
    if (res.ok) onDone();
    else { const d = await res.json() as { error?: string }; setError(d.error ?? 'Upload failed'); }
  }

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='font-serif text-2xl font-semibold text-ink mb-2'>Verify your identity</h2>
        <p className='font-sans text-sm text-mut'>Upload a government-issued ID (passport or driver licence).</p>
      </div>
      <div className='space-y-4 mb-6'>
        <div>
          <label className='block font-sans text-sm font-medium text-ink mb-1'>Full legal name</label>
          <input value={legalName} onChange={e => setLegalName(e.target.value)} type='text' placeholder='As it appears on your ID'
            className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
        </div>
        <div>
          <label className='block font-sans text-sm font-medium text-ink mb-1'>Date of birth</label>
          <input value={dob} onChange={e => setDob(e.target.value)} type='text' placeholder='DD/MM/YYYY'
            className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
        </div>
        <div>
          <label className='block font-sans text-sm font-medium text-ink mb-1'>Residential address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} type='text' placeholder='Street address, suburb, state, postcode'
            className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
        </div>
      </div>
      <div className='space-y-4'>
        <div>
          <label className='block font-sans text-sm font-medium text-ink mb-1'>Government ID</label>
          <input type='file' accept='image/jpeg,image/png,application/pdf' onChange={e => setFile(e.target.files?.[0] ?? null)}
            className='block w-full font-sans text-sm text-mut file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-ink file:text-paper file:font-sans file:text-sm hover:file:bg-ink/90' />
          <p className='font-sans text-xs text-mut mt-1'>JPG, PNG or PDF · max 10 MB · encrypted at rest</p>
        </div>
      </div>
      {error && <p className='font-sans text-xs text-red-600'>{error}</p>}
      <button onClick={submit} disabled={!file || isLoading}
        className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
        {isLoading ? 'Uploading…' : 'Continue'}
      </button>
    </div>
  );
}

function Step3Payment({ onDone }: { onDone: () => void }) {
  const { accessToken } = useAuth();
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!stripe || !elements) return;
    setError(''); setIsLoading(true);

    const res = await fetch('/api/payments/setup-intent', {
      method: 'POST', headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    });
    const { clientSecret, error: serverError } = await res.json() as { clientSecret?: string; error?: string };
    if (!clientSecret) { setError(serverError ?? 'Failed to initialise payment'); setIsLoading(false); return; }

    const card = elements.getElement(CardElement);
    if (!card) return;

    const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, { payment_method: { card } });
    if (stripeError) { setError(stripeError.message ?? 'Card declined'); setIsLoading(false); return; }

    const confirmRes = await fetch('/api/payments/setup-intent/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ setupIntentId: setupIntent!.id }),
    });
    setIsLoading(false);
    if (confirmRes.ok) onDone();
    else setError('Failed to save card. Please try again.');
  }

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='font-serif text-2xl font-semibold text-ink mb-2'>Add a payment method</h2>
        <p className='font-sans text-sm text-mut'>Your card won&apos;t be charged now. We verify it&apos;s valid for future purchases.</p>
      </div>
      <div className='border border-[var(--line)] p-4'>
        <CardElement options={{ style: { base: { fontFamily: 'Mulish, sans-serif', fontSize: '16px' } } }} />
      </div>
      {error && <p className='font-sans text-xs text-red-600'>{error}</p>}
      <button onClick={submit} disabled={isLoading}
        className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 disabled:opacity-60'>
        {isLoading ? 'Processing…' : 'Authorise Card'}
      </button>
    </div>
  );
}

function Step4Approved() {
  const { accessToken } = useAuth();
  const { data } = useSWR(
    accessToken ? '/api/auth/me' : null,
    (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
    { refreshInterval: 10000 },
  );
  const isApproved = data?.verificationStatus === 'APPROVED_BIDDER';

  return (
    <div className='text-center py-8'>
      {isApproved ? (
        <>
          <h2 className='font-serif text-2xl font-semibold text-ink mb-3'>You&apos;re approved!</h2>
          <p className='font-sans text-sm text-mut mb-6'>Happy bidding.</p>
          <a href='/auctions' className='bg-ink text-paper font-sans text-sm font-medium px-8 py-3 hover:bg-ink/90'>Browse Lots</a>
        </>
      ) : (
        <>
          <h2 className='font-serif text-2xl font-semibold text-ink mb-3'>Under review</h2>
          <p className='font-sans text-sm text-mut'>Your identity is under review. We&apos;ll notify you by email once approved.</p>
          <p className='font-sans text-xs text-mut mt-4'>Checking for approval…</p>
        </>
      )}
    </div>
  );
}

export default function RegisterToBidPage() {
  const { user } = useAuth();
  const [step, setStep] = useState(user ? 2 : 1);
  const stripePromise = getStripe();

  return (
    <div className='min-h-screen bg-paper flex items-center justify-center px-6'>
      <div className='w-full max-w-lg py-12'>
        <ProgressBar step={step} />

        {step === 1 && (
          <div className='text-center'>
            <h2 className='font-serif text-2xl font-semibold text-ink mb-6'>Create your account</h2>
            <a href='/account/login' className='bg-ink text-paper font-sans text-sm font-medium px-8 py-3 hover:bg-ink/90 transition-colors'>Sign In or Register</a>
          </div>
        )}

        {step === 2 && <Step2Identity onDone={() => setStep(3)} />}

        {step === 3 && (
          <Elements stripe={stripePromise}>
            <Step3Payment onDone={() => setStep(4)} />
          </Elements>
        )}

        {step === 4 && <Step4Approved />}
      </div>
    </div>
  );
}
