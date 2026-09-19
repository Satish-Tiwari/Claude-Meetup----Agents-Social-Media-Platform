import Redis from 'ioredis';
import { Logger } from './types';

/**
 * Short-lived cache for raw API responses plus atomic counters for daily
 * budgets. Redis when available (shared across agent instances), otherwise
 * in-memory - either way the agent keeps working.
 */
export interface ResponseCache {
  readonly kind: 'redis' | 'memory';
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
  /** Increment a counter, setting its expiry on first use. Returns the new value. */
  incr(key: string, ttlMs: number): Promise<number>;
  close(): Promise<void>;
}

export class MemoryCache implements ResponseCache {
  readonly kind = 'memory' as const;
  private store = new Map<string, { value: unknown; expiresAt: number }>();
  private counters = new Map<string, { value: number; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value as T;
  }

  async set(key: string, value: unknown, ttlMs: number) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async incr(key: string, ttlMs: number) {
    const now = Date.now();
    const cur = this.counters.get(key);
    if (!cur || cur.expiresAt < now) {
      this.counters.set(key, { value: 1, expiresAt: now + ttlMs });
      return 1;
    }
    cur.value += 1;
    return cur.value;
  }

  async close() {
    this.store.clear();
    this.counters.clear();
  }
}

export class RedisCache implements ResponseCache {
  readonly kind = 'redis' as const;
  private readonly redis: Redis;
  private readonly fallback = new MemoryCache();
  private healthy = true;

  constructor(url: string, private readonly log?: Logger, private readonly prefix = 'cp:feeds:') {
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 2000, 30_000),
    });
    this.redis.on('error', (err) => {
      if (this.healthy) this.log?.warn(`Redis unavailable (${err.message}) - using in-memory cache until it returns`);
      this.healthy = false;
    });
    this.redis.on('ready', () => {
      if (!this.healthy) this.log?.info('Redis connection restored');
      this.healthy = true;
    });
    this.redis.connect().catch(() => undefined);
  }

  private key(k: string) {
    return this.prefix + k;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.healthy) return this.fallback.get<T>(key);
    try {
      const raw = await this.redis.get(this.key(key));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return this.fallback.get<T>(key);
    }
  }

  async set(key: string, value: unknown, ttlMs: number) {
    await this.fallback.set(key, value, ttlMs);
    if (!this.healthy) return;
    try {
      await this.redis.set(this.key(key), JSON.stringify(value), 'PX', Math.max(ttlMs, 1000));
    } catch {
      /* fallback already holds it */
    }
  }

  async incr(key: string, ttlMs: number) {
    if (!this.healthy) return this.fallback.incr(key, ttlMs);
    try {
      const k = this.key(key);
      const value = await this.redis.incr(k);
      if (value === 1) await this.redis.pexpire(k, ttlMs);
      return value;
    } catch {
      return this.fallback.incr(key, ttlMs);
    }
  }

  async close() {
    await this.fallback.close();
    this.redis.disconnect();
  }
}

export function createCache(redisUrl: string | undefined, log?: Logger): ResponseCache {
  if (redisUrl && redisUrl.trim()) {
    log?.info(`Response cache: redis (${redisUrl.replace(/\/\/.*@/, '//***@')})`);
    return new RedisCache(redisUrl.trim(), log);
  }
  log?.info('Response cache: in-memory (set REDIS_URL to share across instances)');
  return new MemoryCache();
}
