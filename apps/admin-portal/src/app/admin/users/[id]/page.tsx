import { adminApi } from '@/lib/admin-api';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { suspendUser, reinstateUser, manuallyApproveUser } from './_actions';

interface UserDetail {
  id: string;
  email: string;
  status: string;
  country: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  registeredAt: string;
}

export default async function UserDetailPage({ params }: { params: { id: string } }) {
  const res = await adminApi.get<{ data: UserDetail }>(`/admin/api/users/${params.id}`);
  const user = res.data;

  return (
    <div className='max-w-2xl space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-semibold'>{user.email}</h1>
          <StatusBadge status={user.status} />
        </div>
        <div className='flex gap-2'>
          {user.status === 'ACTIVE' && (
            <ConfirmDialog
              trigger={<Button variant='destructive'>Suspend</Button>}
              title='Suspend user?'
              description='User will be unable to place bids.'
              onConfirm={async () => { 'use server'; await suspendUser(user.id, 'Suspended by admin.      '); }}
              confirmLabel='Suspend'
            />
          )}
          {user.status === 'SUSPENDED' && (
            <form action={async () => { 'use server'; await reinstateUser(user.id); }}>
              <Button type='submit'>Reinstate</Button>
            </form>
          )}
          {!user.emailVerified && (
            <form action={async () => { 'use server'; await manuallyApproveUser(user.id); }}>
              <Button type='submit' variant='outline'>Manually Approve</Button>
            </form>
          )}
        </div>
      </div>
      <dl className='grid grid-cols-2 gap-4 rounded border p-4'>
        <div><dt className='text-xs text-muted-foreground'>Country</dt><dd>{user.country}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Registered</dt><dd>{new Date(user.registeredAt).toLocaleDateString()}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Email verified</dt><dd>{user.emailVerified ? 'Yes' : 'No'}</dd></div>
        <div><dt className='text-xs text-muted-foreground'>Phone verified</dt><dd>{user.phoneVerified ? 'Yes' : 'No'}</dd></div>
      </dl>
    </div>
  );
}
