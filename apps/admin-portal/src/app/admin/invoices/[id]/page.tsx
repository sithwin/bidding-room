import { adminApi } from '@/lib/admin-api';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { extendDueDate, cancelInvoice } from './_actions';

interface InvoiceDetail {
  id: string;
  lotTitle: string;
  winnerEmail: string;
  amount: number;
  currency: string;
  status: string;
  dueAt: string;
  stripePaymentIntentId: string;
}

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const res = await adminApi.get<{ data: InvoiceDetail }>(`/admin/api/invoices/${params.id}`);
  const invoice = res.data;
  const isUnpaid = invoice.status === 'UNPAID';

  return (
    <div className='max-w-2xl space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-semibold'>{invoice.lotTitle}</h1>
          <StatusBadge status={invoice.status} />
        </div>
        {isUnpaid && (
          <ConfirmDialog
            trigger={<Button variant='destructive'>Cancel Invoice</Button>}
            title='Cancel invoice?'
            description='The invoice will be cancelled.'
            onConfirm={async () => { 'use server'; await cancelInvoice(invoice.id, 'Cancelled by admin after review.'); }}
            confirmLabel='Cancel Invoice'
          />
        )}
      </div>
      <dl className='grid grid-cols-2 gap-4 rounded border p-4'>
        <div><dt className='text-xs text-muted-foreground'>Winner</dt><dd>{invoice.winnerEmail}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Amount</dt><dd>{invoice.currency} {invoice.amount.toLocaleString()}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Due</dt><dd>{new Date(invoice.dueAt).toLocaleDateString()}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Stripe PI</dt><dd className='font-mono text-xs'>{invoice.stripePaymentIntentId}</dd></div>
      </dl>
      {isUnpaid && (
        <form action={async (fd: FormData) => { 'use server'; await extendDueDate(invoice.id, fd.get('dueAt') as string); }} className='space-y-2'>
          <Label htmlFor='dueAt'>Extend due date</Label>
          <div className='flex gap-2'>
            <Input id='dueAt' name='dueAt' type='date' className='w-40' />
            <Button type='submit' variant='outline'>Extend</Button>
          </div>
        </form>
      )}
    </div>
  );
}
