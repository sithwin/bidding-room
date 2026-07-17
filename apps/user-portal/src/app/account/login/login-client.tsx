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

function googleErrorMessage(code: string | null): string {
  switch (code) {
    case 'cancelled':
      return 'Google sign-in was cancelled.';
    case 'email_not_verified':
      return "We couldn't verify this Google account's email — please sign up with email and password instead.";
    default:
      return code ? 'Something went wrong signing in with Google, please try again.' : '';
  }
}

export function LoginClient() {
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [registered, setRegistered] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') ?? '/account/dashboard';
  const [serverError, setServerError] = useState(() => googleErrorMessage(searchParams.get('googleError')));

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

              <a
                href={`/api/auth/google?returnUrl=${encodeURIComponent(returnUrl)}`}
                className='w-full flex items-center justify-center gap-2 border border-[var(--line)] font-sans text-sm font-medium py-3 hover:bg-black/5 transition-colors mb-6'
              >
                <svg width='18' height='18' viewBox='0 0 18 18' aria-hidden='true'>
                  <path fill='#4285F4' d='M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z' />
                  <path fill='#34A853' d='M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z' />
                  <path fill='#FBBC05' d='M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33z' />
                  <path fill='#EA4335' d='M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58z' />
                </svg>
                Continue with Google
              </a>

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
