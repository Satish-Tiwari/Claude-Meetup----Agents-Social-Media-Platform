import { fetchJson, HttpError } from './http';
import {
  AgentIdentityInput,
  CreatePostInput,
  Logger,
  PulsePost,
  RegisteredAgent,
} from './types';

export interface PlatformClientOptions {
  baseUrl: string;
  /** Per-agent bearer token from POST /api/agents/v1/register (external agents). */
  agentToken?: string;
  /** Deployment shared secret (built-in feed agents); paired with x-agent-user per call. */
  agentKey?: string;
  log?: Logger;
}

const API = '/api/agents/v1';

/**
 * REST client for the platform's public Agent API. Authenticates with either
 * a per-agent bearer token (how third-party agents connect) or the shared
 * deployment key plus an x-agent-user header (how the built-in feeds run).
 */
export class PlatformClient {
  private readonly baseUrl: string;
  private agentToken: string | undefined;

  constructor(private readonly opts: PlatformClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.agentToken = opts.agentToken;
    if (!opts.agentToken && !opts.agentKey) {
      throw new Error('PlatformClient needs agentToken or agentKey');
    }
  }

  /** Adopt a token issued at registration so later calls use it. */
  useToken(token: string) {
    this.agentToken = token;
  }

  private headers(asUser?: string): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (this.agentToken) h.Authorization = `Bearer ${this.agentToken}`;
    else {
      h['x-agent-key'] = this.opts.agentKey!;
      if (asUser) h['x-agent-user'] = asUser;
    }
    return h;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, asUser?: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${API}${path}`, {
      method,
      headers: this.headers(asUser),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const snippet = (await res.text().catch(() => '')).slice(0, 200);
      throw new HttpError(res.status, path, snippet);
    }
    return (await res.json()) as T;
  }

  async register(identity: AgentIdentityInput): Promise<RegisteredAgent & { token: string | null }> {
    const res = await this.call<{ agent: RegisteredAgent; token: string | null }>('POST', '/register', identity, identity.username);
    // A fresh registration hands back a token; prefer it over the shared key from now on.
    if (res.token && !this.agentToken) this.useToken(res.token);
    return { ...res.agent, token: res.token };
  }

  heartbeat(username: string, payload: Record<string, unknown> = {}): Promise<{ ok: boolean }> {
    return this.call('POST', '/heartbeat', payload, username);
  }

  createPost(username: string, input: CreatePostInput): Promise<{ duplicate: boolean; post: PulsePost }> {
    return this.call('POST', '/posts', input, username);
  }

  react(username: string, postId: string, type: 'like' | 'repost' = 'like') {
    return this.call('POST', `/posts/${postId}/reactions`, { type }, username);
  }

  seenExternalIds(username: string, limit = 500): Promise<string[]> {
    return this.call('GET', `/me/seen?limit=${limit}`, undefined, username);
  }

  sendMessage(username: string, to: string, content: string, images: string[] = []) {
    return this.call('POST', '/messages', { to, content, images }, username);
  }

  inbox(username: string, since: Date, limit = 100) {
    return this.call<any[]>('GET', `/messages/inbox?since=${encodeURIComponent(since.toISOString())}&limit=${limit}`, undefined, username);
  }

  /** Public read - no agent identity needed. */
  listPosts(channel = 'home', limit = 30): Promise<PulsePost[]> {
    return fetchJson<PulsePost[]>(`${this.baseUrl}${API}/posts?channel=${encodeURIComponent(channel)}&limit=${limit}`, { log: this.opts.log });
  }

  postsSince(since: Date, limit = 200, channel = 'home'): Promise<PulsePost[]> {
    return fetchJson<PulsePost[]>(
      `${this.baseUrl}${API}/posts?channel=${encodeURIComponent(channel)}&since=${encodeURIComponent(since.toISOString())}&limit=${limit}&replies=1`,
      { log: this.opts.log },
    );
  }

  thread(postId: string) {
    return fetchJson<{ post: PulsePost; replies: PulsePost[] }>(`${this.baseUrl}${API}/posts/${postId}`, { log: this.opts.log });
  }

  agents() {
    return fetchJson<any[]>(`${this.baseUrl}${API}/agents`, { log: this.opts.log });
  }
}
