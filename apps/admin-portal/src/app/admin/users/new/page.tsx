'use client';

import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createUser } from '../_actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type='submit' disabled={pending}>{pending ? 'Creating…' : 'Create User'}</Button>;
}

function FieldError({ messages }: { messages: string[] | undefined }) {
  if (!messages?.length) return null;
  return <p className='text-sm text-destructive'>{messages[0]}</p>;
}

interface ServerErrorBody {
  error?: { message?: string };
}

function serverErrorMessage(error: unknown): string {
  const message = (error as ServerErrorBody | undefined)?.error?.message;
  return typeof message === 'string' ? message : 'Could not create the user. Please try again.';
}

export default function NewUserPage() {
  const router = useRouter();
  const [state, formAction] = useActionState(createUser, {});

  useEffect(() => {
    if (state.ok) router.push('/admin/users');
  }, [state, router]);

  return (
    <div className='max-w-lg space-y-4'>
      <h1 className='text-2xl font-semibold'>New User</h1>
      <form action={formAction} className='space-y-4'>
        {state.ok === false && !state.errors && (
          <p className='rounded border border-destructive p-2 text-sm text-destructive'>
            {serverErrorMessage(state.error)}
          </p>
        )}
        <div className='space-y-1'>
          <Label htmlFor='email'>Email</Label>
          <Input id='email' name='email' type='email' />
          <FieldError messages={state.errors?.email} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='password'>Temporary Password</Label>
          <Input id='password' name='password' type='password' minLength={12} />
          <p className='text-sm text-muted-foreground'>At least 12 characters.</p>
          <FieldError messages={state.errors?.password} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='role'>Role</Label>
          <Select name='role' defaultValue='BUYER'>
            <SelectTrigger id='role'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='BUYER'>Buyer</SelectItem>
              <SelectItem value='ADMIN'>Admin</SelectItem>
            </SelectContent>
          </Select>
          <FieldError messages={state.errors?.role} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='country'>Country (optional)</Label>
          <Input id='country' name='country' placeholder='GB' />
          <FieldError messages={state.errors?.country} />
        </div>
        <SubmitButton />
      </form>
    </div>
  );
}
