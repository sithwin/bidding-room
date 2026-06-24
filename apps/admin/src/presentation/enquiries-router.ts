import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import type { ValuationEnquiry } from '../infrastructure/postgres-enquiry-repository';
import { R2UploadClient } from '../infrastructure/r2-upload-client';

interface Deps {
  submitEnquiry: (input: ValuationEnquiry) => Promise<{ ok: true }>;
  r2: R2UploadClient;
}

const ALLOWED_UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function buildEnquiriesRouter(deps: Deps): Hono {
  const router = new Hono();

  // Public endpoint — no auth required for valuation image uploads
  router.post('/api/admin/enquiries/valuation/upload', async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) return c.json({ error: 'Missing file' }, 400);
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) return c.json({ error: 'Unsupported file type' }, 422);

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_UPLOAD_BYTES) return c.json({ error: 'File exceeds 20 MB limit' }, 422);

    const ext = file.name.split('.').pop() ?? 'bin';
    const key = `valuation-enquiries/uploads/${randomUUID()}.${ext}`;
    await deps.r2.upload(key, buffer, file.type);

    return c.json({ key });
  });

  // Public endpoint — no auth required for valuation enquiry submission
  router.post('/api/admin/enquiries/valuation', async (c) => {
    const input = await c.req.json<{
      category: string;
      artistMaker?: string;
      description: string;
      photoKeys: string[];
      name: string;
      email: string;
    }>();
    const result = await deps.submitEnquiry({
      category: input.category,
      artistMaker: input.artistMaker ?? null,
      description: input.description,
      photoKeys: input.photoKeys,
      name: input.name,
      email: input.email,
    });
    return c.json(result);
  });

  return router;
}
