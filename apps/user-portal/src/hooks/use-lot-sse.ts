'use client';
import { useEffect, useRef, useState } from 'react';

export type SseEvent =
  | { type: 'bid_placed';     lotId: string; currentBid: number; bidCount: number; bidderId: string }
  | { type: 'timer_extended'; lotId: string; endAt: string }
  | { type: 'closing_soon';   lotId: string }
  | { type: 'auction_closed'; lotId: string; result: 'SOLD' | 'UNSOLD' };

export interface UseLotSseReturn {
  lastEvent: SseEvent | null;
  isConnected: boolean;
}

export function useLotSse(lotId: string): UseLotSseReturn {
  const [lastEvent, setLastEvent] = useState<SseEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const retryDelay = useRef(1000);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const es = new EventSource(`/api/auctions/${lotId}/stream`);
      esRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
        retryDelay.current = 1000;
      };

      es.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data) as SseEvent;
          setLastEvent(parsed);
        } catch {
          // ignore malformed events
        }
      };

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        if (!cancelled) {
          setTimeout(() => {
            retryDelay.current = Math.min(retryDelay.current * 2, 30000);
            connect();
          }, retryDelay.current);
        }
      };
    }

    connect();
    return () => {
      cancelled = true;
      esRef.current?.close();
    };
  }, [lotId]);

  return { lastEvent, isConnected };
}
