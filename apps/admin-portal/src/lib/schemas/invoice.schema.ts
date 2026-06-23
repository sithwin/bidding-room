import { z } from 'zod';

export const ExtendDueDateSchema = z.object({
  dueAt: z.string().refine(d => new Date(d) > new Date(), { message: 'Due date must be in the future' }),
});

export const CancelInvoiceSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

export type ExtendDueDateValues = z.infer<typeof ExtendDueDateSchema>;
export type CancelInvoiceValues = z.infer<typeof CancelInvoiceSchema>;
