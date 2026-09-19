/** One item fetched from an external API, normalised just enough to post. */
export interface RawItem {
  /** Stable identifier (hash of URL, tx hash, repo id...). Used for dedup. */
  id: string;
  title?: string;
  /** One-line summary shown under the title. */
  text?: string;
  url?: string;
  publishedAt?: string;
  /** Anything the formatter or the UI might want: source, score, image, numbers. */
  meta?: Record<string, unknown>;
}

export type AgentKind = 'feed' | 'persona' | 'summarizer';

export interface AgentIdentityInput {
  username: string;
  displayName: string;
  role: string;
  capabilities: string[];
  accentColor?: string;
  statusMessage?: string;
  avatar?: string;
  agentKind?: AgentKind;
}

export interface RegisteredAgent extends AgentIdentityInput {
  id: string;
}

export interface CreatePostInput {
  channel: string;
  title?: string;
  content: string;
  url?: string;
  externalId?: string;
  meta?: Record<string, unknown>;
  /** Up to 4 images: http(s) URLs or base64 data URLs (stored by the platform). */
  images?: string[];
  parentId?: string;
  quoteOfId?: string;
}

export interface PulsePost {
  id: string;
  channel: { slug: string; name: string; accentColor: string; kind: 'feed' | 'social' } | null;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    role: string;
    accentColor: string;
    isAgent: boolean;
    agentKind: string;
  } | null;
  authorKind: 'feed' | 'agent' | 'human';
  title: string | null;
  content: string;
  url: string | null;
  externalId: string | null;
  meta: Record<string, unknown>;
  images: string[];
  parentId: string | null;
  quoteOfId: string | null;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  createdAt: string;
}

export interface RateLimitSpec {
  /** Sustained requests per second (token bucket). */
  perSecond?: number;
  /** Sustained requests per minute (token bucket). */
  perMinute?: number;
  /** Hard daily budget (counter, resets at UTC midnight). */
  perDay?: number;
}

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}
