import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLotSse, type SseEvent } from './use-lot-sse';

// ---------------------------------------------------------------------------
// EventSource mock
// ---------------------------------------------------------------------------

type EventSourceHandler = ((this: EventSource, ev: Event) => unknown) | null;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: EventSourceHandler = null;
  onmessage: EventSourceHandler = null;
  onerror: EventSourceHandler = null;
  readyState = 0; // CONNECTING

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close = vi.fn(() => {
    this.readyState = 2; // CLOSED
  });

  /** Test helper — simulate a successful connection open */
  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.call(this as unknown as EventSource, new Event('open'));
  }

  /** Test helper — simulate an incoming message */
  simulateMessage(data: unknown) {
    const event = new MessageEvent('message', { data: JSON.stringify(data) });
    this.onmessage?.call(this as unknown as EventSource, event);
  }

  /** Test helper — simulate a malformed (non-JSON) message */
  simulateMalformedMessage(raw: string) {
    const event = new MessageEvent('message', { data: raw });
    this.onmessage?.call(this as unknown as EventSource, event);
  }

  /** Test helper — simulate a connection error */
  simulateError() {
    this.onerror?.call(this as unknown as EventSource, new Event('error'));
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useLotSse', () => {
  it('opens an EventSource to the correct URL', () => {
    renderHook(() => useLotSse('lot-abc'));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('/api/auctions/lot-abc/stream');
  });

  it('returns isConnected=false initially', () => {
    const { result } = renderHook(() => useLotSse('lot-1'));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.lastEvent).toBeNull();
  });

  it('sets isConnected=true when the connection opens', () => {
    const { result } = renderHook(() => useLotSse('lot-1'));
    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });
    expect(result.current.isConnected).toBe(true);
  });

  it('updates lastEvent when a valid bid_placed message is received', () => {
    const { result } = renderHook(() => useLotSse('lot-1'));
    const event: SseEvent = {
      type: 'bid_placed',
      lotId: 'lot-1',
      currentBid: 500,
      bidCount: 3,
      bidderId: 'user-xyz',
    };
    act(() => {
      MockEventSource.instances[0].simulateOpen();
      MockEventSource.instances[0].simulateMessage(event);
    });
    expect(result.current.lastEvent).toEqual(event);
  });

  it('updates lastEvent when a timer_extended event is received', () => {
    const { result } = renderHook(() => useLotSse('lot-1'));
    const event: SseEvent = { type: 'timer_extended', lotId: 'lot-1', endAt: '2026-07-01T12:00:00Z' };
    act(() => {
      MockEventSource.instances[0].simulateMessage(event);
    });
    expect(result.current.lastEvent).toEqual(event);
  });

  it('updates lastEvent when a closing_soon event is received', () => {
    const { result } = renderHook(() => useLotSse('lot-1'));
    const event: SseEvent = { type: 'closing_soon', lotId: 'lot-1' };
    act(() => {
      MockEventSource.instances[0].simulateMessage(event);
    });
    expect(result.current.lastEvent).toEqual(event);
  });

  it('updates lastEvent when an auction_closed event is received', () => {
    const { result } = renderHook(() => useLotSse('lot-1'));
    const event: SseEvent = { type: 'auction_closed', lotId: 'lot-1', result: 'SOLD' };
    act(() => {
      MockEventSource.instances[0].simulateMessage(event);
    });
    expect(result.current.lastEvent).toEqual(event);
  });

  it('ignores malformed (non-JSON) messages without throwing', () => {
    const { result } = renderHook(() => useLotSse('lot-1'));
    act(() => {
      MockEventSource.instances[0].simulateOpen();
      MockEventSource.instances[0].simulateMalformedMessage('not-json{{');
    });
    expect(result.current.lastEvent).toBeNull();
    expect(result.current.isConnected).toBe(true);
  });

  it('sets isConnected=false and closes the EventSource on error', () => {
    const { result } = renderHook(() => useLotSse('lot-1'));
    const es = MockEventSource.instances[0];
    act(() => {
      es.simulateOpen();
    });
    expect(result.current.isConnected).toBe(true);

    act(() => {
      es.simulateError();
    });
    expect(result.current.isConnected).toBe(false);
    expect(es.close).toHaveBeenCalled();
  });

  it('reconnects with exponential back-off after an error', () => {
    renderHook(() => useLotSse('lot-1'));
    expect(MockEventSource.instances).toHaveLength(1);

    // Trigger first error → reconnect after 1 s
    act(() => {
      MockEventSource.instances[0].simulateError();
      vi.advanceTimersByTime(1000);
    });
    expect(MockEventSource.instances).toHaveLength(2);

    // Trigger second error → reconnect after 2 s
    act(() => {
      MockEventSource.instances[1].simulateError();
      vi.advanceTimersByTime(2000);
    });
    expect(MockEventSource.instances).toHaveLength(3);
  });

  it('does not reconnect after unmount', () => {
    const { unmount } = renderHook(() => useLotSse('lot-1'));
    const es = MockEventSource.instances[0];

    unmount();

    act(() => {
      // Simulating an error on an already-unmounted hook should not open a new connection
      es.simulateError();
      vi.advanceTimersByTime(5000);
    });

    // Only the original instance — no new one created
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it('closes the EventSource on unmount', () => {
    const { unmount } = renderHook(() => useLotSse('lot-1'));
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.close).toHaveBeenCalled();
  });

  it('re-connects to a new URL when lotId changes', () => {
    const { rerender } = renderHook(({ lotId }) => useLotSse(lotId), {
      initialProps: { lotId: 'lot-1' },
    });
    expect(MockEventSource.instances[0].url).toBe('/api/auctions/lot-1/stream');

    rerender({ lotId: 'lot-2' });
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1].url).toBe('/api/auctions/lot-2/stream');
    // Old EventSource should have been closed
    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
  });

  it('returns isReconnecting=false initially', () => {
    const { result } = renderHook(() => useLotSse('lot-1'));
    expect(result.current.isReconnecting).toBe(false);
  });

  it('does not show isReconnecting immediately after error (requires 5s delay)', () => {
    const { result } = renderHook(() => useLotSse('lot-1'));
    act(() => {
      MockEventSource.instances[0].simulateOpen();
      MockEventSource.instances[0].simulateError();
    });
    // Not yet showing — timer has not fired
    expect(result.current.isReconnecting).toBe(false);
  });

  it('sets isReconnecting=true after 5 seconds of disconnect', () => {
    const { result } = renderHook(() => useLotSse('lot-1'));
    act(() => {
      MockEventSource.instances[0].simulateOpen();
      MockEventSource.instances[0].simulateError();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.isReconnecting).toBe(true);
  });

  it('clears isReconnecting when connection is re-established', () => {
    const { result } = renderHook(() => useLotSse('lot-1'));
    act(() => {
      MockEventSource.instances[0].simulateOpen();
      MockEventSource.instances[0].simulateError();
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.isReconnecting).toBe(true);

    // Advance time to trigger reconnect (1s back-off)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // Second instance is created — simulate open
    act(() => {
      MockEventSource.instances[1].simulateOpen();
    });
    expect(result.current.isReconnecting).toBe(false);
    expect(result.current.isConnected).toBe(true);
  });
});
