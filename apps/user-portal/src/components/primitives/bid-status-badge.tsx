type Status = 'leading' | 'outbid' | 'closed';

export function BidStatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    leading: 'bg-green-100 text-green-800',
    outbid:  'bg-red-100 text-red-800',
    closed:  'bg-gray-100 text-gray-600',
  };
  const labels: Record<Status, string> = {
    leading: 'Leading',
    outbid:  'Outbid',
    closed:  'Closed',
  };
  return (
    <span className={`inline-block font-sans text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
