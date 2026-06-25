'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/lib/auth-context';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
const registerSchema = z.object({ email: z.string().email(), password: z.string().min(8), confirmPassword: z.string() })
  .refine(d => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function LoginPage() {
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [serverError, setServerError] = useState('');
  const [registered, setRegistered] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') ?? '/account/dashboard';

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  async function handleLogin(data: LoginForm) {
    setServerError('');
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const json = await res.json() as { accessToken?: string; user?: { userId: string; email: string; verificationStatus: string; role: string }; error?: string };
    if (!res.ok) { setServerError(json.error ?? 'Sign in failed'); return; }
    login(json.accessToken!, json.user!);
    router.push(returnUrl);
  }

  async function handleRegister(data: RegisterForm) {
    setServerError('');
    const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.email, password: data.password }) });
    const json = await res.json() as { error?: string };
    if (!res.ok) { setServerError(json.error ?? 'Registration failed'); return; }
    setRegistered(true);
  }

  return (
    <div className='min-h-screen flex'>
      {/* Left panel */}
      <div className='hidden md:flex w-1/2 bg-ink text-paper flex-col justify-center px-16'>
        <p className='font-serif text-4xl font-semibold mb-6 leading-tight'>The Carat Room</p>
        <p className='font-sans text-lg text-mut mb-8'>Bid with confidence on the finest collections in Australia.</p>
        <ul className='font-sans text-sm text-mut space-y-2'>
          <li>Authenticity guaranteed</li>
          <li>Insured shipping worldwide</li>
          <li>Expert valuations</li>
        </ul>
      </div>

      {/* Right panel */}
      <div className='flex-1 flex items-center justify-center px-8 bg-paper'>
        <div className='w-full max-w-md'>
          {registered ? (
            <div className='text-center'>
              <h2 className='font-serif text-2xl font-semibold text-ink mb-3'>Check your email</h2>
              <p className='font-sans text-sm text-mut'>We&apos;ve sent a verification link to your inbox.</p>
            </div>
          ) : (
            <>
              <div className='flex border-b border-[var(--line)] mb-8'>
                {(['signin', 'register'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 pb-3 font-sans text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-ink text-ink' : 'text-mut hover:text-ink'}`}>
                    {t === 'signin' ? 'Sign In' : 'Create Account'}
                  </button>
                ))}
              </div>

              {tab === 'signin' ? (
                <form onSubmit={loginForm.handleSubmit(handleLogin)} className='space-y-4'>
                  <div>
                    <label className='block font-sans text-sm font-medium text-ink mb-1'>Email</label>
                    <input {...loginForm.register('email')} type='email' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                    {loginForm.formState.errors.email && <p className='font-sans text-xs text-red-600 mt-1'>{loginForm.formState.errors.email.message}</p>}
                  </div>
                  <div>
                    <label className='block font-sans text-sm font-medium text-ink mb-1'>Password</label>
                    <input {...loginForm.register('password')} type='password' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                    {loginForm.formState.errors.password && <p className='font-sans text-xs text-red-600 mt-1'>{loginForm.formState.errors.password.message}</p>}
                  </div>
                  {serverError && <p className='font-sans text-xs text-red-600'>{serverError}</p>}
                  <button type='submit' disabled={loginForm.formState.isSubmitting}
                    className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 transition-colors disabled:opacity-60'>
                    {loginForm.formState.isSubmitting ? 'Signing in…' : 'Sign In'}
                  </button>
                </form>
              ) : (
                <form onSubmit={registerForm.handleSubmit(handleRegister)} className='space-y-4'>
                  <div>
                    <label className='block font-sans text-sm font-medium text-ink mb-1'>Email</label>
                    <input {...registerForm.register('email')} type='email' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                    {registerForm.formState.errors.email && <p className='font-sans text-xs text-red-600 mt-1'>{registerForm.formState.errors.email.message}</p>}
                  </div>
                  <div>
                    <label className='block font-sans text-sm font-medium text-ink mb-1'>Password</label>
                    <input {...registerForm.register('password')} type='password' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                  </div>
                  <div>
                    <label className='block font-sans text-sm font-medium text-ink mb-1'>Confirm Password</label>
                    <input {...registerForm.register('confirmPassword')} type='password' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                    {registerForm.formState.errors.confirmPassword && <p className='font-sans text-xs text-red-600 mt-1'>{registerForm.formState.errors.confirmPassword.message}</p>}
                  </div>
                  {serverError && <p className='font-sans text-xs text-red-600'>{serverError}</p>}
                  <button type='submit' disabled={registerForm.formState.isSubmitting}
                    className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 transition-colors disabled:opacity-60'>
                    {registerForm.formState.isSubmitting ? 'Creating account…' : 'Create Account'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
