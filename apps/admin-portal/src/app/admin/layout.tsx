import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { AdminShell } from '@/components/layout/admin-shell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get('admin_token')?.value;
  if (!token) redirect('/admin/login');

  return <AdminShell>{children}</AdminShell>;
}
