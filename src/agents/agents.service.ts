import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { Friendship } from '../entities/friendship.entity';
import { AgentTurn } from '../entities/agent-turn.entity';
import { AGENT_PERSONAS, AgentPersona, buildAgentAvatar } from './agent-personas';

export interface AgentRecord {
  user: User;
  persona: AgentPersona;
}

/**
 * Owns the agent roster in the database and the persisted conversation
 * transcript. Agents are ordinary rows in `users` with `isAgent = true`, so
 * every existing feature (friendships, call logs, rooms) applies to them.
 */
@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
    @InjectRepository(AgentTurn)
    private readonly turnRepo: Repository<AgentTurn>,
  ) {}

  /**
   * Creates (or refreshes) one user row per persona and wires up the social
   * graph so agents can reach each other and any human demo account.
   */
  async seedAgents(brain: string, model: string | null): Promise<AgentRecord[]> {
    const password = await bcrypt.hash(
      process.env.AGENT_PASSWORD || 'agentpass123',
      10,
    );
    const records: AgentRecord[] = [];

    for (const persona of AGENT_PERSONAS) {
      let user = await this.userRepo.findOne({
        where: { username: persona.username },
      });

      const fields: Partial<User> = {
        username: persona.username,
        displayName: persona.displayName,
        email: `${persona.username}@agents.local`,
        avatar: buildAgentAvatar(persona.badge, persona.accentColor),
        statusMessage: persona.statusMessage,
        isEmailVerified: true,
        isAgent: true,
        agentKind: 'persona',
        managedBy: 'orchestrator',
        role: persona.role,
        persona: persona.persona,
        accentColor: persona.accentColor,
        brain,
        model: model ?? undefined,
      };

      if (!user) {
        user = await this.userRepo.save(
          this.userRepo.create({ ...fields, password }),
        );
        this.logger.log(`Agent created: ${persona.displayName} (${persona.role})`);
      } else {
        await this.userRepo.update(user.id, fields);
        user = (await this.userRepo.findOne({ where: { id: user.id } }))!;
      }

      records.push({ user, persona });
    }

    await this.retireStaleAgents(AGENT_PERSONAS.map((p) => p.username));
    await this.seedAgentSocialGraph(records.map((r) => r.user.id));
    return records;
  }

  /**
   * Removes in-process persona accounts that no longer have a persona in code
   * (the cast was renamed or trimmed). Friendships, calls and messages cascade
   * from the user row; transcript turns have no FK so they are cleared
   * explicitly, otherwise the Observatory would keep showing speakers that no
   * longer exist.
   *
   * Only `managedBy = 'orchestrator'` rows are eligible: agents registered
   * through the public Agent API (any kind, including personas) own their
   * identity and posts, so they must never be swept by this.
   */
  private async retireStaleAgents(currentUsernames: string[]) {
    const stale = await this.userRepo.find({
      where: { isAgent: true, managedBy: 'orchestrator', username: Not(In(currentUsernames)) },
    });
    if (stale.length === 0) return;

    const staleIds = stale.map((u) => u.id);
    await this.turnRepo.delete({ speakerId: In(staleIds) });
    await this.userRepo.delete({ id: In(staleIds) });
    this.logger.log(
      `Retired ${stale.length} stale agent(s): ${stale.map((u) => u.username).join(', ')}`,
    );
  }

  /** Every agent is connected to every other agent, and to any human account. */
  private async seedAgentSocialGraph(agentIds: string[]) {
    const humans = await this.userRepo.find({ where: { isAgent: false } });
    const everyone = [...agentIds, ...humans.map((h) => h.id)];

    const pairs: [string, string][] = [];
    for (let i = 0; i < agentIds.length; i++) {
      for (let j = 0; j < everyone.length; j++) {
        if (agentIds[i] !== everyone[j]) pairs.push([agentIds[i], everyone[j]]);
      }
    }

    let created = 0;
    for (const [a, b] of pairs) {
      const exists = await this.friendshipRepo.findOne({
        where: [
          { senderId: a, receiverId: b },
          { senderId: b, receiverId: a },
        ],
      });
      if (!exists) {
        await this.friendshipRepo.save(
          this.friendshipRepo.create({
            senderId: a,
            receiverId: b,
            status: 'accepted',
          }),
        );
        created++;
      }
    }
    if (created > 0) {
      this.logger.log(`Agent social graph: ${created} connection(s) established`);
    }
  }

  /** The call personas in cast order (Agent One first). API-registered agents live on Pulse, not on calls. */
  async listAgents(): Promise<User[]> {
    const rows = await this.userRepo.find({ where: { isAgent: true, managedBy: 'orchestrator' } });
    const rank = new Map(AGENT_PERSONAS.map((p, i) => [p.username, i]));
    return rows.sort(
      (a, b) => (rank.get(a.username) ?? 99) - (rank.get(b.username) ?? 99),
    );
  }

  async findAgentsByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return this.userRepo.find({ where: { id: In(ids) } });
  }

  async recordTurn(data: Partial<AgentTurn>): Promise<AgentTurn> {
    return this.turnRepo.save(this.turnRepo.create(data));
  }

  async getRoomTranscript(roomId: string): Promise<AgentTurn[]> {
    return this.turnRepo.find({
      where: { roomId },
      order: { turnIndex: 'ASC' },
    });
  }

  /** Most recent turns across all rooms, newest first - the live activity feed. */
  async getRecentTurns(limit = 60): Promise<AgentTurn[]> {
    return this.turnRepo.find({
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 300),
    });
  }

  /**
   * Conversation-level rollup: one entry per room that has at least one turn,
   * with the participants and turn count. This is what the Observatory renders
   * as "who has talked to whom".
   */
  async getConversationSummaries(limit = 40): Promise<
    {
      roomId: string;
      topic: string | null;
      turnCount: number;
      participantIds: string[];
      startedAt: Date;
      endedAt: Date;
      speakers: { id: string; name: string; role: string }[];
    }[]
  > {
    const rows = await this.turnRepo.find({
      order: { createdAt: 'DESC' },
      take: 2000,
    });

    const byRoom = new Map<string, AgentTurn[]>();
    for (const turn of rows) {
      const list = byRoom.get(turn.roomId) ?? [];
      list.push(turn);
      byRoom.set(turn.roomId, list);
    }

    const summaries = Array.from(byRoom.entries()).map(([roomId, turns]) => {
      const ordered = [...turns].sort((a, b) => a.turnIndex - b.turnIndex);
      const participantIds = new Set<string>();
      const speakers = new Map<string, { id: string; name: string; role: string }>();

      for (const t of ordered) {
        participantIds.add(t.speakerId);
        for (const l of t.listenerIds ?? []) participantIds.add(l);
        speakers.set(t.speakerId, {
          id: t.speakerId,
          name: t.speakerName,
          role: t.speakerRole,
        });
      }

      return {
        roomId,
        topic: ordered[0]?.topic ?? null,
        turnCount: ordered.length,
        participantIds: Array.from(participantIds),
        startedAt: ordered[0].createdAt,
        endedAt: ordered[ordered.length - 1].createdAt,
        speakers: Array.from(speakers.values()),
      };
    });

    return summaries
      .sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Edge weights for the interaction graph: how many turns each ordered pair of
   * agents has exchanged, aggregated across every conversation.
   */
  async getInteractionEdges(): Promise<
    { source: string; target: string; turns: number; rooms: number }[]
  > {
    const turns = await this.turnRepo.find({ take: 5000, order: { createdAt: 'DESC' } });
    const edges = new Map<string, { source: string; target: string; turns: number; rooms: Set<string> }>();

    for (const turn of turns) {
      for (const listener of turn.listenerIds ?? []) {
        if (listener === turn.speakerId) continue;
        const key = `${turn.speakerId}>${listener}`;
        const edge =
          edges.get(key) ??
          { source: turn.speakerId, target: listener, turns: 0, rooms: new Set<string>() };
        edge.turns++;
        edge.rooms.add(turn.roomId);
        edges.set(key, edge);
      }
    }

    return Array.from(edges.values()).map((e) => ({
      source: e.source,
      target: e.target,
      turns: e.turns,
      rooms: e.rooms.size,
    }));
  }

  async clearTranscripts(): Promise<void> {
    await this.turnRepo.clear();
  }
}
