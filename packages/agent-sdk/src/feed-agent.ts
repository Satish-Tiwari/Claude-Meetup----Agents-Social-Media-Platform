import { AgentClient, AgentClientOptions } from './agent-client';
import { ResponseCache } from './cache';
import { fetchJson, FetchOptions } from './http';
import { DailyBudgetExceeded, RateLimiter } from './rate-limiter';
import { RateLimitSpec, RawItem } from './types';

export interface FeedAgentOptions extends AgentClientOptions {
  /** Channel slug this feed posts to (e.g. "news"). */
  channel: string;
  cache: ResponseCache;
  /** Documented free-tier limits of the upstream API, enforced client-side. */
  rateLimit?: RateLimitSpec;
  /** Cap per poll, so a first run against a busy API does not flood the feed. */
  maxPostsPerTick?: number;
  /** Human-readable source name stamped into post meta (e.g. "GNews"). */
  sourceName?: string;
}

/**
 * Poll an external API on a schedule and turn results into Pulse posts.
 *
 * Concrete feeds implement four things: how often to poll, how to fetch, what
 * is worth posting, and how to phrase it. Everything operational lives here:
 * registration, heartbeat, scheduling with jitter, retry/backoff on failure,
 * rate-limit compliance, response caching, and a persisted dedup set warmed
 * from the platform so restarts never repost.
 */
export abstract class FeedAgent extends AgentClient {
  abstract readonly pollIntervalMs: number;
  abstract fetchData(): Promise<RawItem[]>;
  abstract shouldPost(item: RawItem): boolean;
  abstract formatMessage(item: RawItem): string;

  /** Title shown above the message. Defaults to the item's own title. */
  protected formatTitle(item: RawItem): string | undefined {
    return item.title;
  }

  /**
   * Optional periodic summary (e.g. an hourly market heartbeat). Return null
   * to skip this round. Enable by setting `summaryIntervalMs` > 0.
   */
  protected summaryIntervalMs = 0;
  protected async buildSummary(): Promise<{ title?: string; content: string; meta?: Record<string, unknown> } | null> {
    return null;
  }

  protected readonly channel: string;
  protected readonly cache: ResponseCache;
  protected readonly limiter: RateLimiter;
  protected readonly maxPostsPerTick: number;
  protected readonly sourceName: string;

  private readonly seen = new Set<string>();
  private pollTimer: NodeJS.Timeout | null = null;
  private summaryTimer: NodeJS.Timeout | null = null;
  private running = false;
  private consecutiveFailures = 0;
  private postedThisSession = 0;
  private lastPollAt: Date | null = null;
  private lastError: string | null = null;
  private nextPollAt: Date | null = null;

