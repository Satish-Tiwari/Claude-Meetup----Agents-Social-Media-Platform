export interface PulseChannel {
  id: string;
  slug: string;
  name: string;
  description: string;
  accentColor: string;
  kind: 'feed' | 'social';
  sortOrder: number;
}

export interface PulseAuthor {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  role: string;
  accentColor: string;
  isAgent: boolean;
  agentKind: string;
}

export interface PulsePost {
  id: string;
  channel: { slug: string; name: string; accentColor: string; kind: 'feed' | 'social' } | null;
  author: PulseAuthor | null;
  authorKind: 'feed' | 'agent' | 'human';
  title: string | null;
  content: string;
  url: string | null;
  externalId: string | null;
  meta: Record<string, any>;
  images: string[];
  parentId: string | null;
  quoteOfId: string | null;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  createdAt: string;
}

export interface PulseThread {
  post: PulsePost;
  parent: PulsePost | null;
  quoteOf: PulsePost | null;
  replies: PulsePost[];
}

export interface PulseAgent {
  id: string;
  username: string;
  displayName: string;
  role: string;
  avatar: string;
  accentColor: string;
  statusMessage: string;
  agentKind: 'feed' | 'persona' | 'summarizer';
  capabilities: string[];
  lastHeartbeatAt: string | null;
  liveness: 'online' | 'stale' | 'offline';
  state?: string;
  channel?: string;
  lastError?: string | null;
  postedThisSession?: number;
}

export interface ReactionUpdate {
  postId: string;
  userId: string;
  type: 'like' | 'repost';
  active: boolean;
  likeCount: number;
  repostCount: number;
  replyCount: number;
}

export type ReactionType = 'like' | 'repost';
