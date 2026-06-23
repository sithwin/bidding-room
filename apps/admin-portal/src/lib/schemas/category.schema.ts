import { z } from 'zod';

export const CategoryFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  parentId: z.string().uuid().optional(),
});

export type CategoryFormValues = z.infer<typeof CategoryFormSchema>;
