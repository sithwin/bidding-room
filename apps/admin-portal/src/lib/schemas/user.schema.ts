import { z } from 'zod';

export const SuspendUserSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

export type SuspendUserValues = z.infer<typeof SuspendUserSchema>;

const OptionalCountry = z
  .union([z.string().length(0), z.string().min(2, 'Use an ISO country code')])
  .optional()
  .transform(value => (value ? value : undefined));

export const CreateUserSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  role: z.enum(['BUYER', 'ADMIN'], { errorMap: () => ({ message: 'Select a role' }) }),
  country: OptionalCountry,
});

export const UpdateUserSchema = z.object({
  email: z.string().email('Enter a valid email'),
  country: OptionalCountry,
});

export type CreateUserValues = z.infer<typeof CreateUserSchema>;
export type UpdateUserValues = z.infer<typeof UpdateUserSchema>;
