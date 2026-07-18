'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/lib/auth-context';
import { parseMe, errorMessage } from '@/lib/user-auth';

const setPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

type SetPasswordForm = z.infer<typeof setPasswordSchema>;

export function SettingsClient() {
  const { accessToken } = useAuth();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);
  const form = useForm<SetPasswordForm>({ resolver: zodResolver(setPasswordSchema) });

  useEffect(() => {
    if (!accessToken) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(res => res.json())
      .then(json => setHasPassword(parseMe(json)?.hasPassword ?? null));
  }, [accessToken]);

  async function handleSetPassword(data: SetPasswordForm) {
    setServerError('');
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ password: data.password }),
      });
      const json = await res.json();
      if (!res.ok) { setServerError(errorMessage(json, 'Unable to set password')); return; }
      setSuccess(true);
    } catch {
      setServerError('Unable to connect. Please try again.');
    }
  }

  return (
    <div className='min-h-screen bg-paper px-8 py-12'>
      <div className='w-full max-w-md mx-auto'>
        <h1 className='font-serif text-2xl font-semibold text-ink mb-8'>Account settings</h1>

        {hasPassword === false && !success && (
          <form onSubmit={form.handleSubmit(handleSetPassword)} className='space-y-4'>
            <h2 className='font-sans text-sm font-medium text-ink'>Set a password</h2>
            <p className='font-sans text-xs text-mut'>Add a password so you can sign in even without Google.</p>
            <div>
              <label className='block font-sans text-sm font-medium text-ink mb-1'>Password</label>
              <input {...form.register('password')} type='password' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
              {form.formState.errors.password && <p className='font-sans text-xs text-red-600 mt-1'>{form.formState.errors.password.message}</p>}
            </div>
            <div>
              <label className='block font-sans text-sm font-medium text-ink mb-1'>Confirm password</label>
              <input {...form.register('confirmPassword')} type='password' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
              {form.formState.errors.confirmPassword && <p className='font-sans text-xs text-red-600 mt-1'>{form.formState.errors.confirmPassword.message}</p>}
            </div>
            {serverError && <p className='font-sans text-xs text-red-600'>{serverError}</p>}
            <button type='submit' disabled={form.formState.isSubmitting}
              className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 transition-colors disabled:opacity-60'>
              {form.formState.isSubmitting ? 'Saving…' : 'Set password'}
            </button>
          </form>
        )}

        {success && <p className='font-sans text-sm text-ink'>Password set. You can now sign in with either Google or your password.</p>}
      </div>
    </div>
  );
}
