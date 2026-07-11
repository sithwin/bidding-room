import { z } from 'zod';

// <input type='datetime-local'> emits e.g. '2026-07-09T14:30' — no seconds, no
// timezone — which z.string().datetime() rejects. Accept anything Date-parseable
// and normalise to full ISO so downstream services receive one canonical format.
const IsoFromLocalDateTime = (message: string) =>
  z
    .string()
    .min(1, message)
    .refine(value => !Number.isNaN(Date.parse(value)), message)
    .transform(value => new Date(value).toISOString());

export const ScheduleAuctionSchema = z
  .object({
    lotId: z.string().uuid('Select a lot'),
    startAt: IsoFromLocalDateTime('Invalid start date'),
    endAt: IsoFromLocalDateTime('Invalid end date'),
    reservePrice: z.number({ invalid_type_error: 'Enter a number' }).nonnegative('Cannot be negative'),
    minBidIncrement: z.number({ invalid_type_error: 'Enter a number' }).positive('Must be positive'),
    autoExtendWindowMinutes: z.number({ invalid_type_error: 'Enter a number' }).int().positive('Must be positive'),
    autoExtendDurationMinutes: z.number({ invalid_type_error: 'Enter a number' }).int().positive('Must be positive'),
  })
  .refine(data => new Date(data.endAt) > new Date(data.startAt), {
    message: 'End date must be after start date',
    path: ['endAt'],
  });

export const RescheduleAuctionSchema = z
  .object({
    startAt: IsoFromLocalDateTime('Invalid start date'),
    endAt: IsoFromLocalDateTime('Invalid end date'),
  })
  .refine(data => new Date(data.endAt) > new Date(data.startAt), {
    message: 'End date must be after start date',
    path: ['endAt'],
  });

export type ScheduleAuctionValues = z.infer<typeof ScheduleAuctionSchema>;
export type RescheduleAuctionValues = z.infer<typeof RescheduleAuctionSchema>;
