import { adminApi } from '@/lib/admin-api';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { markDispatched, markCollected } from './_actions';

interface ShippingAddress {
  line1: string;
  city: string;
  country: string;
  postalCode: string;
}

interface FulfilmentDetail {
  id: string;
  lotTitle: string;
  buyerEmail: string;
  method: string;
  status: string;
  address?: ShippingAddress;
  collectionSlot?: string;
}

export default async function FulfilmentDetailPage({ params }: { params: { id: string } }) {
  const res = await adminApi.get<{ data: FulfilmentDetail }>(`/admin/api/fulfilments/${params.id}`);
  const ful = res.data;
  const isPendingDispatch = ful.method === 'SHIP' && ful.status === 'PENDING';
  const isPendingCollection = ful.method === 'COLLECT' && ful.status === 'PENDING';

  return (
    <div className='max-w-2xl space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-semibold'>{ful.lotTitle}</h1>
          <StatusBadge status={ful.status} />
        </div>
        {isPendingCollection && (
          <form action={async () => { 'use server'; await markCollected(ful.id); }}>
            <Button type='submit'>Mark Collected</Button>
          </form>
        )}
      </div>
      <dl className='grid grid-cols-2 gap-4 rounded border p-4'>
        <div><dt className='text-xs text-muted-foreground'>Buyer</dt><dd>{ful.buyerEmail}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Method</dt><dd>{ful.method}</dd></div>
        {ful.address && (
          <div className='col-span-2'>
            <dt className='text-xs text-muted-foreground'>Shipping Address</dt>
            <dd>{ful.address.line1}, {ful.address.city}, {ful.address.postalCode}, {ful.address.country}</dd>
          </div>
        )}
        {ful.collectionSlot && (
          <div><dt className='text-xs text-muted-foreground'>Collection Slot</dt><dd>{ful.collectionSlot}</dd></div>
        )}
      </dl>
      {isPendingDispatch && (
        <form
          action={async (fd: FormData) => {
            'use server';
            await markDispatched(ful.id, fd.get('trackingNumber') as string, fd.get('carrier') as string);
          }}
          className='space-y-3'
        >
          <h2 className='text-lg font-medium'>Mark as Dispatched</h2>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label htmlFor='carrier'>Carrier</Label>
              <Input id='carrier' name='carrier' placeholder='DHL' />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='trackingNumber'>Tracking Number</Label>
              <Input id='trackingNumber' name='trackingNumber' placeholder='TRK123456789' />
            </div>
          </div>
          <Button type='submit'>Mark Dispatched</Button>
        </form>
      )}
    </div>
  );
}
