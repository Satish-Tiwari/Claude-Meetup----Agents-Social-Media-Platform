import { createHash } from 'crypto';
import { FeedAgent, FeedDefinition, RawItem } from '@calling-platform/agent-sdk';
import type { FeedContext } from '../registry';

interface GNewsResponse {
  totalArticles: number;
  articles: Array<{
    title: string;
    description: string;
    url: string;
    image?: string;
    publishedAt: string;
    source: { name: string; url: string };
  }>;
}

interface HnItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  time?: number;
  type?: string;
}

interface DevToArticle {
  id: number;
  title: string;
  description: string;
  url: string;
  published_at: string;
  positive_reactions_count: number;
  tag_list: string[];
  user: { name: string };
}

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 24);

/**
 * NewsAgent - headlines for configured keywords/categories.
 *
 * Primary source is GNews (free key, 100 req/day). When no key is configured
 * the agent does not crash: it logs a warning and runs on a keyless fallback
 * (Hacker News front page + DEV Community, filtered by the same keywords),
 * so the feed is alive on a fresh checkout. Swapping providers touches only
 * `fetchData` - the base class does not care where items come from.
 */
export class NewsAgent extends FeedAgent {
  readonly pollIntervalMs: number;
  private readonly provider: 'gnews' | 'keyless-fallback';
  private readonly apiKey: string;
  private readonly keywords: string[];
  private readonly category: string;
  private readonly lang: string;
  private readonly max: number;
  private readonly minScore: number;

  constructor(def: FeedDefinition, ctx: FeedContext) {
    const o = def.options ?? {};
    const apiKey = String(o.apiKey ?? '').trim();
    const provider: 'gnews' | 'keyless-fallback' = apiKey ? 'gnews' : 'keyless-fallback';

    super({
      identity: {
        username: 'news-agent',
        displayName: def.displayName ?? 'NewsAgent',
        role: def.role ?? 'News Feed',
        capabilities: def.capabilities ?? ['news', 'current-events'],
        accentColor: def.accentColor ?? '#6366f1',
        statusMessage: provider === 'gnews' ? 'Reading GNews' : 'Reading Hacker News + DEV (no GNews key)',
        agentKind: 'feed',
      },
      platform: ctx.platform,
      cache: ctx.cache,
      channel: def.channel,
      maxPostsPerTick: def.maxPostsPerTick ?? ctx.defaults.maxPostsPerTick ?? 5,
      heartbeatIntervalMs: ctx.defaults.heartbeatIntervalMs,
      sourceName: provider === 'gnews' ? 'GNews' : 'Hacker News / DEV',
      // GNews free tier: 100 requests/day. The fallback endpoints are generous
      // but we still stay polite.
      rateLimit: def.rateLimit ?? (provider === 'gnews' ? { perDay: 95, perMinute: 5 } : { perMinute: 30 }),
    });

    this.pollIntervalMs = def.pollIntervalMs;
    this.provider = provider;
    this.apiKey = apiKey;
    this.keywords = (o.keywords ?? ['AI', 'artificial intelligence', 'OpenAI', 'Anthropic', 'Nvidia', 'LLM']).map((k: string) => k.toLowerCase());
    this.category = o.category ?? 'technology';
    this.lang = o.lang ?? 'en';
    this.max = Math.min(Number(o.max ?? 10), 10);
    this.minScore = Number(o.minScore ?? 80);

    if (this.provider === 'keyless-fallback') {
      this.log.warn('GNEWS_API_KEY not set - running on the keyless fallback (Hacker News + DEV Community). Get a free key at https://gnews.io/register to switch to real headlines.');
    }
  }

  async fetchData(): Promise<RawItem[]> {
    return this.provider === 'gnews' ? this.fetchGNews() : this.fetchFallback();
  }

