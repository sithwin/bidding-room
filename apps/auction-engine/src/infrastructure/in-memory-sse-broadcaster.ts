import { SseBroadcaster, SseEventData, SseEventType } from '../application/sse-broadcaster';

type SendFn = (event: SseEventType, data: SseEventData) => void;

export class InMemorySseBroadcaster implements SseBroadcaster {
  private readonly connections = new Map<string, Set<SendFn>>();

  subscribe(lotId: string, send: SendFn): () => void {
    if (!this.connections.has(lotId)) {
      this.connections.set(lotId, new Set());
    }
    this.connections.get(lotId)!.add(send);
    return () => {
      const subs = this.connections.get(lotId);
      if (!subs) return;
      subs.delete(send);
      if (subs.size === 0) this.connections.delete(lotId);
    };
  }

  broadcast(lotId: string, event: SseEventType, data: SseEventData): void {
    const subs = this.connections.get(lotId);
    if (!subs) return;
    for (const send of Array.from(subs)) {
      try {
        send(event, data);
      } catch {
        // subscriber disconnected — ignore
      }
    }
  }
}
