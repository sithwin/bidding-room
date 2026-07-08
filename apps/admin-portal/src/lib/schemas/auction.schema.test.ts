import { describe, it, expect } from 'vitest';
import { ScheduleAuctionSchema, RescheduleAuctionSchema } from './auction.schema';

const futureDate = (hoursFromNow: number) =>
  new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();

describe('ScheduleAuctionSchema', () => {
  const valid = {
    lotId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    startAt: futureDate(1),
    endAt: futureDate(25),
    reservePrice: 500,
    minBidIncrement: 10,
    autoExtendWindowMinutes: 3,
    autoExtendDurationMinutes: 3,
  };

  it('should_pass_when_allFieldsAreValid', () => {
    expect(ScheduleAuctionSchema.safeParse(valid).success).toBe(true);
  });

  it('should_fail_when_endAtIsBeforeStartAt', () => {
    expect(ScheduleAuctionSchema.safeParse({ ...valid, endAt: futureDate(0.5) }).success).toBe(false);
  });

  it('should_fail_when_reservePriceIsNegative', () => {
    expect(ScheduleAuctionSchema.safeParse({ ...valid, reservePrice: -1 }).success).toBe(false);
  });

  it('should_fail_when_autoExtendWindowIsZero', () => {
    expect(ScheduleAuctionSchema.safeParse({ ...valid, autoExtendWindowMinutes: 0 }).success).toBe(false);
  });
});

describe('RescheduleAuctionSchema', () => {
  it('should_pass_when_startAndEndAreValid', () => {
    expect(RescheduleAuctionSchema.safeParse({ startAt: futureDate(1), endAt: futureDate(25) }).success).toBe(true);
  });

  it('should_fail_when_endIsNotAfterStart', () => {
    expect(RescheduleAuctionSchema.safeParse({ startAt: futureDate(2), endAt: futureDate(1) }).success).toBe(false);
  });
});

describe('ScheduleAuctionSchema — datetime-local input', () => {
  const base = {
    lotId: '3b8f4a2e-9c1d-4e5f-8a7b-6c5d4e3f2a1b',
    reservePrice: 100,
    minBidIncrement: 10,
    autoExtendWindowMinutes: 3,
    autoExtendDurationMinutes: 3,
  };

  it('accepts the exact format a datetime-local input emits and outputs full ISO', () => {
    const result = ScheduleAuctionSchema.safeParse({
      ...base,
      startAt: '2026-07-09T14:30',
      endAt: '2026-07-10T14:30',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startAt).toBe(new Date('2026-07-09T14:30').toISOString());
      expect(result.data.endAt).toBe(new Date('2026-07-10T14:30').toISOString());
    }
  });

  it('still accepts full ISO strings', () => {
    const result = ScheduleAuctionSchema.safeParse({
      ...base,
      startAt: '2026-07-09T14:30:00.000Z',
      endAt: '2026-07-10T14:30:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unparseable date', () => {
    const result = ScheduleAuctionSchema.safeParse({
      ...base,
      startAt: 'not-a-date',
      endAt: '2026-07-10T14:30',
    });
    expect(result.success).toBe(false);
  });

  it('rejects end before start (datetime-local format)', () => {
    const result = ScheduleAuctionSchema.safeParse({
      ...base,
      startAt: '2026-07-10T14:30',
      endAt: '2026-07-09T14:30',
    });
    expect(result.success).toBe(false);
  });
});

describe('RescheduleAuctionSchema — datetime-local input', () => {
  it('accepts datetime-local values', () => {
    const result = RescheduleAuctionSchema.safeParse({
      startAt: '2026-07-09T09:00',
      endAt: '2026-07-09T18:00',
    });
    expect(result.success).toBe(true);
  });
});
