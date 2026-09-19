import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { CONVERSATION_TOPICS } from './agent-personas';
import { buildShareLinks } from './share-links';

/**
 * Read-only-by-default API behind the Observatory.
 *
 * Intentionally unauthenticated: the Observatory is a local monitoring view of
 * synthetic agents, and requiring a login would defeat the "open one URL and
 * watch" purpose. The write endpoints only nudge synthetic agents - they cannot
 * touch human accounts or message history.
 */
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly orchestrator: AgentOrchestratorService,
  ) {}

  /** Roster: persona definitions joined with live connection state. */
  @Get()
  async list() {
    const [rows, status] = await Promise.all([
      this.agentsService.listAgents(),
      Promise.resolve(this.orchestrator.status),
    ]);

    const liveByUsername = new Map(status.agents.map((a) => [a.username, a]));

    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      avatar: row.avatar,
      accentColor: row.accentColor,
      statusMessage: row.statusMessage,
      // The live brain is authoritative: the stored value is written at seed
      // time, before the first API call reveals whether credentials work.
      brain: status.brain,
      model: status.model,
      state: liveByUsername.get(row.username)?.state ?? 'offline',
      roomId: liveByUsername.get(row.username)?.roomId ?? null,
    }));
  }

  /** Orchestrator health: which brain is active, pacing config, agent states. */
  @Get('status')
  status() {
    return this.orchestrator.status;
  }

  @Get('topics')
  topics() {
    return CONVERSATION_TOPICS;
  }

  /** IPv4-based URLs for this server, so the UI can offer a link that works from other devices. */
  @Get('links')
  links() {
    return buildShareLinks(
      parseInt(process.env.PORT || '3000', 10),
      parseInt(process.env.HTTPS_PORT || '3443', 10),
    );
  }

  /** Who has talked to whom, aggregated across every recorded conversation. */
  @Get('graph')
  async graph() {
    const [agents, edges] = await Promise.all([
      this.agentsService.listAgents(),
      this.agentsService.getInteractionEdges(),
    ]);

    return {
      nodes: agents.map((a) => ({
        id: a.id,
        username: a.username,
        displayName: a.displayName,
        role: a.role,
        accentColor: a.accentColor,
        avatar: a.avatar,
      })),
      edges,
    };
  }

  /** One entry per conversation that produced at least one turn. */
  @Get('conversations')
  conversations(@Query('limit') limit?: string) {
    return this.agentsService.getConversationSummaries(
      limit ? parseInt(limit, 10) : 40,
    );
  }

  /** Newest utterances across all rooms - the activity feed. */
  @Get('feed')
  feed(@Query('limit') limit?: string) {
    return this.agentsService.getRecentTurns(limit ? parseInt(limit, 10) : 60);
  }

  /** Full ordered transcript of one conversation. */
  @Get('conversations/:roomId')
  transcript(@Param('roomId') roomId: string) {
    return this.agentsService.getRoomTranscript(roomId);
  }

  /**
   * Start a conversation. With `topic` (free text from a person watching the
   * Observatory) the agents discuss that; it starts at once or is queued until
   * enough agents are idle. Without it, the built-in briefing deck is used.
   */
  @Post('conversations')
  spawn(
    @Body()
    body: { caller?: string; targets?: string[]; topicId?: string; topic?: string; participants?: number } = {},
  ) {
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    if (topic) {
      if (topic.length < 3) throw new BadRequestException('Topic is too short');
      if (topic.length > 200) throw new BadRequestException('Topic must be 200 characters or fewer');
      try {
        return this.orchestrator.requestTopic(topic, Number(body.participants) || 2);
      } catch (err: any) {
        throw new BadRequestException(err?.message ?? 'Could not queue topic');
      }
    }

    const started = this.orchestrator.spawnConversation({
      callerUsername: body.caller,
      targetUsernames: body.targets,
      topicId: body.topicId,
      participants: body.participants,
    });

    return started
      ? { started: true, ...started }
      : {
          started: false,
          reason:
            'No two idle agents available, or the named agents are busy. Try again shortly.',
        };
  }

  /** Stop the current audience topic (and, with ?queue=true, forget queued ones). */
  @Delete('conversations/focus')
  clearFocus(@Query('queue') queue?: string) {
    return this.orchestrator.clearFocus(queue === 'true' || queue === '1');
  }

  @Post('pause')
  pause() {
    return this.orchestrator.pause();
  }

  @Post('resume')
  resume() {
    return this.orchestrator.resume();
  }

  @Delete('transcripts')
  async clear() {
    await this.agentsService.clearTranscripts();
    return { cleared: true };
  }
}
