'use client';
import { useEffect, useState } from 'react';

function formatMs(ms: number): string {
  if (ms <= 0) return '0:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CountdownTimer({ endAt }: { endAt: string | Date }) {
  const end = new Date(endAt).getTime();
  const [remaining, setRemaining] = useState(() => end - Date.now());

  useEffect(() => {
    const interval = setInterval(() => setRemaining(end - Date.now()), 1000);
    return () => clearInterval(interval);
  }, [end]);

  const isUrgent = remaining <= 3 * 60 * 1000;

  return (
    <span className={`font-sans tabular-nums text-sm font-medium ${isUrgent ? 'text-red-600' : 'text-ink'}`}>
      {formatMs(remaining)}
    </span>
  );
}
