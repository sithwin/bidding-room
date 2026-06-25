'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateLot } from '../_actions';

const CONDITIONS = ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR'] as const;

interface Lot {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  condition: string;
  estimatedValue: number;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type='submit' disabled={pending}>{pending ? 'Saving…' : 'Save Changes'}</Button>;
}

export function EditLotForm({ lot }: { lot: Lot }) {
  const router = useRouter();
  const boundAction = updateLot.bind(null, lot.id);
  const [state, formAction] = useFormState(boundAction, {});

  useEffect(() => {
    if (state.ok) router.push('/admin/lots');
  }, [state, router]);

  return (
    <form action={formAction} className='space-y-4'>
      <div className='space-y-1'>
        <Label htmlFor='title'>Title</Label>
        <Input id='title' name='title' defaultValue={lot.title} />
        {state.errors?.title && <p className='text-sm text-destructive'>{state.errors.title[0]}</p>}
      </div>
      <div className='space-y-1'>
        <Label htmlFor='description'>Description</Label>
        <Textarea id='description' name='description' rows={4} defaultValue={lot.description} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='categoryId'>Category ID</Label>
        <Input id='categoryId' name='categoryId' defaultValue={lot.categoryId} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='condition'>Condition</Label>
        <Select name='condition' defaultValue={lot.condition}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className='space-y-1'>
        <Label htmlFor='estimatedValue'>Estimated Value</Label>
        <Input id='estimatedValue' name='estimatedValue' type='number' min={0} step={0.01} defaultValue={lot.estimatedValue} />
      </div>
      <SubmitButton />
    </form>
  );
}
