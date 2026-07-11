import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { buildEnquiriesRouter } from './enquiries-router';

vi.mock('@carat-room/shared-auth', () => ({
  authMiddleware: () => async (
    c: { set: (k: string, v: unknown) => void },
    next: () => Promise<void>,
  ) => {
    c.set('jwtPayload', { sub: 'admin-1', role: 'ADMIN' });
    await next();
  },
}));

const mockSubmit = vi.fn().mockResolvedValue({ ok: true });
const mockR2 = { upload: vi.fn().mockResolvedValue(undefined) };
const mockListEnquiries = vi.fn().mockResolvedValue([]);
const mockUpdateEnquiryStatus = vi.fn().mockResolvedValue(true);
const authHeader = () => ({ Authorization: 'Bearer admin-token' });

describe('enquiries-router', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmit.mockResolvedValue({ ok: true });
    mockR2.upload.mockResolvedValue(undefined);
    mockListEnquiries.mockResolvedValue([]);
    mockUpdateEnquiryStatus.mockResolvedValue(true);
    app = new Hono();
    app.route('/', buildEnquiriesRouter({
      submitEnquiry: mockSubmit as any,
      r2: mockR2 as any,
      listEnquiries: mockListEnquiries,
      updateEnquiryStatus: mockUpdateEnquiryStatus,
    }));
  });

  it('POST /api/admin/enquiries/valuation returns ok', async () => {
    const res = await app.request('/api/admin/enquiries/valuation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'Jewellery',
        description: 'Ring',
        photoKeys: [],
        name: 'Jane',
        email: 'j@x.com',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockSubmit).toHaveBeenCalledOnce();
  });

  it('POST /api/admin/enquiries/valuation/upload returns 400 when no file provided', async () => {
    const formData = new FormData();
    const res = await app.request('/api/admin/enquiries/valuation/upload', {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Missing file' });
  });

  it('POST /api/admin/enquiries/valuation/upload returns 422 for unsupported file type', async () => {
    const formData = new FormData();
    formData.append('file', new File(['data'], 'test.gif', { type: 'image/gif' }));
    const res = await app.request('/api/admin/enquiries/valuation/upload', {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unsupported file type' });
  });

  it('POST /api/admin/enquiries/valuation/upload returns key on success', async () => {
    const formData = new FormData();
    formData.append('file', new File(['img-data'], 'photo.jpg', { type: 'image/jpeg' }));
    const res = await app.request('/api/admin/enquiries/valuation/upload', {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { key: string };
    expect(body.key).toMatch(/^valuation-enquiries\/uploads\/.+\.jpg$/);
    expect(mockR2.upload).toHaveBeenCalledOnce();
  });

  it('GET /admin/api/enquiries returns 200 with enquiries', async () => {
    mockListEnquiries.mockResolvedValue([
      { id: 'enq-1', category: 'Jewellery', artistMaker: null, description: 'Ring', photoKeys: [], name: 'Jane', email: 'j@x.com', status: 'NEW', createdAt: '2026-07-01T00:00:00Z' },
    ]);

    const res = await app.request('/admin/api/enquiries', { headers: authHeader() });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockListEnquiries).toHaveBeenCalledWith({ status: undefined });
    expect(body.data).toHaveLength(1);
  });

  it('GET /admin/api/enquiries forwards the status query param', async () => {
    await app.request('/admin/api/enquiries?status=NEW', { headers: authHeader() });

    expect(mockListEnquiries).toHaveBeenCalledWith({ status: 'NEW' });
  });

  it('PATCH /admin/api/enquiries/:id/status returns 200 on success', async () => {
    const res = await app.request('/admin/api/enquiries/enq-1/status', {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESPONDED' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockUpdateEnquiryStatus).toHaveBeenCalledWith('enq-1', 'RESPONDED');
    expect(body).toEqual({ data: { id: 'enq-1' } });
  });

  it('PATCH /admin/api/enquiries/:id/status returns 400 for an invalid status', async () => {
    const res = await app.request('/admin/api/enquiries/enq-1/status', {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'BOGUS' }),
    });

    expect(res.status).toBe(400);
    expect(mockUpdateEnquiryStatus).not.toHaveBeenCalled();
  });

  it('PATCH /admin/api/enquiries/:id/status returns 404 when the id is unknown', async () => {
    mockUpdateEnquiryStatus.mockResolvedValue(false);

    const res = await app.request('/admin/api/enquiries/missing/status', {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CLOSED' }),
    });

    expect(res.status).toBe(404);
  });
});