  shouldPost(item: RawItem): boolean {
    if (!item.title || !item.url) return false;
    if (this.provider === 'gnews') return true; // already keyword/category filtered upstream
    const score = Number(item.meta?.score ?? 0);
    const matchesKeyword = this.keywords.some((k) => item.title!.toLowerCase().includes(k));
    return matchesKeyword || score >= this.minScore * 2;
  }

  formatMessage(item: RawItem): string {
    const summary = (item.text ?? '').trim();
    const source = String(item.meta?.source ?? this.sourceName);
    return summary ? `${summary}\n\n— ${source}` : `— ${source}`;
  }

  // ---------------------------------------------------------------------------

  private async fetchGNews(): Promise<RawItem[]> {
    const q = this.keywords.length ? `&q=${encodeURIComponent(this.keywords.slice(0, 6).join(' OR '))}` : '';
    const url = `https://gnews.io/api/v4/top-headlines?category=${this.category}&lang=${this.lang}&max=${this.max}${q}&apikey=${this.apiKey}`;
    const data = await this.fetchJsonCached<GNewsResponse>(url, { cacheKey: `gnews:${this.category}:${this.lang}:${q}` });
    return (data.articles ?? []).map((a) => ({
      id: sha1(a.url),
      title: a.title,
      text: a.description,
      url: a.url,
      publishedAt: a.publishedAt,
      meta: { source: a.source?.name ?? 'GNews', image: a.image, provider: 'gnews' },
    }));
  }

  private async fetchFallback(): Promise<RawItem[]> {
    const [hn, devto] = await Promise.allSettled([this.fetchHackerNews(), this.fetchDevTo()]);
    const items: RawItem[] = [];
    if (hn.status === 'fulfilled') items.push(...hn.value);
    else this.log.warn(`Hacker News fetch failed: ${hn.reason?.message ?? hn.reason}`);
    if (devto.status === 'fulfilled') items.push(...devto.value);
    else this.log.warn(`DEV fetch failed: ${devto.reason?.message ?? devto.reason}`);
    if (hn.status === 'rejected' && devto.status === 'rejected') throw new Error('both fallback sources failed');
    // Newest first so the feed reads chronologically after posting.
    return items.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  }

  private async fetchHackerNews(): Promise<RawItem[]> {
    const ids = await this.fetchJsonCached<number[]>('https://hacker-news.firebaseio.com/v0/topstories.json', { cacheKey: 'hn:top' });
    const top = ids.slice(0, 30);
    const stories = await Promise.all(
      top.map((id) =>
        this.fetchJsonCached<HnItem>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          cacheKey: `hn:item:${id}`,
          ttlMs: 60 * 60_000,
        }).catch(() => null),
      ),
    );
    return stories
      .filter((s): s is HnItem => !!s && s.type === 'story' && !!s.title)
      .filter((s) => (s.score ?? 0) >= this.minScore)
      .map((s) => ({
        id: `hn-${s.id}`,
        title: s.title!,
        text: `${s.score ?? 0} points · ${s.descendants ?? 0} comments`,
        url: s.url ?? `https://news.ycombinator.com/item?id=${s.id}`,
        publishedAt: s.time ? new Date(s.time * 1000).toISOString() : undefined,
        meta: { source: 'Hacker News', score: s.score ?? 0, comments: s.descendants ?? 0, discussion: `https://news.ycombinator.com/item?id=${s.id}`, provider: 'hackernews' },
      }));
  }

  private async fetchDevTo(): Promise<RawItem[]> {
    const articles = await this.fetchJsonCached<DevToArticle[]>('https://dev.to/api/articles?tag=ai&top=1&per_page=15', { cacheKey: 'devto:ai:top1' });
    return articles.map((a) => ({
      id: `devto-${a.id}`,
      title: a.title,
      text: a.description,
      url: a.url,
      publishedAt: a.published_at,
      meta: { source: 'DEV Community', score: a.positive_reactions_count, author: a.user?.name, tags: a.tag_list, provider: 'devto' },
    }));
  }
}
