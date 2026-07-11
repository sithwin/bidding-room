'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ColumnDef } from '@tanstack/react-table';

type Fetcher = (url: string) => Promise<unknown>;
const fetcher: Fetcher = async url => {
  const res = await fetch(url);
  const json: unknown = await res.json();
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return json;
};

function LoadError() {
  return <p className='text-sm text-destructive'>Could not load this report. Please try again.</p>;
}

interface AuctionResult {
  lotTitle: string | null;
  categoryName: string | null;
  finalBid: number | null;
  reserveMet: boolean;
  winnerEmail: string | null;
}

interface UnsoldLot {
  id: string;
  title: string | null;
  categoryName: string | null;
  highestBid: number | null;
}

const auctionResultColumns: ColumnDef<AuctionResult>[] = [
  { accessorKey: 'lotTitle', header: 'Lot', cell: ({ row }) => row.original.lotTitle ?? '—' },
  { accessorKey: 'categoryName', header: 'Category', cell: ({ row }) => row.original.categoryName ?? '—' },
  { accessorKey: 'finalBid', header: 'Final Bid', cell: ({ row }) => (row.original.finalBid ?? 0).toLocaleString() },
  { accessorKey: 'reserveMet', header: 'Reserve Met', cell: ({ row }) => row.original.reserveMet ? '✓' : '✗' },
  { accessorKey: 'winnerEmail', header: 'Winner', cell: ({ row }) => row.original.winnerEmail ?? '—' },
];

const unsoldColumns: ColumnDef<UnsoldLot>[] = [
  { accessorKey: 'title', header: 'Lot', cell: ({ row }) => row.original.title ?? '—' },
  { accessorKey: 'categoryName', header: 'Category', cell: ({ row }) => row.original.categoryName ?? '—' },
  { accessorKey: 'highestBid', header: 'Highest Bid', cell: ({ row }) => (row.original.highestBid ?? 0).toLocaleString() },
  {
    id: 'relist',
    cell: ({ row }) => (
      <Button variant='outline' size='sm' asChild>
        <Link href={`/admin/auctions/new?lotId=${row.original.id}`}>Relist</Link>
      </Button>
    ),
  },
];

function AuctionResultsTab() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];
  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState(`from=${thirtyDaysAgo}&to=${today}`);

  const { data, error } = useSWR(`/api/admin/reports/auction-results?${query}`, fetcher) as
    { data: { data: { rows: AuctionResult[]; summary: { totalLots: number; soldPercent: number; totalValue: number } } } | undefined; error: Error | undefined };

  if (error) return <LoadError />;

  return (
    <div className='space-y-4'>
      <div className='flex items-end gap-3'>
        <div className='space-y-1'>
          <Label>From</Label>
          <Input type='date' value={from} onChange={e => setFrom(e.target.value)} className='w-36' />
        </div>
        <div className='space-y-1'>
          <Label>To</Label>
          <Input type='date' value={to} onChange={e => setTo(e.target.value)} className='w-36' />
        </div>
        <Button onClick={() => setQuery(`from=${from}&to=${to}`)}>Apply</Button>
      </div>
      {data?.data?.summary && (
        <div className='flex gap-6 rounded border bg-muted/30 p-4 text-sm'>
          <span>Total lots: <strong>{data.data.summary.totalLots}</strong></span>
          <span>% Sold: <strong>{data.data.summary.soldPercent}%</strong></span>
          <span>Total value: <strong>{data.data.summary.totalValue.toLocaleString()}</strong></span>
        </div>
      )}
      <DataTable columns={auctionResultColumns} data={data?.data?.rows ?? []} />
    </div>
  );
}

function RevenueTab() {
  const { data, error } = useSWR('/api/admin/reports/revenue', fetcher) as
    { data: { data: { byCurrency: Record<string, number> } } | undefined; error: Error | undefined };

  if (error) return <LoadError />;
  if (!data && !error) return <p className='text-muted-foreground'>Loading…</p>;

  return (
    <div className='space-y-4'>
      <h2 className='text-lg font-medium'>Revenue by Currency</h2>
      <dl className='grid grid-cols-3 gap-4'>
        {Object.entries(data?.data?.byCurrency ?? {}).map(([currency, amount]) => (
          <div key={currency} className='rounded border p-4'>
            <dt className='text-xs text-muted-foreground'>{currency}</dt>
            <dd className='text-2xl font-semibold'>{amount.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function UnsoldLotsTab() {
  const { data, error } = useSWR('/api/admin/reports/unsold', fetcher) as
    { data: { data: UnsoldLot[] } | undefined; error: Error | undefined };

  if (error) return <LoadError />;

  return <DataTable columns={unsoldColumns} data={data?.data ?? []} />;
}

export default function ReportsPage() {
  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold'>Reports</h1>
      <Tabs defaultValue='results'>
        <TabsList>
          <TabsTrigger value='results'>Auction Results</TabsTrigger>
          <TabsTrigger value='revenue'>Revenue</TabsTrigger>
          <TabsTrigger value='unsold'>Unsold Lots</TabsTrigger>
        </TabsList>
        <TabsContent value='results' className='pt-4'><AuctionResultsTab /></TabsContent>
        <TabsContent value='revenue' className='pt-4'><RevenueTab /></TabsContent>
        <TabsContent value='unsold' className='pt-4'><UnsoldLotsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
