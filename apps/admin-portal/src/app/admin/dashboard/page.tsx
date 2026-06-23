import { adminApi } from '@/lib/admin-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gavel, Clock, FileText, Package } from 'lucide-react';

interface DashboardStats {
  activeAuctions: number;
  endingSoon: number;
  pendingInvoices: number;
  pendingFulfilments: number;
}

export default async function DashboardPage() {
  const res = await adminApi.get<{ data: DashboardStats }>('/admin/api/reports/dashboard');
  const stats = res.data;

  const CARDS = [
    { label: 'Active Auctions', value: stats.activeAuctions, icon: Gavel },
    { label: 'Ending in 24h', value: stats.endingSoon, icon: Clock },
    { label: 'Pending Invoices', value: stats.pendingInvoices, icon: FileText },
    { label: 'Pending Fulfilments', value: stats.pendingFulfilments, icon: Package },
  ];

  return (
    <div className='space-y-6'>
      <h1 className='text-2xl font-semibold'>Dashboard</h1>
      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        {CARDS.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>{label}</CardTitle>
              <Icon className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <p className='text-3xl font-bold'>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
