import { z } from 'zod';

export const ScheduleAuctionSchema = z
  .object({
    lotId: z.string().uuid('Select a lot'),
    startAt: z.string().datetime('Invalid start date'),
    endAt: z.string().datetime('Invalid end date'),
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
    startAt: z.string().datetime('Invalid start date'),
    endAt: z.string().datetime('Invalid end date'),
  })
  .refine(data => new Date(data.endAt) > new Date(data.startAt), {
    message: 'End date must be after start date',
    path: ['endAt'],
  });

export type ScheduleAuctionValues = z.infer<typeof ScheduleAuctionSchema>;
export type RescheduleAuctionValues = z.infer<typeof RescheduleAuctionSchema>;
