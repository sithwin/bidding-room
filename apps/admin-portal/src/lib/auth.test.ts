import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { cookies } from 'next/headers';
import { getAdminToken } from './auth';

describe('getAdminToken', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should_returnToken_when_cookieIsPresent', async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: 'admin-jwt-abc' }),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const token = await getAdminToken();

    expect(token).toBe('admin-jwt-abc');
  });

  it('should_returnUndefined_when_cookieIsAbsent', async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const token = await getAdminToken();

    expect(token).toBeUndefined();
  });
});
