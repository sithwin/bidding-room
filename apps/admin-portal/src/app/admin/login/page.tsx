'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      // A soft navigation here (router.push) can serve a stale prefetch: the
      // sidebar rendered by AdminShell (see app/admin/layout.tsx) prefetches
      // every nav link — including /admin/dashboard — while still on this
      // unauthenticated login page, and the middleware's redirect-to-login
      // response for that prefetch gets cached by the Next.js router cache.
      // router.push() then serves that stale cached redirect instead of
      // re-running the middleware with the just-set cookie. A full navigation
      // bypasses the router cache entirely and re-evaluates middleware fresh.
      window.location.assign('/admin/dashboard');
    } else {
      const body = await res.json() as { error: { message: string } };
      setServerError(body.error.message);
    }
  };

  return (
    <div className='flex min-h-screen items-center justify-center bg-muted/40'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle>The Carat Room — Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
            <div className='space-y-1'>
              <Label htmlFor='email'>Email</Label>
              <Input id='email' type='email' autoComplete='email' {...register('email')} />
              {errors.email && <p className='text-sm text-destructive'>{errors.email.message}</p>}
            </div>
            <div className='space-y-1'>
              <Label htmlFor='password'>Password</Label>
              <Input id='password' type='password' autoComplete='current-password' {...register('password')} />
              {errors.password && <p className='text-sm text-destructive'>{errors.password.message}</p>}
            </div>
            {serverError && <p className='text-sm text-destructive'>{serverError}</p>}
            <Button type='submit' className='w-full' disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
