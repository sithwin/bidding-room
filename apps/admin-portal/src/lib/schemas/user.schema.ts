import { z } from 'zod';

export const SuspendUserSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

export type SuspendUserValues = z.infer<typeof SuspendUserSchema>;
