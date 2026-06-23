'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createLot } from '../_actions';

const CONDITIONS = ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR'] as const;

export default function NewLotPage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createLot, {});

  useEffect(() => {
    if (state.ok) router.push('/admin/lots');
  }, [state, router]);

  return (
    <div className='max-w-lg space-y-4'>
      <h1 className='text-2xl font-semibold'>New Lot</h1>
      <form action={formAction} className='space-y-4'>
        <div className='space-y-1'>
          <Label htmlFor='title'>Title</Label>
          <Input id='title' name='title' />
          {state.errors?.title && <p className='text-sm text-destructive'>{state.errors.title[0]}</p>}
        </div>
        <div className='space-y-1'>
          <Label htmlFor='description'>Description</Label>
          <Textarea id='description' name='description' rows={4} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='categoryId'>Category ID</Label>
          <Input id='categoryId' name='categoryId' placeholder='UUID' />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='condition'>Condition</Label>
          <Select name='condition'>
            <SelectTrigger><SelectValue placeholder='Select condition' /></SelectTrigger>
            <SelectContent>
              {CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-1'>
          <Label htmlFor='estimatedValue'>Estimated Value</Label>
          <Input id='estimatedValue' name='estimatedValue' type='number' min={0} step={0.01} />
        </div>
        <Button type='submit' disabled={isPending}>
          {isPending ? 'Creating…' : 'Create Lot'}
        </Button>
      </form>
    </div>
  );
}
