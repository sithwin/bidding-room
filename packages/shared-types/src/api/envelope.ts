import { z } from 'zod';

// Standard single-resource envelope: { data: <resource> }
export const envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ data });

// Standard list envelope: { data: [...], meta: {...} }.
// meta is permissive because services differ today (catalogue: total/limit/offset;
// auction-engine: page/total). Tighten per-service in that service's schema module.
export const listEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    meta: z.object({
      total: z.number(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      page: z.number().optional(),
    }),
  });