  constructor(opts: FeedAgentOptions) {
    super(opts);
    this.channel = opts.channel;
    this.cache = opts.cache;
    this.maxPostsPerTick = opts.maxPostsPerTick ?? 5;
    this.sourceName = opts.sourceName ?? opts.identity.displayName;
    this.limiter = new RateLimiter(opts.identity.username, opts.rateLimit ?? {}, opts.cache);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.running) return;
    await this.register();
    await this.warmSeen();
    this.startHeartbeat();
    this.running = true;
    this.log.info(`polling every ${Math.round(this.pollIntervalMs / 1000)}s -> #${this.channel} (cache: ${this.cache.kind})`);
    void this.tick();
    if (this.summaryIntervalMs > 0) {
      this.summaryTimer = setInterval(() => void this.summaryTick(), this.summaryIntervalMs);
    }
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.summaryTimer) clearInterval(this.summaryTimer);
    this.pollTimer = null;
    this.summaryTimer = null;
    this.stopHeartbeat();
    this.log.info('stopped');
  }

  private async warmSeen() {
    try {
      const ids = await this.platform.seenExternalIds(this.identity.username, 1000);
      ids.forEach((id) => this.seen.add(id));
      if (ids.length) this.log.info(`dedup set warmed with ${ids.length} previously posted item(s)`);
    } catch (err) {
      this.log.warn(`could not warm dedup set: ${(err as Error).message} (server-side uniqueness still protects against repeats)`);
    }
  }

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------

  private async tick() {
    if (!this.running) return;
    try {
      const items = await this.fetchData();
      this.lastPollAt = new Date();
      let posted = 0;
      let skipped = 0;
      for (const item of items) {
        if (!item?.id) continue;
        if (this.seen.has(item.id)) continue;
        if (!this.shouldPost(item)) {
          skipped++;
          continue;
        }
        if (await this.postItem(item)) posted++;
        if (posted >= this.maxPostsPerTick) break;
      }
      this.consecutiveFailures = 0;
      this.lastError = null;
      this.log.info(`poll ok: ${items.length} item(s), ${posted} posted, ${skipped} filtered, ${this.seen.size} known`);
    } catch (err) {
      this.consecutiveFailures++;
      this.lastError = (err as Error).message;
      const level = err instanceof DailyBudgetExceeded ? 'warn' : 'error';
      this.log[level](`poll failed (${this.consecutiveFailures} in a row): ${this.lastError}`);
    } finally {
      if (this.running) {
        const delay = this.nextDelay();
        this.nextPollAt = new Date(Date.now() + delay);
        this.pollTimer = setTimeout(() => void this.tick(), delay);
      }
    }
  }

  /** Base interval with ±10% jitter; doubles per consecutive failure up to 8x. */
  private nextDelay(): number {
    const backoff = Math.min(2 ** this.consecutiveFailures, 8);
    const jitter = 0.9 + Math.random() * 0.2;
    return Math.round(this.pollIntervalMs * backoff * jitter);
  }

  private async summaryTick() {
    if (!this.running) return;
    try {
      const summary = await this.buildSummary();
      if (!summary) return;
      await this.post({
        channel: this.channel,
        title: summary.title,
        content: summary.content,
        meta: { ...(summary.meta ?? {}), source: this.sourceName, kind: 'summary' },
      });
      this.log.info('summary posted');
    } catch (err) {
      this.log.warn(`summary failed: ${(err as Error).message}`);
    }
  }

  /** Post one item; returns false when the platform already had it. */
  protected async postItem(item: RawItem): Promise<boolean> {
    const result = await this.post({
      channel: this.channel,
      title: this.formatTitle(item),
      content: this.formatMessage(item),
      url: item.url,
      externalId: item.id,
      meta: { source: this.sourceName, publishedAt: item.publishedAt, ...(item.meta ?? {}) },
    });
    this.seen.add(item.id);
    if (result.duplicate) return false;
    this.postedThisSession++;
    this.log.debug(`posted: ${item.title ?? item.id}`);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Helpers for subclasses
  // ---------------------------------------------------------------------------

  /**
   * GET JSON through the cache and the rate limiter. TTL defaults to the poll
   * interval, so a second instance (or a dashboard refresh) reuses the response
   * instead of spending another request against the upstream budget.
   */
  protected async fetchJsonCached<T>(url: string, opts: FetchOptions & { ttlMs?: number; cacheKey?: string } = {}): Promise<T> {
    const key = `resp:${opts.cacheKey ?? url}`;
    const hit = await this.cache.get<T>(key);
    if (hit !== null) {
      this.log.debug(`cache hit: ${opts.cacheKey ?? url}`);
      return hit;
    }
    await this.limiter.take();
    const data = await fetchJson<T>(url, { log: this.log, ...opts });
    await this.cache.set(key, data, opts.ttlMs ?? this.pollIntervalMs);
    return data;
  }

  protected heartbeatPayload(): Record<string, unknown> {
    return {
      state: this.lastError ? 'degraded' : 'polling',
      channel: this.channel,
      lastPollAt: this.lastPollAt,
      nextPollAt: this.nextPollAt,
      lastError: this.lastError,
      postedThisSession: this.postedThisSession,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}
