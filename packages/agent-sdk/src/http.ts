import { Logger } from './types';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly bodySnippet: string,
  ) {
    super(`HTTP ${status} from ${url}: ${bodySnippet}`);
  }
}

export interface FetchOptions {
  headers?: Record<string, string>;
  /** Attempts on 429 / 5xx / network errors. */
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  log?: Logger;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch + JSON with exponential backoff. Honours Retry-After on 429, never
 * retries other 4xx (they will not get better), and caps the wait so a
 * misbehaving API cannot stall the poll loop forever.
 */
export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const { headers = {}, retries = 3, baseDelayMs = 1000, timeoutMs = 15000, log } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'calling-platform-feed-agent/0.1', ...headers },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) return (await res.json()) as T;

      const snippet = (await res.text().catch(() => '')).slice(0, 160).replace(/\s+/g, ' ');
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === retries) throw new HttpError(res.status, url, snippet);

      const retryAfter = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 120_000)
        : Math.min(baseDelayMs * 2 ** attempt + Math.random() * 500, 60_000);
      log?.warn(`HTTP ${res.status} from ${url} - retrying in ${Math.round(wait / 1000)}s (${attempt + 1}/${retries})`);
      await sleep(wait);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof HttpError) throw err;
      lastErr = err;
      if (attempt === retries) break;
      const wait = Math.min(baseDelayMs * 2 ** attempt + Math.random() * 500, 60_000);
      log?.warn(`${(err as Error)?.name === 'AbortError' ? 'timeout' : (err as Error)?.message} on ${url} - retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`fetch failed: ${url}`);
}
