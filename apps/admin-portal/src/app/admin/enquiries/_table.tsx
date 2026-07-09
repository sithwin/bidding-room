'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import type { ColumnDef } from '@tanstack/react-table';
import { updateEnquiryStatus } from './_actions';

export interface EnquiryDto {
  id: string;
  category: string;
  artistMaker: string | null;
  description: string;
  photoKeys: string[];
  name: string;
  email: string;
  status: 'NEW' | 'RESPONDED' | 'CLOSED';
  createdAt: string;
}

function EnquiryActions({ enquiry }: { enquiry: EnquiryDto }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const changeStatus = (status: 'RESPONDED' | 'CLOSED') => {
    setError(null);
    startTransition(async () => {
      const result = await updateEnquiryStatus(enquiry.id, status);
      if (!result.ok) {
        setError('Failed to update status');
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className='flex items-center gap-2'>
      {enquiry.status !== 'RESPONDED' && (
        <Button variant='outline' size='sm' disabled={isPending} onClick={() => changeStatus('RESPONDED')}>
          Mark Responded
        </Button>
      )}
      {enquiry.status !== 'CLOSED' && (
        <Button variant='outline' size='sm' disabled={isPending} onClick={() => changeStatus('CLOSED')}>
          Close
        </Button>
      )}
      {error && <span className='text-sm text-destructive'>{error}</span>}
    </div>
  );
}

const columns: ColumnDef<EnquiryDto>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'category', header: 'Category' },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { accessorKey: 'createdAt', header: 'Received', cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString() },
  {
    id: 'actions',
    cell: ({ row }) => <EnquiryActions enquiry={row.original} />,
  },
];

export function EnquiriesTable({ data }: { data: EnquiryDto[] }) {
  return <DataTable columns={columns} data={data} />;
}
