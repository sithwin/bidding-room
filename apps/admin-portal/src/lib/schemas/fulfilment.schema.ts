import { z } from 'zod';

export const MarkDispatchedSchema = z.object({
  trackingNumber: z.string().min(1, 'Tracking number is required'),
  carrier: z.string().min(1, 'Carrier is required'),
});

export type MarkDispatchedValues = z.infer<typeof MarkDispatchedSchema>;
