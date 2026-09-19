import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentBrainService } from './agent-brain.service';
import { AgentClient, AgentIdentity } from './agent-client';
import {
  AGENT_PERSONAS,
  CONVERSATION_TOPICS,
  ConversationTopic,
  customTopic,
  pickTopic,
} from './agent-personas';

export interface TopicRequest {
  id: string;
  subject: string;
  participants: number;
  requestedAt: string;
}

/** An audience topic currently holding the floor: only these agents talk. */
export interface FocusSession {
  request: TopicRequest;
  agents: string[];
  startedAt: string;
  endedCalls: number;
}

/** Safety valve: a focus session cannot hold the floor longer than this. */
const FOCUS_MAX_MS = 4 * 60_000;

function envInt(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

/**
 * Brings the agent population to life and keeps it talking.
 *
 * Responsibilities:
 *  - seed the roster in the database
 *  - connect one AgentClient per persona
 *  - periodically pair or group idle agents into a new conversation
 *
 * Deliberately conservative: a bounded number of simultaneous conversations and
 * a fixed cadence, so the Observatory shows a legible amount of activity rather
 * than every agent shouting at once.
 */
@Injectable()
export class AgentOrchestratorService implements OnApplicationShutdown {
  private readonly logger = new Logger(AgentOrchestratorService.name);

  private clients: AgentClient[] = [];
  private timer: NodeJS.Timeout | null = null;
  private launched = false;
  private paused = false;
  /** Avoids opening two consecutive conversations on the same subject. */
  private lastTopicId: string | null = null;
  /** Topics people typed into the Observatory, waiting for the floor. */
  private queue: TopicRequest[] = [];
  private static readonly MAX_QUEUE = 10;
  /** While set, the scheduler starts nothing else. */
  private focus: FocusSession | null = null;

  private readonly config = {
    enabled: envBool('AGENTS_ENABLED', true),
    autostart: envBool('AGENTS_AUTOSTART', true),
    maxTurns: envInt('AGENT_MAX_TURNS', 8),
    turnGapMs: envInt('AGENT_TURN_GAP_MS', 2800),
    answerDelayMs: envInt('AGENT_ANSWER_DELAY_MS', 1800),
    startGraceMs: envInt('AGENT_START_GRACE_MS', 9000),
    intervalMs: envInt('AGENT_CONVERSATION_INTERVAL_MS', 12000),
    maxConcurrent: envInt('AGENT_MAX_CONCURRENT_CALLS', 2),
    groupChance: Number(process.env.AGENT_GROUP_CALL_CHANCE ?? '0.35'),
  };

  constructor(
    private readonly agentsService: AgentsService,
    private readonly brain: AgentBrainService,
  ) {}

  get status() {
    return {
      enabled: this.config.enabled,
      launched: this.launched,
      paused: this.paused,
      brain: this.brain.activeBrain,
      model: this.brain.activeModel,
      queue: this.queue,
      focus: this.focus,
      config: this.config,
      agents: this.clients.map((c) => ({
        id: c.identity.id,
        username: c.identity.username,
        displayName: c.identity.displayName,
        role: c.identity.role,
        accentColor: c.identity.accentColor,
        state: c.currentState,
        roomId: c.activeRoomId,
      })),
    };
  }

  /**
   * Called from main.ts *after* the HTTP server is listening - agents connect to
   * the platform over the network like any other client, so the socket endpoint
   * has to be accepting connections first.
   */
  async launch(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.log('Agent population disabled (AGENTS_ENABLED=false)');
      return;
    }
    if (this.launched) return;

    const port = process.env.PORT || '3000';
    const serverUrl = process.env.AGENT_SERVER_URL || `http://127.0.0.1:${port}`;

    const records = await this.agentsService.seedAgents(
      this.brain.activeBrain,
      this.brain.activeModel,
    );

    for (const { user, persona } of records) {
      const identity: AgentIdentity = {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        role: user.role,
        accentColor: user.accentColor,
      };

      const client = new AgentClient(identity, persona, this.brain, {
        serverUrl,
        maxTurns: this.config.maxTurns,
        turnGapMs: this.config.turnGapMs,
        answerDelayMs: this.config.answerDelayMs,
        startGraceMs: this.config.startGraceMs,
      });

      this.clients.push(client);
    }

    await Promise.all(this.clients.map((c) => c.connect()));
    this.launched = true;

    this.logger.log(
      `${this.clients.length} agents online via ${serverUrl} | brain=${this.brain.activeBrain}` +
        (this.brain.activeModel ? ` model=${this.brain.activeModel}` : ''),
    );

    if (this.config.autostart) {
      this.timer = setInterval(() => this.tick(), this.config.intervalMs);
      // Open the first conversation promptly so the Observatory is never empty.
      setTimeout(() => this.tick(), 2500);
    }
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    for (const client of this.clients) client.disconnect();
  }

  pause() {
    this.paused = true;
    return this.status;
  }

  resume() {
    this.paused = false;
    return this.status;
  }

  /**
   * One scheduling pass. Priority order: an audience topic holding the floor
   * (nothing else may start), then queued audience topics, then - only when
   * nobody asked for anything - the built-in briefing deck.
   */
  private tick() {
    try {
      if (this.focus) {
        if (this.focusStillRunning()) return;
        this.logger.log(`Audience topic finished: "${this.focus.request.subject}"`);
        this.focus = null;
      }
      if (this.queue.length > 0) {
        this.startFocus(this.queue.shift()!);
        return;
      }
      if (this.paused) return;
      this.spawnConversation();
    } catch (err: any) {
      this.logger.error(`Scheduling pass failed: ${err?.message}`);
    }
  }

  private idleClients(): AgentClient[] {
    return this.clients.filter((c) => c.isAvailable);
  }

  private focusStillRunning(): boolean {
    if (!this.focus) return false;
    const age = Date.now() - new Date(this.focus.startedAt).getTime();
    if (age > FOCUS_MAX_MS) return false;
    if (age < 15_000) return true; // ringing / answering grace period
    const members = new Set(this.focus.agents);
    return this.clients.some((c) => members.has(c.identity.username) && c.currentState !== 'idle');
  }

  /**
   * A person asked for a discussion with exactly N agents. The floor is
   * cleared - every running call ends and the scheduler stops - and only those
   * N agents talk, about that topic, until they hang up. Further requests
   * queue behind it.
   */
  requestTopic(subject: string, participants = 2): {
    started: boolean;
    queued: boolean;
    position: number;
    request: TopicRequest;
    focus?: FocusSession;
    detail?: ReturnType<AgentOrchestratorService['spawnConversation']>;
  } {
    const size = Math.min(Math.max(Math.round(participants) || 2, 2), Math.min(4, this.clients.length));
    const request: TopicRequest = {
      id: `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      subject: subject.trim().replace(/\s+/g, ' ').slice(0, 200),
      participants: size,
      requestedAt: new Date().toISOString(),
    };

    if (!this.launched) throw new Error('Agents are not online yet');

    // Someone already holds the floor: wait your turn.
    if (this.focus && this.focusStillRunning()) {
      if (this.queue.length >= AgentOrchestratorService.MAX_QUEUE) {
        throw new Error(`Topic queue is full (${AgentOrchestratorService.MAX_QUEUE}); try again in a minute`);
      }
      this.queue.push(request);
      return { started: false, queued: true, position: this.queue.length, request };
    }

    const focus = this.startFocus(request);
    if (!focus) throw new Error('Could not start the discussion; try again in a moment');
    return { started: true, queued: false, position: 0, request, focus, detail: this.lastFocusDetail };
  }

  private lastFocusDetail: ReturnType<AgentOrchestratorService['spawnConversation']> = null;

  /** Clear the floor and start one call with exactly `request.participants` agents. */
  private startFocus(request: TopicRequest): FocusSession | null {
    if (this.clients.length < 2) return null;

    // 1. Everything else stops - including any earlier focus call that overran.
    let endedCalls = 0;
    for (const client of this.clients) if (client.endCall()) endedCalls++;

    // 2. Exactly N agents, chosen now so the response can name them.
    const shuffled = [...this.clients].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, Math.min(request.participants, shuffled.length));
    const [caller, ...targets] = chosen;

    this.focus = {
      request,
      agents: chosen.map((c) => c.identity.username),
      startedAt: new Date().toISOString(),
      endedCalls,
    };
    this.lastFocusDetail = {
      caller: caller.identity.username,
      targets: targets.map((t) => t.identity.username),
      topic: request.subject,
      topicId: 'custom:pending',
    };

    // 3. Give the signalling layer a moment to tear the old rooms down, then ring.
    const focusId = request.id;
    setTimeout(() => {
      if (this.focus?.request.id !== focusId) return; // superseded meanwhile
      const started = this.spawnConversation({
        callerUsername: caller.identity.username,
        targetUsernames: targets.map((t) => t.identity.username),
        topic: request.subject,
      });
      if (!started) {
        this.logger.warn(`Audience topic "${request.subject}" could not start; releasing the floor`);
        this.focus = null;
      }
    }, endedCalls > 0 ? 1200 : 150);

    this.logger.log(
      `Audience topic "${request.subject}" -> ${this.focus.agents.join(', ')} (${endedCalls} other call(s) ended, scheduler on hold)`,
    );
    return this.focus;
  }

  /** Drop the current audience topic (and optionally the queue) and let the scheduler resume. */
  clearFocus(includeQueue = false) {
    if (this.focus) {
      const members = new Set(this.focus.agents);
      for (const c of this.clients) if (members.has(c.identity.username)) c.endCall();
      this.focus = null;
    }
    if (includeQueue) this.queue = [];
    return this.status;
  }

  private activeCallCount(): number {
    // Each conversation involves several agents; count distinct rooms.
    const rooms = new Set(
      this.clients.map((c) => c.activeRoomId).filter((id): id is string => !!id),
    );
    return rooms.size;
  }

  /**
   * Pick an idle caller plus one or more idle callees and start a call.
   * Returns a description of what was started, or null when it could not.
   */
  spawnConversation(options?: {
    callerUsername?: string;
    targetUsernames?: string[];
    topicId?: string;
    /** Free-text subject from the audience; wins over topicId. */
    topic?: string;
    /** Total agents on the call (2-4) when targets are not named. */
    participants?: number;
  }): { caller: string; targets: string[]; topic: string; topicId: string } | null {
    if (!this.launched) return null;

    if (!options && this.activeCallCount() >= this.config.maxConcurrent) {
      return null;
    }

    const idle = this.clients.filter((c) => c.isAvailable);
    if (idle.length < 2) return null;

    let caller: AgentClient | undefined;
    if (options?.callerUsername) {
      caller = idle.find((c) => c.identity.username === options.callerUsername);
    } else {
      caller = idle[Math.floor(Math.random() * idle.length)];
    }
    if (!caller) return null;

    const pool = idle.filter((c) => c.identity.id !== caller!.identity.id);
    if (pool.length === 0) return null;

    let targets: AgentClient[];
    if (options?.targetUsernames?.length) {
      targets = pool.filter((c) => options.targetUsernames!.includes(c.identity.username));
      if (targets.length === 0) return null;
    } else if (options?.participants) {
      const want = Math.min(Math.max(options.participants, 2), 4) - 1;
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      targets = shuffled.slice(0, want);
      if (targets.length === 0) return null;
    } else {
      // Sometimes a 1:1 call, sometimes a small roundtable.
      const wantGroup = Math.random() < this.config.groupChance && pool.length >= 2;
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      targets = wantGroup ? shuffled.slice(0, 2) : shuffled.slice(0, 1);
    }

    const topic: ConversationTopic = options?.topic?.trim()
      ? customTopic(options.topic)
      : this.resolveTopic(options?.topicId);
    const callType: 'audio' | 'video' = targets.length > 1 ? 'video' : 'audio';

    const ok = caller.startConversation(
      targets.map((t) => t.identity),
      topic,
      callType,
    );
    if (!ok) return null;

    return {
      caller: caller.identity.username,
      targets: targets.map((t) => t.identity.username),
      topic: topic.subject,
      topicId: topic.id,
    };
  }

  private resolveTopic(topicId?: string): ConversationTopic {
    if (topicId) {
      const found = CONVERSATION_TOPICS.find((t) => t.id === topicId);
      if (found) {
        this.lastTopicId = found.id;
        return found;
      }
    }

    let topic = pickTopic();
    for (let attempt = 0; attempt < 5 && topic.id === this.lastTopicId; attempt++) {
      topic = pickTopic();
    }
    this.lastTopicId = topic.id;
    return topic;
  }

  /** Personas that exist in code, for the API to report alongside live state. */
  get personaCount(): number {
    return AGENT_PERSONAS.length;
  }
}
