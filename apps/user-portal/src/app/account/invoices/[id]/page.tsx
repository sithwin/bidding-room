import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { InvoiceDetail } from './InvoiceDetail';

interface Invoice {
  id: string;
  lotId: string;
  amount: number;
  currency: string;
  status: 'AWAITING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  dueAt: string;
  paidAt: string | null;
  createdAt: string;
}

async function getInvoice(id: string): Promise<Invoice | null> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('access_token')?.value;
  if (!accessToken) {
    return null;
  }

  const res = await fetch(
    `${process.env['PAYMENT_SERVICE_URL']}/api/payments/invoices/${id}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    return null;
  }

  const body = await res.json() as { data: Invoice };
  return body.data;
}

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { payment?: string };
}) {
  const invoice = await getInvoice(params.id);

  if (!invoice) {
    redirect('/account/login');
  }

  const paymentSuccess = searchParams.payment === 'success';

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Invoice</h1>
      <InvoiceDetail invoice={invoice} paymentSuccess={paymentSuccess} />
    </main>
  );
}
