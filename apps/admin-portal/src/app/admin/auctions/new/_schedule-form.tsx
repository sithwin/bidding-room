'use client';

import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { scheduleAuction } from '../_actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type='submit' disabled={pending}>
      {pending ? 'Scheduling…' : 'Schedule Auction'}
    </Button>
  );
}

function FieldError({ messages }: { messages: string[] | undefined }) {
  if (!messages?.length) return null;
  return <p className='text-sm text-destructive'>{messages[0]}</p>;
}

export function ScheduleAuctionForm({
  lots,
  preselectedLotId,
}: {
  lots: Array<{ id: string; title: string }>;
  preselectedLotId?: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(scheduleAuction, {});

  useEffect(() => {
    if (state.ok) router.push('/admin/auctions');
  }, [state, router]);

  return (
    <form action={formAction} className='space-y-4'>
      {state.ok === false && !state.errors && (
        <p className='rounded border border-destructive p-2 text-sm text-destructive'>
          Could not schedule the auction. Please try again.
        </p>
      )}
      <div className='space-y-1'>
        <Label htmlFor='lotId'>Lot</Label>
        <Select name='lotId' defaultValue={preselectedLotId}>
          <SelectTrigger id='lotId'><SelectValue placeholder='Select a lot' /></SelectTrigger>
          <SelectContent>
            {lots.map(lot => <SelectItem key={lot.id} value={lot.id}>{lot.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <FieldError messages={state.errors?.lotId} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='startAt'>Start Date/Time</Label>
        <Input id='startAt' name='startAt' type='datetime-local' />
        <FieldError messages={state.errors?.startAt} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='endAt'>End Date/Time</Label>
        <Input id='endAt' name='endAt' type='datetime-local' />
        <FieldError messages={state.errors?.endAt} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='reservePrice'>Reserve Price (£)</Label>
        <Input id='reservePrice' name='reservePrice' type='number' min={0} step={0.01} defaultValue={0} />
        <FieldError messages={state.errors?.reservePrice} />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='minBidIncrement'>Min Bid Increment (£)</Label>
        <Input id='minBidIncrement' name='minBidIncrement' type='number' min={1} defaultValue={10} />
        <FieldError messages={state.errors?.minBidIncrement} />
      </div>
      <div className='grid grid-cols-2 gap-3'>
        <div className='space-y-1'>
          <Label htmlFor='autoExtendWindowMinutes'>Auto-extend Window (min)</Label>
          <Input id='autoExtendWindowMinutes' name='autoExtendWindowMinutes' type='number' min={1} defaultValue={3} />
          <FieldError messages={state.errors?.autoExtendWindowMinutes} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='autoExtendDurationMinutes'>Auto-extend Duration (min)</Label>
          <Input id='autoExtendDurationMinutes' name='autoExtendDurationMinutes' type='number' min={1} defaultValue={3} />
          <FieldError messages={state.errors?.autoExtendDurationMinutes} />
        </div>
      </div>
      <SubmitButton />
    </form>
  );
}
