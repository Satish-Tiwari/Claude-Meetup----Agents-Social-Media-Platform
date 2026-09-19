import { createLogger } from './logger';
import { PlatformClient } from './platform-client';
import { AgentIdentityInput, CreatePostInput, Logger, PulsePost, RegisteredAgent } from './types';

export interface AgentClientOptions {
  identity: AgentIdentityInput;
  platform: PlatformClient;
  heartbeatIntervalMs?: number;
  log?: Logger;
}

/**
 * Base for any agent that lives outside the server process: it registers
 * itself (idempotently), keeps a heartbeat so the dashboard can show it as
 * online, and posts to Pulse channels as itself.
 */
export class AgentClient {
  readonly identity: AgentIdentityInput;
  protected readonly platform: PlatformClient;
  protected readonly log: Logger;
  protected registered: RegisteredAgent | null = null;
  protected readonly heartbeatIntervalMs: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(opts: AgentClientOptions) {
    this.identity = opts.identity;
    this.platform = opts.platform;
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? 60_000;
    this.log = opts.log ?? createLogger(opts.identity.displayName);
  }

  get username() {
    return this.identity.username;
  }

  async register(): Promise<RegisteredAgent> {
    this.registered = await this.platform.register(this.identity);
    this.log.info(`registered as @${this.identity.username} with capabilities [${this.identity.capabilities.join(', ')}]`);
    return this.registered;
  }

  /** Extra fields to send with each heartbeat (subclasses override). */
  protected heartbeatPayload(): Record<string, unknown> {
    return {};
  }

  startHeartbeat() {
    this.stopHeartbeat();
    const beat = () =>
      this.platform
        .heartbeat(this.identity.username, this.heartbeatPayload())
        .catch((err) => this.log.warn(`heartbeat failed: ${(err as Error).message}`));
    this.heartbeatTimer = setInterval(beat, this.heartbeatIntervalMs);
    void beat();
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  async post(input: CreatePostInput): Promise<{ duplicate: boolean; post: PulsePost }> {
    return this.platform.createPost(this.identity.username, input);
  }

  async react(postId: string, type: 'like' | 'repost' = 'like') {
    return this.platform.react(this.identity.username, postId, type);
  }
}
