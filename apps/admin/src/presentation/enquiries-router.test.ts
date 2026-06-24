import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { buildEnquiriesRouter } from './enquiries-router';

const mockSubmit = vi.fn().mockResolvedValue({ ok: true });
const mockR2 = { upload: vi.fn().mockResolvedValue(undefined) };

describe('enquiries-router', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmit.mockResolvedValue({ ok: true });
    mockR2.upload.mockResolvedValue(undefined);
    app = new Hono();
    app.route('/', buildEnquiriesRouter({ submitEnquiry: mockSubmit as any, r2: mockR2 as any }));
  });

  it('POST /enquiries/valuation returns ok', async () => {
    const res = await app.request('/enquiries/valuation', {
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

  it('POST /enquiries/valuation/upload returns 400 when no file provided', async () => {
    const formData = new FormData();
    const res = await app.request('/enquiries/valuation/upload', {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Missing file' });
  });

  it('POST /enquiries/valuation/upload returns 422 for unsupported file type', async () => {
    const formData = new FormData();
    formData.append('file', new File(['data'], 'test.gif', { type: 'image/gif' }));
    const res = await app.request('/enquiries/valuation/upload', {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unsupported file type' });
  });

  it('POST /enquiries/valuation/upload returns key on success', async () => {
    const formData = new FormData();
    formData.append('file', new File(['img-data'], 'photo.jpg', { type: 'image/jpeg' }));
    const res = await app.request('/enquiries/valuation/upload', {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { key: string };
    expect(body.key).toMatch(/^valuation-enquiries\/uploads\/.+\.jpg$/);
    expect(mockR2.upload).toHaveBeenCalledOnce();
  });
});
