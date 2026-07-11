import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { authMiddleware } from '@carat-room/shared-auth';
import type { EnquiryStatus, StoredValuationEnquiry, ValuationEnquiry } from '../infrastructure/postgres-enquiry-repository';
import { R2UploadClient } from '../infrastructure/r2-upload-client';

interface Deps {
  submitEnquiry: (input: ValuationEnquiry) => Promise<{ ok: true }>;
  r2: R2UploadClient;
  listEnquiries: (filter: { status?: string }) => Promise<StoredValuationEnquiry[]>;
  updateEnquiryStatus: (id: string, status: EnquiryStatus) => Promise<boolean>;
}

const ALLOWED_UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const jwtPublicKey = (process.env['JWT_PUBLIC_KEY'] ?? '').replace(/\\n/g, '\n');

export function buildEnquiriesRouter(deps: Deps): Hono {
  const router = new Hono();
  const adminOnly = authMiddleware(jwtPublicKey, { adminOnly: true });

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

  router.get('/admin/api/enquiries', adminOnly, async (c) => {
    const enquiries = await deps.listEnquiries({ status: c.req.query('status') });
    return c.json({ data: enquiries });
  });

  router.patch('/admin/api/enquiries/:id/status', adminOnly, async (c) => {
    const { status } = await c.req.json<{ status?: string }>();
    if (status !== 'RESPONDED' && status !== 'CLOSED') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'status must be RESPONDED or CLOSED' } }, 400);
    }
    const wasUpdated = await deps.updateEnquiryStatus(c.req.param('id'), status);
    if (!wasUpdated) return c.json({ error: { code: 'NOT_FOUND', message: 'Enquiry not found' } }, 404);
    return c.json({ data: { id: c.req.param('id') } });
  });

  return router;
}
