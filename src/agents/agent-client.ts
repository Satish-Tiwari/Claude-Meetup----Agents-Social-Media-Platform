import { Logger } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { AgentPersona, ConversationTopic, CONVERSATION_TOPICS } from './agent-personas';
import { AgentBrainService, ChatTurn, TranscriptLine } from './agent-brain.service';

export type AgentState = 'offline' | 'idle' | 'ringing' | 'in-call';

export interface AgentIdentity {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  role: string;
  accentColor: string;
}

export interface AgentClientOptions {
  serverUrl: string;
  maxTurns: number;
  /** Minimum wall-clock gap between utterances, so a human can follow along. */
  turnGapMs: number;
  /** How long an agent "rings" before answering. */
  answerDelayMs: number;
  /** How long an initiator waits for invitees before starting anyway. */
  startGraceMs: number;
}

/** Leave a call if nobody has said anything for this long (covers a partner that vanished). */
const STALL_MS = 45_000;

interface RoomContext {
  roomId: string;
  topic: ConversationTopic;
  isInitiator: boolean;
  expectedJoins: number;
  joinedCount: number;
  started: boolean;
  transcript: TranscriptLine[];
  roster: Map<string, { displayName: string; role: string }>;
  startTimer?: NodeJS.Timeout;
  stallTimer?: NodeJS.Timeout;
}

/**
 * One autonomous agent, connected to the platform exactly the way a browser is:
 * over Socket.IO, as a registered user.
 *
 * Nothing in the signalling layer is agent-specific - the agent rings, answers,
 * joins rooms and leaves them through the same events a human client uses. The
 * only difference is what it transmits: an utterance instead of an audio track.
 *
 * Turn-taking is decentralised. The gateway stamps every utterance with the
 * room's sorted participant list, so each agent independently computes the same
 * next speaker and only speaks when that speaker is itself. No coordinator, no
 * race, and it degrades correctly when a participant drops mid-call.
 */
export class AgentClient {
  private readonly logger: Logger;
  private socket: Socket | null = null;
  private room: RoomContext | null = null;
  private speaking = false;
  private state: AgentState = 'offline';

  /** Fired whenever this agent returns to idle, so the orchestrator can reuse it. */
  onIdle: (() => void) | null = null;

  /** Per-person chat memory (last few exchanges), keyed by the other user's id. */
  private readonly dmHistory = new Map<string, { name: string; turns: ChatTurn[] }>();
  private replying = new Set<string>();

  constructor(
    public readonly identity: AgentIdentity,
    public readonly persona: AgentPersona,
    private readonly brain: AgentBrainService,
    private readonly options: AgentClientOptions,
  ) {
    this.logger = new Logger(`Agent:${identity.username}`);
  }

  get currentState(): AgentState {
    return this.state;
  }

  get isAvailable(): boolean {
    return this.state === 'idle';
  }

  get activeRoomId(): string | null {
    return this.room?.roomId ?? null;
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  connect(): Promise<void> {
    return new Promise((resolve) => {
      this.socket = io(this.options.serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
      });

      this.socket.on('connect', () => {
        this.socket!.emit('register-user', { userId: this.identity.id });
        this.state = 'idle';
        resolve();
      });

      this.socket.on('disconnect', () => {
        this.state = 'offline';
        this.resetRoom();
      });

      this.registerHandlers();
    });
  }

  disconnect() {
    if (this.room) this.hangUp();
    this.socket?.disconnect();
    this.socket = null;
    this.state = 'offline';
  }

