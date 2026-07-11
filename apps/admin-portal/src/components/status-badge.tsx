import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';

const STATUS_VARIANTS: Record<string, BadgeProps['variant']> = {
  ACTIVE: 'default',
  INACTIVE: 'destructive',
  SCHEDULED: 'secondary',
  DRAFT: 'secondary',
  LIVE: 'default',
  CLOSING: 'destructive',
  CLOSED: 'secondary',
  SOLD: 'default',
  UNSOLD: 'secondary',
  UNSCHEDULED: 'outline',
  CANCELLED: 'destructive',
  PAID: 'default',
  UNPAID: 'secondary',
  EXPIRED: 'destructive',
  DISPATCHED: 'default',
  COLLECTED: 'default',
  PENDING: 'secondary',
  SUSPENDED: 'destructive',
  VERIFIED: 'default',
};

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status] ?? 'outline';
  return <Badge variant={variant} className={variant}>{status}</Badge>;
}
