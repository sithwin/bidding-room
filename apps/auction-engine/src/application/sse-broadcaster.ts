export type SseEventType = 'bid_placed' | 'timer_extended' | 'auction_closed';

export interface SseEventData {
  highestBid: number | null;
  bidCount: number;
  endAt: string;
  status: string;
}

export interface SseBroadcaster {
  subscribe(
    lotId: string,
    send: (event: SseEventType, data: SseEventData) => void,
  ): () => void;
  broadcast(lotId: string, event: SseEventType, data: SseEventData): void;
}
