'use client';

import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { updateLot } from '../_actions';
import { LOT_CONDITIONS } from '@/lib/schemas/lot.schema';
import { LOT_ACTIVE_STATUSES } from '@carat-room/shared-types';
import type { CategoryOption } from '@/lib/categories';

interface Lot {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  condition: string;
  estimatedValue: number;
  status: string;
  auctionStatus: string | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type='submit' disabled={pending}>{pending ? 'Saving…' : 'Save Changes'}</Button>;
}

function FieldError({ messages }: { messages: string[] | undefined }) {
  if (!messages?.length) return null;
  return <p className='text-sm text-destructive'>{messages[0]}</p>;
}

export function EditLotForm({ lot, categories }: { lot: Lot; categories: CategoryOption[] }) {
  const router = useRouter();
  const boundAction = updateLot.bind(null, lot.id);
  const [state, formAction] = useActionState(boundAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const hasConfirmedRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (state.ok) router.push('/admin/lots');
  }, [state, router]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    if (lot.auctionStatus === 'LIVE' && !hasConfirmedRef.current) {
      e.preventDefault();
      setConfirmOpen(true);
    }
  }

  function handleConfirmSave(): void {
    hasConfirmedRef.current = true;
    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} className='space-y-4'>
        {state.ok === false && !state.errors && (
          <p className='rounded border border-destructive p-2 text-sm text-destructive'>
            Could not save the lot. Please try again.
          </p>
        )}
        <div className='space-y-1'>
          <Label htmlFor='title'>Title</Label>
          <Input id='title' name='title' defaultValue={lot.title} />
          <FieldError messages={state.errors?.title} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='description'>Description</Label>
          <Textarea id='description' name='description' rows={4} defaultValue={lot.description} />
          <FieldError messages={state.errors?.description} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='categoryId'>Category</Label>
          <Select name='categoryId' defaultValue={lot.categoryId}>
            <SelectTrigger id='categoryId'><SelectValue placeholder='Select a category' /></SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError messages={state.errors?.categoryId} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='condition'>Condition</Label>
          <Select name='condition' defaultValue={lot.condition}>
            <SelectTrigger id='condition'><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOT_CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError messages={state.errors?.condition} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='estimatedValue'>Estimated Value</Label>
          <Input id='estimatedValue' name='estimatedValue' type='number' min={0} step={0.01} defaultValue={lot.estimatedValue} />
          <FieldError messages={state.errors?.estimatedValue} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='status'>Status</Label>
          <Select name='status' defaultValue={lot.status}>
            <SelectTrigger id='status'><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOT_ACTIVE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError messages={state.errors?.status} />
        </div>
        <SubmitButton />
      </form>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This lot&apos;s auction is currently live</AlertDialogTitle>
            <AlertDialogDescription>
              Bidders are actively bidding on this lot right now. Save changes anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSave}>Save Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
