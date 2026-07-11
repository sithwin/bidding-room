import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { lotStatusResponseSchema } from '@carat-room/shared-types';
import { parseLotStatus, parsePlacedBid } from './auction';

const statusFixture = {
  lotId: 'lot-1', status: 'LIVE', currentHighestBid: 150, bidCount: 4,
  endAt: '2026-07-12T10:00:00.000Z',
} satisfies z.infer<typeof lotStatusResponseSchema>['data'];

describe('parseLotStatus', () => {
  it('parses the real { data } envelope', () => {
    expect(parseLotStatus({ data: statusFixture })?.bidCount).toBe(4);
  });

  it('returns null and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(parseLotStatus({ lot: statusFixture })).toBeNull();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('parsePlacedBid', () => {
  it('parses a 201 body', () => {
    expect(parsePlacedBid({ data: { bidId: 'b1', amount: 160, lotId: 'lot-1' } })?.bidId).toBe('b1');
  });
});
