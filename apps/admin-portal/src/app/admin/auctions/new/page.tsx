'use client';

import { useActionState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { scheduleAuction } from '../_actions';

export default function NewAuctionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lotId = searchParams.get('lotId') ?? '';
  const [state, formAction, isPending] = useActionState(scheduleAuction, {});

  useEffect(() => {
    if (state.ok) router.push('/admin/auctions');
  }, [state, router]);

  return (
    <div className='max-w-lg space-y-4'>
      <h1 className='text-2xl font-semibold'>Schedule Auction</h1>
      <form action={formAction} className='space-y-4'>
        <input type='hidden' name='lotId' value={lotId} />
        <div className='space-y-1'>
          <Label htmlFor='startAt'>Start Date/Time</Label>
          <Input id='startAt' name='startAt' type='datetime-local' />
          {state.errors?.startAt && <p className='text-sm text-destructive'>{state.errors.startAt[0]}</p>}
        </div>
        <div className='space-y-1'>
          <Label htmlFor='endAt'>End Date/Time</Label>
          <Input id='endAt' name='endAt' type='datetime-local' />
          {state.errors?.endAt && <p className='text-sm text-destructive'>{state.errors.endAt[0]}</p>}
        </div>
        <div className='space-y-1'>
          <Label htmlFor='reservePrice'>Reserve Price (£)</Label>
          <Input id='reservePrice' name='reservePrice' type='number' min={0} step={0.01} defaultValue={0} />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='minBidIncrement'>Min Bid Increment (£)</Label>
          <Input id='minBidIncrement' name='minBidIncrement' type='number' min={1} defaultValue={10} />
        </div>
        <div className='grid grid-cols-2 gap-3'>
          <div className='space-y-1'>
            <Label htmlFor='autoExtendWindowMinutes'>Auto-extend Window (min)</Label>
            <Input id='autoExtendWindowMinutes' name='autoExtendWindowMinutes' type='number' min={1} defaultValue={3} />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='autoExtendDurationMinutes'>Auto-extend Duration (min)</Label>
            <Input id='autoExtendDurationMinutes' name='autoExtendDurationMinutes' type='number' min={1} defaultValue={3} />
          </div>
        </div>
        <Button type='submit' disabled={isPending}>
          {isPending ? 'Scheduling…' : 'Schedule Auction'}
        </Button>
      </form>
    </div>
  );
}
