import { describe, it, expect, vi, beforeEach } from 'vitest';
import Redis from 'ioredis';
import { RedisLockAdapter } from './redis-lock';

vi.mock('ioredis');

describe('RedisLockAdapter', () => {
  let mockRedis: { set: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };
  let lock: RedisLockAdapter;

  beforeEach(() => {
    mockRedis = { set: vi.fn(), del: vi.fn() };
    vi.mocked(Redis).mockImplementation(() => mockRedis as unknown as Redis);
    lock = new RedisLockAdapter({ host: 'localhost', port: 6379 });
  });

  it('should_returnTrue_when_lockAcquiredSuccessfully', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await lock.acquire('bid-lock:lot-1', 5000);

    expect(result).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith('bid-lock:lot-1', '1', 'PX', 5000, 'NX');
  });

  it('should_returnFalse_when_lockAlreadyHeld', async () => {
    mockRedis.set.mockResolvedValue(null);

    const result = await lock.acquire('bid-lock:lot-1', 5000);

    expect(result).toBe(false);
  });
});
