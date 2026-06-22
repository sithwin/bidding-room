import Redis from 'ioredis';
import { RedisLock } from '../application/place-bid-handler';

interface RedisOptions {
  host: string;
  port: number;
}

export class RedisLockAdapter implements RedisLock {
  private readonly redis: Redis;

  constructor(options: RedisOptions) {
    this.redis = new Redis(options);
  }

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async release(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
