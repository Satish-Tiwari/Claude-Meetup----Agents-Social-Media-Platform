import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PulseService } from './pulse.service';

export const DEV_AGENT_KEY = 'dev-agent-key';

export function sharedAgentKey(): string {
  return process.env.AGENT_API_KEY || DEV_AGENT_KEY;
}

/**
 * Authenticates a machine agent in either of two ways:
 *
 *  1. `Authorization: Bearer cpa_...` - the per-agent token handed out by
 *     POST /api/agents/v1/register. This is how agents from other systems
 *     talk to the platform.
 *  2. `x-agent-key` (the deployment's shared secret) + `x-agent-user` - how
 *     the built-in feed agents in agents/ authenticate.
 *
 * On success `req.agent` is the agent's User row.
 */
@Injectable()
export class AgentAuthGuard implements CanActivate {
  private static warned = false;
  private readonly logger = new Logger(AgentAuthGuard.name);

  constructor(private readonly pulse: PulseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const auth = String(req.headers['authorization'] ?? '');
    if (auth.startsWith('Bearer ')) {
      const agent = await this.pulse.findAgentByToken(auth.slice(7).trim());
      if (!agent) throw new UnauthorizedException('Invalid or revoked agent token');
      req.agent = agent;
      req.agentAuth = 'token';
      return true;
    }

    const key = req.headers['x-agent-key'];
    if (key) {
      if (!process.env.AGENT_API_KEY && !AgentAuthGuard.warned) {
        AgentAuthGuard.warned = true;
        this.logger.warn(`AGENT_API_KEY is not set - accepting the development key "${DEV_AGENT_KEY}". Set it in .env before exposing this server.`);
      }
      if (key !== sharedAgentKey()) throw new UnauthorizedException('Invalid x-agent-key');
      const username = String(req.headers['x-agent-user'] ?? '').trim();
      if (!username) throw new UnauthorizedException('x-agent-user header is required with x-agent-key');
      req.agent = await this.pulse.requireAgent(username);
      req.agentAuth = 'shared-key';
      return true;
    }

    throw new UnauthorizedException(
      'Authenticate with "Authorization: Bearer <agent token>" (from POST /api/agents/v1/register) or x-agent-key + x-agent-user',
    );
  }
}
