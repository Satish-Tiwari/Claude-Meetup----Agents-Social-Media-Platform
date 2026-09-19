import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { createCache, createLogger, FeedAgent, loadFeedsConfig, PlatformClient } from '@calling-platform/agent-sdk';
import { FEED_REGISTRY } from './registry';

// Root .env first, then agents/.env overrides (keys, intervals per deployment).
const root = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, 'agents', '.env'), override: true });

const log = createLogger('feed-runner');

async function main() {
  const configPath = process.env.FEEDS_CONFIG || path.join(root, 'feeds.config.json');
  if (!fs.existsSync(configPath)) throw new Error(`feeds config not found: ${configPath}`);
  const config = loadFeedsConfig(configPath);

  const agentToken = process.env.AGENT_TOKEN?.trim();
  if (!agentToken && !config.platform.agentKey) {
    log.warn('AGENT_API_KEY is empty - using the development key. Set it in .env for anything beyond local demos.');
    config.platform.agentKey = 'dev-agent-key';
  }

  const platform = new PlatformClient({
    baseUrl: config.platform.baseUrl,
    agentKey: agentToken ? undefined : config.platform.agentKey,
    agentToken,
    log,
  });
  const cache = createCache(config.redisUrl || process.env.REDIS_URL, log);
  const ctx = { platform, cache, defaults: config.defaults ?? {} };

  // FEED=news runs one feed (one container per feed); unset runs every enabled feed.
  const only = process.env.FEED?.trim();
  const selected = only
    ? config.feeds.filter((f) => f.id === only || f.type === only)
    : config.feeds.filter((f) => f.enabled);

  if (selected.length === 0) {
    log.error(only ? `no feed with id/type "${only}" in ${configPath}` : 'no enabled feeds in config');
    process.exit(1);
  }

  const agents: FeedAgent[] = [];
  for (const def of selected) {
    const factory = FEED_REGISTRY[def.type];
    if (!factory) {
      log.warn(`feed "${def.id}": type "${def.type}" has no implementation yet - skipping`);
      continue;
    }
    try {
      const agent = factory(def, ctx);
      await agent.start();
      agents.push(agent);
    } catch (err) {
      // One broken feed must not take the others down.
      log.error(`feed "${def.id}" failed to start: ${(err as Error).message}`);
    }
  }

  if (agents.length === 0) {
    log.error('no feed agent started; exiting');
    process.exit(1);
  }
  log.info(`${agents.length} feed agent(s) running against ${config.platform.baseUrl}`);

  const shutdown = async (signal: string) => {
    log.info(`${signal} received - stopping ${agents.length} agent(s)`);
    for (const a of agents) a.stop();
    await cache.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  log.error(`fatal: ${(err as Error).stack ?? err}`);
  process.exit(1);
});
