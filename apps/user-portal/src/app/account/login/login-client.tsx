'use client';
import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useAuth } from '@/lib/auth-context';
import { parseAccessToken, errorMessage } from '@/lib/user-auth';
import { decodeJwtPayload } from '@/lib/jwt';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
const registerSchema = z.object({ email: z.string().email(), password: z.string().min(8, 'Password must be at least 8 characters'), confirmPassword: z.string() })
  .refine(d => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export function LoginClient() {
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [serverError, setServerError] = useState('');
  const [registered, setRegistered] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') ?? '/account/dashboard';

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  function resetTurnstile() {
    setTurnstileToken('');
    turnstileRef.current?.reset();
  }

  async function handleLogin(data: LoginForm) {
    setServerError('');
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, turnstileToken }) });
      const json = await res.json();
      if (!res.ok) { setServerError(errorMessage(json, 'Sign in failed')); resetTurnstile(); return; }
      const accessToken = parseAccessToken(json);
      const payload = accessToken ? decodeJwtPayload(accessToken) : null;
      if (!accessToken || !payload) { setServerError('Sign in failed'); resetTurnstile(); return; }
      login(accessToken, payload);
      router.push(returnUrl);
    } catch {
      setServerError('Unable to connect. Please try again.');
      resetTurnstile();
    }
  }

  async function handleRegister(data: RegisterForm) {
    setServerError('');
    try {
      const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.email, password: data.password, turnstileToken }) });
      const json = await res.json();
      if (!res.ok) { setServerError(errorMessage(json, 'Registration failed')); resetTurnstile(); return; }
      setRegistered(true);
    } catch {
      setServerError('Unable to connect. Please try again.');
      resetTurnstile();
    }
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
                  <button key={t} onClick={() => { setTab(t); resetTurnstile(); }}
                    className={`flex-1 pb-3 font-sans text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-ink text-ink' : 'text-mut hover:text-ink'}`}>
                    {t === 'signin' ? 'Sign In' : 'Create Account'}
                  </button>
                ))}
              </div>

              {tab === 'signin' ? (
                <form onSubmit={loginForm.handleSubmit(handleLogin)} className='space-y-4'>
                  <div>
                    <label htmlFor='signin-email' className='block font-sans text-sm font-medium text-ink mb-1'>Email</label>
                    <input {...loginForm.register('email')} id='signin-email' type='email' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                    {loginForm.formState.errors.email && <p className='font-sans text-xs text-red-600 mt-1'>{loginForm.formState.errors.email.message}</p>}
                  </div>
                  <div>
                    <label htmlFor='signin-password' className='block font-sans text-sm font-medium text-ink mb-1'>Password</label>
                    <input {...loginForm.register('password')} id='signin-password' type='password' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                    {loginForm.formState.errors.password && <p className='font-sans text-xs text-red-600 mt-1'>{loginForm.formState.errors.password.message}</p>}
                  </div>
                  <div className='flex justify-end'>
                    <button type='button' className='font-sans text-xs text-mut hover:text-ink'>Forgot password?</button>
                  </div>
                  {serverError && <p className='font-sans text-xs text-red-600'>{serverError}</p>}
                  <div>
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={TURNSTILE_SITE_KEY}
                      onSuccess={setTurnstileToken}
                      onExpire={() => setTurnstileToken('')}
                    />
                    {!turnstileToken && <p className='font-sans text-xs text-mut mt-1'>Please complete the verification</p>}
                  </div>
                  <button type='submit' disabled={loginForm.formState.isSubmitting || !turnstileToken}
                    aria-label='Submit sign in'
                    className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 transition-colors disabled:opacity-60'>
                    {loginForm.formState.isSubmitting ? 'Signing in…' : 'Sign In'}
                  </button>
                  <p className='font-sans text-xs text-center text-mut mt-4'>
                    New? <button type='button' onClick={() => setTab('register')} className='text-ink underline'>Create account</button>
                  </p>
                </form>
              ) : (
                <form onSubmit={registerForm.handleSubmit(handleRegister)} className='space-y-4'>
                  <div>
                    <label htmlFor='register-email' className='block font-sans text-sm font-medium text-ink mb-1'>Email</label>
                    <input {...registerForm.register('email')} id='register-email' type='email' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                    {registerForm.formState.errors.email && <p className='font-sans text-xs text-red-600 mt-1'>{registerForm.formState.errors.email.message}</p>}
                  </div>
                  <div>
                    <label htmlFor='register-password' className='block font-sans text-sm font-medium text-ink mb-1'>Password</label>
                    <input {...registerForm.register('password')} id='register-password' type='password' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                    {registerForm.formState.errors.password && <p className='font-sans text-xs text-red-600 mt-1'>{registerForm.formState.errors.password.message}</p>}
                  </div>
                  <div>
                    <label htmlFor='register-confirm-password' className='block font-sans text-sm font-medium text-ink mb-1'>Confirm Password</label>
                    <input {...registerForm.register('confirmPassword')} id='register-confirm-password' type='password' className='w-full border border-[var(--line)] px-3 py-2 font-sans text-sm' />
                    {registerForm.formState.errors.confirmPassword && <p className='font-sans text-xs text-red-600 mt-1'>{registerForm.formState.errors.confirmPassword.message}</p>}
                  </div>
                  {serverError && <p className='font-sans text-xs text-red-600'>{serverError}</p>}
                  <div>
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={TURNSTILE_SITE_KEY}
                      onSuccess={setTurnstileToken}
                      onExpire={() => setTurnstileToken('')}
                    />
                    {!turnstileToken && <p className='font-sans text-xs text-mut mt-1'>Please complete the verification</p>}
                  </div>
                  <button type='submit' disabled={registerForm.formState.isSubmitting || !turnstileToken}
                    aria-label='Submit registration'
                    className='w-full bg-ink text-paper font-sans text-sm font-medium py-3 hover:bg-ink/90 transition-colors disabled:opacity-60'>
                    {registerForm.formState.isSubmitting ? 'Creating account…' : 'Create Account'}
                  </button>
                  <p className='font-sans text-xs text-center text-mut mt-4'>
                    Already have an account? <button type='button' onClick={() => setTab('signin')} className='text-ink underline'>Sign in</button>
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
