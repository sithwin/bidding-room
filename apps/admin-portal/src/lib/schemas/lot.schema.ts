import { z } from 'zod';
import { LOT_ACTIVE_STATUSES } from '@carat-room/shared-types';

// Mirrors apps/catalogue LotCondition — FAIR is not a valid catalogue condition
export const LOT_CONDITIONS = ['NEW', 'EXCELLENT', 'VERY_GOOD', 'GOOD'] as const;

export const LotCondition = z.enum(LOT_CONDITIONS);

export const LotFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  categoryId: z.string().uuid('Select a category'),
  condition: LotCondition,
  status: z.enum(LOT_ACTIVE_STATUSES),
  estimatedValue: z.number({ invalid_type_error: 'Enter a number' }).positive('Must be positive'),
});

export type LotFormValues = z.infer<typeof LotFormSchema>;
