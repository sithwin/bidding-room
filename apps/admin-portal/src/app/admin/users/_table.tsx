'use client';

import Link from 'next/link';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import type { ColumnDef } from '@tanstack/react-table';

export interface UserSummary {
  id: string;
  email: string;
  status: string;
  country: string | null;
  registeredAt: string;
}

const columns: ColumnDef<UserSummary>[] = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { accessorKey: 'country', header: 'Country' },
  { accessorKey: 'registeredAt', header: 'Registered', cell: ({ row }) => new Date(row.original.registeredAt).toLocaleDateString() },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Button variant='outline' size='sm' asChild>
        <Link href={`/admin/users/${row.original.id}`}>View</Link>
      </Button>
    ),
  },
];

export function UsersTable({ data }: { data: UserSummary[] }) {
  return <DataTable columns={columns} data={data} />;
}