  private registerHandlers() {
    const s = this.socket!;

    // --- Being called -------------------------------------------------------
    s.on('incoming-call', (data: any) => {
      if (this.state !== 'idle') {
        // Already talking: decline so the caller is not left ringing forever.
        s.emit('decline-call', { roomId: data.roomId, reason: 'Agent is already on a call' });
        return;
      }

      this.state = 'ringing';
      this.room = {
        roomId: data.roomId,
        topic: this.topicFromPayload(data.topic, data.topicId, data.topicDetail),
        isInitiator: false,
        expectedJoins: 0,
        joinedCount: 0,
        started: true, // joiners never open the conversation
        transcript: [],
        roster: new Map(),
      };

      setTimeout(() => {
        if (this.state !== 'ringing' || !this.room) return;
        s.emit('join-call-room', { roomId: this.room.roomId, userInfo: this.userInfo() });
        this.state = 'in-call';
        this.armStallTimer();
        this.logger.log(`Answered call in ${this.room.roomId}`);
      }, this.options.answerDelayMs);
    });

    // --- Outgoing call confirmed -------------------------------------------
    s.on('call-initiated', (data: any) => {
      if (!this.room) return;
      this.room.roomId = data.roomId;
      this.state = 'in-call';
      this.armStallTimer();

      // If nobody picks up in time, open anyway with whoever arrived - or give
      // up if the room is still empty.
      this.room.startTimer = setTimeout(() => {
        if (!this.room || this.room.started) return;
        if (this.room.joinedCount > 0) {
          this.logger.log('Starting without full attendance');
          void this.openConversation();
        } else {
          this.logger.warn('Nobody answered; hanging up');
          this.hangUp();
        }
      }, this.options.startGraceMs);
    });

    // --- Roster ------------------------------------------------------------
    s.on('room-existing-participants', (data: any) => {
      if (!this.room) return;
      if (data.topic) this.room.topic = this.topicFromPayload(data.topic, data.topicId, data.topicDetail);
      for (const p of data.participants ?? []) {
        this.room.roster.set(p.userId, {
          displayName: p.displayName,
          role: p.role ?? '',
        });
      }
    });

    s.on('new-participant-joined', (data: any) => {
      if (!this.room) return;
      const p = data.participant;
      if (p) {
        this.room.roster.set(p.userId, {
          displayName: p.displayName,
          role: p.role ?? '',
        });
      }
      this.room.joinedCount++;

      if (
        this.room.isInitiator &&
        !this.room.started &&
        this.room.joinedCount >= this.room.expectedJoins
      ) {
        void this.openConversation();
      }
    });

    // --- The conversation itself -------------------------------------------
    s.on('room-utterance', (payload: any) => {
      if (!this.room || payload.roomId !== this.room.roomId) return;

      this.armStallTimer();
      this.room.transcript.push({
        speakerId: payload.speakerId,
        speakerName: payload.speakerName,
        speakerRole: payload.speakerRole ?? '',
        text: payload.text,
      });

      const order: string[] = payload.order ?? [];
      const lastTurn = payload.turnIndex >= this.options.maxTurns - 1;

      if (lastTurn) {
        // Conversation is over. Every agent leaves, staggered, so rooms of any
        // size tear down cleanly instead of stranding the last participant.
        const stagger = Math.max(0, order.indexOf(this.identity.id)) * 250;
        setTimeout(() => this.hangUp(), 600 + stagger);
        return;
      }

      const speakerIdx = order.indexOf(payload.speakerId);
      if (speakerIdx === -1 || order.length < 2) return;
      const nextSpeaker = order[(speakerIdx + 1) % order.length];

      if (nextSpeaker === this.identity.id) {
        void this.speak(payload.turnIndex + 1);
      }
    });

    // --- Direct messages ---------------------------------------------------
    s.on('new-message', (msg: any) => void this.handleDirectMessage(msg));

    // --- Teardown ----------------------------------------------------------
    // Teardown events from a call we already left can arrive after we have
    // moved on to a new room (an audience topic ends every call and starts a
    // new one within milliseconds). Only act on events for the current room.
    const forCurrentRoom = (data: any) => !!this.room && (!data?.roomId || data.roomId === this.room.roomId);

    s.on('call-ended', (data: any) => {
      if (forCurrentRoom(data)) this.resetRoom();
    });
    s.on('call-failed', (data: any) => {
      if (!forCurrentRoom(data)) return;
      this.logger.warn(`Call failed: ${data?.message}`);
      this.resetRoom();
    });
    s.on('call-declined', (data: any) => {
      // A 1:1 callee declined - nothing to talk to.
      if (forCurrentRoom(data) && this.room!.isInitiator && !this.room!.started) {
        this.hangUp();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  /**
   * A person messaged this agent in the app. Reply in character after a short
   * "typing" pause. Messages from other agents are ignored so two agents can
   * never trap each other in an endless exchange.
   */
  private async handleDirectMessage(msg: {
    id?: string;
    senderId: string;
    receiverId: string;
    content?: string;
    images?: string[];
    sender?: { id: string; displayName?: string; username?: string; isAgent?: boolean };
  }) {
    if (!this.socket || !msg || msg.receiverId !== this.identity.id) return;
    if (msg.senderId === this.identity.id || msg.sender?.isAgent) return;

    const text = (msg.content ?? '').trim();
    const hasImages = Array.isArray(msg.images) && msg.images.length > 0;
    if (!text && !hasImages) return;

    const name = msg.sender?.displayName || msg.sender?.username || 'there';
    const entry = this.dmHistory.get(msg.senderId) ?? { name, turns: [] };
    entry.name = name;
    entry.turns.push({ fromAgent: false, text: text || '(image)' });
    entry.turns = entry.turns.slice(-20);
    this.dmHistory.set(msg.senderId, entry);

    // One reply at a time per person; a burst of messages gets one considered answer.
    if (this.replying.has(msg.senderId)) return;
    this.replying.add(msg.senderId);
    try {
      const startedAt = Date.now();
      const result = await this.brain.chat({
        persona: this.persona,
        userName: name,
        history: entry.turns,
        hasImages,
        context: await this.newsContextFor(text),
      });
      // Feel like typing rather than an instant bot.
      const wait = Math.max(0, 900 + Math.min(text.length * 15, 2500) - (Date.now() - startedAt));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (!this.socket) return;

      this.socket.emit('send-message', { toUserId: msg.senderId, content: result.text });
      entry.turns.push({ fromAgent: true, text: result.text });
      this.logger.log(`Replied to ${name} (${result.brain})`);
    } catch (err: any) {
      this.logger.warn(`Could not reply to ${name}: ${err?.message}`);
    } finally {
      this.replying.delete(msg.senderId);
    }
  }

  /**
   * When a person asks about the news, pull the newest #news posts from Pulse
   * (the feed agents' real headlines) so the answer is grounded, not invented.
   */
  private async newsContextFor(text: string) {
    if (!/\b(news|headline|headlines|today|latest|happening|breaking|wires?)\b/i.test(text)) return undefined;
    try {
      const res = await fetch(`${this.options.serverUrl}/api/pulse/posts?channel=news&limit=3`);
      if (!res.ok) return undefined;
      const rows = (await res.json()) as { title: string | null; content: string; url: string | null; meta?: { source?: string } }[];
      const items = rows
        .filter((r) => r.title || r.content)
        .map((r) => ({ title: (r.title ?? r.content).slice(0, 120), source: r.meta?.source, url: r.url ?? undefined }));
      return items.length ? { label: 'Top of the #news feed', items } : undefined;
    } catch {
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Placing a call
  // ---------------------------------------------------------------------------

  /** Ring one or more other agents and open a conversation about `topic`. */
  startConversation(targets: AgentIdentity[], topic: ConversationTopic, callType: 'audio' | 'video') {
    if (!this.socket || this.state !== 'idle' || targets.length === 0) return false;

    this.room = {
      roomId: '',
      topic,
      isInitiator: true,
      expectedJoins: targets.length,
      joinedCount: 0,
      started: false,
      transcript: [],
      roster: new Map(),
    };
    this.state = 'in-call';

    this.socket.emit('initiate-call', {
      targetUserIds: targets.map((t) => t.id),
      callType,
      title: targets.length > 1 ? `News desk: ${topic.subject}` : undefined,
      topic: topic.subject,
      topicId: topic.id,
      // Custom (audience) topics are not in the deck, so ship the whole briefing.
      topicDetail: { source: topic.source, keyFigure: topic.keyFigure, openQuestion: topic.openQuestion },
      callerInfo: this.userInfo(),
    });

    this.logger.log(
      `Calling ${targets.map((t) => t.username).join(', ')} about "${topic.subject}"`,
    );
    return true;
  }

  private async openConversation() {
    if (!this.room || this.room.started) return;
    this.room.started = true;
    if (this.room.startTimer) clearTimeout(this.room.startTimer);
    await this.speak(0);
  }

  // ---------------------------------------------------------------------------
  // Speaking
  // ---------------------------------------------------------------------------

  private async speak(turnIndex: number) {
    if (!this.room || !this.socket || this.speaking) return;
    this.speaking = true;
    const roomId = this.room.roomId;

    try {
      const peers = Array.from(this.room.roster.entries())
        .filter(([id]) => id !== this.identity.id)
        .map(([, info]) => ({ displayName: info.displayName, role: info.role }));

      const startedAt = Date.now();
      const result = await this.brain.think({
        persona: this.persona,
        selfId: this.identity.id,
        topic: this.room.topic,
        peers,
        transcript: this.room.transcript,
        turnIndex,
        maxTurns: this.options.maxTurns,
      });

      // Pace the call so the Observatory is readable in real time.
      const remaining = this.options.turnGapMs - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));

      // The room may have ended while we were thinking.
      if (!this.room || this.room.roomId !== roomId || !this.socket) return;

      this.socket.emit('agent-utterance', {
        roomId,
        text: result.text,
        brain: result.brain,
        model: result.model,
        latencyMs: result.latencyMs,
      });
    } catch (err: any) {
      this.logger.error(`Failed to produce a turn: ${err?.message}`);
    } finally {
      this.speaking = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Leave whatever call this agent is on right now (used when an audience topic takes over). */
  endCall(): boolean {
    if (!this.room && this.state !== 'ringing') return false;
    this.hangUp();
    return true;
  }

  private hangUp() {
    if (this.room && this.socket) {
      this.socket.emit('leave-call-room', { roomId: this.room.roomId });
    }
    this.resetRoom();
  }

  private armStallTimer() {
    if (!this.room) return;
    if (this.room.stallTimer) clearTimeout(this.room.stallTimer);
    this.room.stallTimer = setTimeout(() => {
      if (!this.room) return;
      this.logger.warn(`No activity for ${STALL_MS / 1000}s in ${this.room.roomId}; leaving`);
      this.hangUp();
    }, STALL_MS);
  }

  private resetRoom() {
    if (this.room?.startTimer) clearTimeout(this.room.startTimer);
    if (this.room?.stallTimer) clearTimeout(this.room.stallTimer);
    const wasActive = !!this.room;
    this.room = null;
    this.speaking = false;
    if (this.state !== 'offline') this.state = 'idle';
    if (wasActive && this.onIdle) this.onIdle();
  }

  private userInfo() {
    return {
      id: this.identity.id,
      displayName: this.identity.displayName,
      avatar: this.identity.avatar,
      username: this.identity.username,
      isAgent: true,
      role: this.identity.role,
      accentColor: this.identity.accentColor,
    };
  }

  /**
   * Recover the full topic an invitee was called about. The gateway relays the
   * topic id, so every participant works from the same artifact/metric/risk as
   * the caller rather than a degraded copy.
   */
  private topicFromPayload(
    subject?: string,
    topicId?: string,
    detail?: { source?: string; keyFigure?: string; openQuestion?: string },
  ): ConversationTopic {
    const known = CONVERSATION_TOPICS.find((t) => t.id === topicId);
    if (known) return known;
    return {
      id: topicId || 'relayed',
      subject: subject || "today's top story",
      source: detail?.source || 'the wire report',
      keyFigure: detail?.keyFigure || 'the headline figure',
      openQuestion: detail?.openQuestion || 'what has not yet been confirmed',
    };
  }
}
