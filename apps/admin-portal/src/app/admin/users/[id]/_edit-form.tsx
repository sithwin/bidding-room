'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateUser } from '../_actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type='submit' disabled={pending}>{pending ? 'Saving…' : 'Save Changes'}</Button>;
}

function FieldError({ messages }: { messages: string[] | undefined }) {
  if (!messages?.length) return null;
  return <p className='text-sm text-destructive'>{messages[0]}</p>;
}

export function EditUserForm({ user }: { user: { id: string; email: string; country: string | null } }) {
  const boundAction = updateUser.bind(null, user.id);
  const [state, formAction] = useActionState(boundAction, {});

  return (
    <form action={formAction} className='space-y-4 rounded border p-4'>
      <h2 className='text-lg font-medium'>Edit User</h2>
      {state.ok === false && !state.errors && (
        <p className='rounded border border-destructive p-2 text-sm text-destructive'>
          Could not save – the email may already be registered.
        </p>
      )}
      {state.ok === true && <p className='text-sm text-muted-foreground'>Saved.</p>}
      <div className='space-y-1'>
        <Label htmlFor='email'>Email</Label>
        <Input id='email' name='email' type='email' defaultValue={user.email} />
        <FieldError messages={state.errors?.email} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='country'>Country</Label>
        <Input id='country' name='country' defaultValue={user.country ?? ''} />
        <FieldError messages={state.errors?.country} />
      </div>
      <SubmitButton />
    </form>
  );
}
