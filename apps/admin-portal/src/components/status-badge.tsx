import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';

const STATUS_VARIANTS: Record<string, BadgeProps['variant']> = {
  ACTIVE: 'default',
  SCHEDULED: 'secondary',
  LIVE: 'default',
  CLOSED: 'secondary',
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
