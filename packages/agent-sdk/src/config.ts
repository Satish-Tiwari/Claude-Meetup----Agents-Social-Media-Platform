import * as fs from 'fs';
import { RateLimitSpec } from './types';

export interface FeedDefinition {
  /** Unique id, also the FEED env value that selects it. */
  id: string;
  /** Implementation to use (news, crypto-eth, weather, ...). */
  type: string;
  enabled: boolean;
  channel: string;
  displayName?: string;
  role?: string;
  capabilities?: string[];
  accentColor?: string;
  pollIntervalMs: number;
  maxPostsPerTick?: number;
  rateLimit?: RateLimitSpec;
  /** Feed-specific settings (keys, keywords, thresholds). */
  options?: Record<string, any>;
}

export interface FeedsConfig {
  platform: { baseUrl: string; agentKey: string };
  redisUrl?: string;
  defaults?: { maxPostsPerTick?: number; heartbeatIntervalMs?: number };
  feeds: FeedDefinition[];
}

/** Replace ${VAR} and ${VAR:-default} with environment values, recursively. */
export function substituteEnv<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/gi, (_m, name: string, fallback?: string) => {
      const v = process.env[name];
      return v !== undefined && v !== '' ? v : (fallback ?? '');
    }) as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => substituteEnv(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = substituteEnv(v);
    return out as T;
  }
  return value;
}

export function loadFeedsConfig(file: string): FeedsConfig {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as FeedsConfig;
  const cfg = substituteEnv(raw);
  if (!cfg.platform?.baseUrl) throw new Error(`${file}: platform.baseUrl is required`);
  if (!Array.isArray(cfg.feeds)) throw new Error(`${file}: feeds[] is required`);
  return cfg;
}
