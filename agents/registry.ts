import { FeedAgent, FeedDefinition, PlatformClient, ResponseCache } from '@calling-platform/agent-sdk';
import { NewsAgent } from './news';

export interface FeedContext {
  platform: PlatformClient;
  cache: ResponseCache;
  defaults: { maxPostsPerTick?: number; heartbeatIntervalMs?: number };
}

export type FeedFactory = (def: FeedDefinition, ctx: FeedContext) => FeedAgent;

/**
 * feeds.config.json `type` -> implementation. Adding a feed = one small file
 * that extends FeedAgent, plus one line here.
 */
export const FEED_REGISTRY: Record<string, FeedFactory> = {
  news: (def, ctx) => new NewsAgent(def, ctx),
};
