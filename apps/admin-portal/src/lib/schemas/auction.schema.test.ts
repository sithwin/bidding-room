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
