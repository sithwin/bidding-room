'use client';

import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createLot } from '../_actions';
import { LOT_CONDITIONS } from '@/lib/schemas/lot.schema';
import type { CategoryOption } from '@/lib/categories';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type='submit' disabled={pending}>{pending ? 'Creating…' : 'Create Lot'}</Button>;
}

function FieldError({ messages }: { messages: string[] | undefined }) {
  if (!messages?.length) return null;
  return <p className='text-sm text-destructive'>{messages[0]}</p>;
}

export function NewLotForm({ categories }: { categories: CategoryOption[] }) {
  const router = useRouter();
  const [state, formAction] = useActionState(createLot, {});

  useEffect(() => {
    if (state.ok) router.push('/admin/lots');
  }, [state, router]);

  return (
    <form action={formAction} className='space-y-4'>
      {state.ok === false && !state.errors && (
        <p className='rounded border border-destructive p-2 text-sm text-destructive'>
          Could not create the lot. Please try again.
        </p>
      )}
      <div className='space-y-1'>
        <Label htmlFor='title'>Title</Label>
        <Input id='title' name='title' />
        <FieldError messages={state.errors?.title} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='description'>Description</Label>
        <Textarea id='description' name='description' rows={4} />
        <FieldError messages={state.errors?.description} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='categoryId'>Category</Label>
        <Select name='categoryId'>
          <SelectTrigger id='categoryId'><SelectValue placeholder='Select a category' /></SelectTrigger>
          <SelectContent>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <FieldError messages={state.errors?.categoryId} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='condition'>Condition</Label>
        <Select name='condition'>
          <SelectTrigger id='condition'><SelectValue placeholder='Select condition' /></SelectTrigger>
          <SelectContent>
            {LOT_CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        <FieldError messages={state.errors?.condition} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='estimatedValue'>Estimated Value</Label>
        <Input id='estimatedValue' name='estimatedValue' type='number' min={0} step={0.01} />
        <FieldError messages={state.errors?.estimatedValue} />
      </div>
      <SubmitButton />
    </form>
  );
}
