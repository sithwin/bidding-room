import { z } from 'zod';

export const LotCondition = z.enum(['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR']);

export const LotFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  categoryId: z.string().uuid('Select a category'),
  condition: LotCondition,
  estimatedValue: z.number({ invalid_type_error: 'Enter a number' }).positive('Must be positive'),
});

export type LotFormValues = z.infer<typeof LotFormSchema>;
