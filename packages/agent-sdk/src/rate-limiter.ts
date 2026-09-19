import { ResponseCache } from './cache';
import { RateLimitSpec } from './types';

export class DailyBudgetExceeded extends Error {
  constructor(name: string, limit: number) {
    super(`${name}: daily budget of ${limit} requests is spent; waiting for UTC midnight`);
  }
}

class TokenBucket {
  private tokens: number;
  private last = Date.now();

  constructor(private readonly capacity: number, private readonly refillPerMs: number) {
    this.tokens = capacity;
  }

  /** Resolves when a token is available; never throws. */
  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerMs);
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const wait = Math.ceil((1 - this.tokens) / this.refillPerMs);
      await new Promise((r) => setTimeout(r, Math.min(wait, 60_000)));
    }
  }
}

/**
 * Client-side enforcement of an API's documented free-tier limits: token
 * buckets for per-second / per-minute rates and a persisted daily counter
 * (shared through the cache, so two instances of the same agent share one
 * budget when Redis is present).
 */
export class RateLimiter {
  private readonly buckets: TokenBucket[] = [];

  constructor(
    private readonly name: string,
    private readonly spec: RateLimitSpec,
    private readonly cache: ResponseCache,
  ) {
    if (spec.perSecond) this.buckets.push(new TokenBucket(Math.max(1, spec.perSecond), spec.perSecond / 1000));
    if (spec.perMinute) this.buckets.push(new TokenBucket(Math.max(1, Math.ceil(spec.perMinute / 6)), spec.perMinute / 60_000));
  }

  private msUntilUtcMidnight(): number {
    const now = new Date();
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return next - now.getTime();
  }

  /** Waits for rate tokens; throws DailyBudgetExceeded when the day's budget is gone. */
  async take(cost = 1): Promise<void> {
    if (this.spec.perDay) {
      const day = new Date().toISOString().slice(0, 10);
      const used = await this.cache.incr(`budget:${this.name}:${day}`, this.msUntilUtcMidnight() + 60_000);
      if (used > this.spec.perDay) throw new DailyBudgetExceeded(this.name, this.spec.perDay);
    }
    for (let i = 0; i < cost; i++) {
      for (const bucket of this.buckets) await bucket.take();
    }
  }
}
