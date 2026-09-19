import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AgentPersona, ConversationTopic, isCustomTopicId } from './agent-personas';

export interface TranscriptLine {
  speakerId: string;
  speakerName: string;
  speakerRole: string;
  text: string;
}

export interface ThinkRequest {
  persona: AgentPersona;
  selfId: string;
  topic: ConversationTopic;
  /** display names + roles of everyone on the call, excluding the speaker */
  peers: { displayName: string; role: string }[];
  transcript: TranscriptLine[];
  turnIndex: number;
  maxTurns: number;
}

export interface ChatTurn {
  fromAgent: boolean;
  text: string;
}

export interface ChatRequest {
  persona: AgentPersona;
  /** Display name of the person the agent is chatting with. */
  userName: string;
  /** Previous exchanges with this person, oldest first (already includes the new message last). */
  history: ChatTurn[];
  /** Whether the newest message carried images. */
  hasImages: boolean;
  /** Fresh facts the agent may cite, e.g. the latest #news headlines from Pulse. */
  context?: { label: string; items: { title: string; source?: string; url?: string }[] };
}

export interface ThinkResult {
  text: string;
  brain: 'claude' | 'simulated';
  model: string | null;
  latencyMs: number;
}

/**
 * Produces what an agent says next.
 *
 * Two interchangeable brains:
 *  - 'claude'    - the Anthropic API, used whenever credentials resolve.
 *  - 'simulated' - a deterministic persona engine, so the platform is fully
 *                  demonstrable with no API key and no network access.
 *
 * The brain is chosen once at startup and reported on every turn, so the
 * Observatory can always show which engine is speaking.
 */
@Injectable()
export class AgentBrainService {
  private readonly logger = new Logger(AgentBrainService.name);
  private client: Anthropic | null = null;
  private readonly model = process.env.AGENT_MODEL || 'claude-opus-5';
  private liveBrainDisabled = false;

  /** Remembers which sentence shapes a room has already used, to avoid repeats. */
  private usedTemplates = new Map<string, Set<string>>();

  constructor() {
    this.initClient();
  }

  private initClient() {
    // An unset ANTHROPIC_API_KEY does not necessarily mean "no credentials" -
    // the SDK also resolves auth tokens and on-disk profiles. Construct the
    // client and let it tell us, rather than guessing from one env var.
    try {
      this.client = new Anthropic();
      const hasCredential =
        !!process.env.ANTHROPIC_API_KEY || !!process.env.ANTHROPIC_AUTH_TOKEN;
      if (!hasCredential) {
        // Keep the client, but do not assume it will work. The first failed
        // call flips us to the simulated brain permanently.
        this.logger.log(
          'No ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN in env. Agents will try the Claude API once, then fall back to the simulated brain.',
        );
      }
    } catch (err: any) {
      this.client = null;
      this.logger.warn(`Anthropic client unavailable: ${err?.message}`);
    }
  }

  get activeBrain(): 'claude' | 'simulated' {
    return this.client && !this.liveBrainDisabled ? 'claude' : 'simulated';
  }

  get activeModel(): string | null {
    return this.activeBrain === 'claude' ? this.model : null;
  }

  async think(req: ThinkRequest): Promise<ThinkResult> {
    const started = Date.now();

    if (this.client && !this.liveBrainDisabled) {
      try {
        const text = await this.thinkWithClaude(req);
        if (text) {
          return {
            text,
            brain: 'claude',
            model: this.model,
            latencyMs: Date.now() - started,
          };
        }
      } catch (err: any) {
        // One failure is enough: without credentials every call fails the same
        // way, and retrying per turn would stall every conversation.
        this.liveBrainDisabled = true;
        this.logger.warn(
          `Claude API unavailable (${err?.message}). Switching all agents to the simulated brain.`,
        );
      }
    }

    return {
      text: this.thinkOffline(req),
      brain: 'simulated',
      model: null,
      latencyMs: Date.now() - started,
    };
  }

  // ---------------------------------------------------------------------------
  // Direct messages
  // ---------------------------------------------------------------------------

  /** What an agent says back when a person messages it in the chat. */
  async chat(req: ChatRequest): Promise<ThinkResult> {
    const started = Date.now();
    if (this.client && !this.liveBrainDisabled) {
      try {
        const text = await this.chatWithClaude(req);
        if (text) return { text, brain: 'claude', model: this.model, latencyMs: Date.now() - started };
      } catch (err: any) {
        this.liveBrainDisabled = true;
        this.logger.warn(`Claude API unavailable (${err?.message}). Switching all agents to the simulated brain.`);
      }
    }
    return { text: this.chatOffline(req), brain: 'simulated', model: null, latencyMs: Date.now() - started };
  }

  private async chatWithClaude(req: ChatRequest): Promise<string> {
    const { persona, userName, history, hasImages } = req;
    const system = [
      persona.persona,
      '',
      `You are chatting one-to-one with ${userName} in a messaging app on the Agent Social Media Platform.`,
      'Rules:',
      '- Reply like a person texting: one to three short sentences, warm but in character. An emoji now and then is fine.',
      '- Answer what they actually asked; ask a short follow-up question when it helps the conversation.',
      '- You can talk about anything, and you bring your professional angle when it is relevant.',
      '- Never describe yourself in the third person and never prefix your name.',
      hasImages ? '- They attached an image you cannot see; acknowledge it briefly and ask what it shows.' : '',
      req.context && req.context.items.length
        ? `\n${req.context.label}:\n${req.context.items.map((i, n) => `${n + 1}. ${i.title}${i.source ? ` (${i.source})` : ''}`).join('\n')}\nThese are real and current - use them when relevant instead of inventing news.`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const messages: Anthropic.Beta.BetaMessageParam[] = history.slice(-12).map((t) => ({
      role: t.fromAgent ? 'assistant' : 'user',
      content: t.text || '(sent an image)',
    }));
    if (messages.length === 0 || messages[0].role !== 'user') {
      messages.unshift({ role: 'user', content: `${userName} opened the chat.` });
    }
    if (messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', content: '(continue)' });
    }

    const response = await this.client!.beta.messages.create({
      model: this.model,
      max_tokens: 300,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages,
    });
    if (response.stop_reason === 'refusal') throw new Error('Model declined to reply');
    return response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((b) => b.text.trim())
      .join(' ')
      .trim();
  }

  private chatOffline(req: ChatRequest): string {
    const { persona, userName, history, hasImages } = req;
    const last = [...history].reverse().find((t) => !t.fromAgent)?.text?.trim() ?? '';
    const firstName = userName.split(' ')[0];

    // Real headlines beat any template: if the platform handed us fresh items, read them out.
    if (req.context && req.context.items.length) {
      const lines = req.context.items.slice(0, 3).map((i, n) => `${n + 1}. ${i.title}${i.source ? ` — ${i.source}` : ''}`);
      return `${firstName}, ${req.context.label.toLowerCase()} right now:\n${lines.join('\n')}\nWant me to dig into any of these?`;
    }
    const isGreeting = /^(hi|hello|hey|yo|namaste|hola|good (morning|evening|afternoon))\b/i.test(last) && last.length < 40;
    const isThanks = /\b(thanks|thank you|thx|cheers)\b/i.test(last);
    const isQuestion = /\?\s*$/.test(last) || /^(what|why|how|when|where|who|which|can|could|should|is|are|do|does|will)\b/i.test(last);
    const isFirst = history.filter((t) => !t.fromAgent).length <= 1;

    // A short quote of what they said, so the reply visibly engages with it.
    const quote = last.replace(/[?!.]+$/, '').slice(0, 70) + (last.length > 70 ? '…' : '');

    const bank = hasImages && !last
      ? persona.chat.image
      : isGreeting || (isFirst && !isQuestion && last.length < 25)
        ? persona.chat.greet
        : isThanks
          ? persona.chat.thanks
          : isQuestion
            ? persona.chat.question
            : persona.chat.statement;

    const key = `dm:${persona.username}:${bank === persona.chat.greet ? 'g' : bank === persona.chat.question ? 'q' : bank === persona.chat.thanks ? 't' : bank === persona.chat.image ? 'i' : 's'}`;
    let used = this.usedTemplates.get(key);
    if (!used || used.size >= bank.length) {
      used = new Set<string>();
      this.usedTemplates.set(key, used);
    }
    const available = bank.filter((t) => !used!.has(t));
    const template = available[Math.floor(Math.random() * available.length)] ?? bank[0];
    used.add(template);

    return template.replace(/\{name\}/g, firstName).replace(/\{quote\}/g, quote || 'that');
  }

  // ---------------------------------------------------------------------------
  // Live brain
  // ---------------------------------------------------------------------------

  private async thinkWithClaude(req: ThinkRequest): Promise<string> {
    const { persona, topic, peers, transcript, turnIndex, maxTurns } = req;
    const isLast = turnIndex >= maxTurns - 1;

    const roster = peers.map((p) => `${p.displayName} (${p.role})`).join(', ');

    const system = [
      persona.persona,
      '',
      `You are on a live call with: ${roster || 'no one yet'}.`,
      ...(isCustomTopicId(topic.id)
        ? [
            `A member of the audience asked you all to debate: ${topic.subject}`,
            'Argue it properly from your role\'s point of view: take a position, give reasons, and engage with what the others say. It is fine to change your mind if someone makes a good point.',
          ]
        : [
            `The story under discussion: ${topic.subject}.`,
            'Briefing you all share:',
            `- Source: ${topic.source}`,
            `- Key figure: ${topic.keyFigure}`,
            `- Still open / unconfirmed: ${topic.openQuestion}`,
          ]),
      '',
      'Rules for this call:',
      '- Speak as a participant on a call, not as an assistant. No greetings after the first turn, no sign-offs, no bullet points.',
      '- Two or three sentences maximum. This is spoken dialogue.',
      '- Respond to what the previous speaker actually said. Disagree when your role would disagree.',
      '- Stay inside the briefing. Do not invent names, quotes, dates or numbers that are not in it; if something is unknown, say it is unconfirmed.',
      '- Never describe yourself in the third person and never prefix your name.',
      isLast
        ? '- This is the final turn of the call. Land on the line the audience should take away and stop.'
        : '- Do not wrap up yet; leave something for the others to answer.',
    ].join('\n');

    const messages: Anthropic.Beta.BetaMessageParam[] = [];

    if (transcript.length === 0) {
      messages.push({
        role: 'user',
        content: `You are opening the call about ${topic.subject}. Say your first two or three sentences.`,
      });
    } else {
      // Other speakers become 'user' turns tagged with who spoke; our own past
      // turns become 'assistant' turns so the model sees its own voice.
      for (const line of transcript) {
        if (line.speakerId === req.selfId) {
          messages.push({ role: 'assistant', content: line.text });
        } else {
          messages.push({
            role: 'user',
            content: `${line.speakerName} (${line.speakerRole}) said: ${line.text}`,
          });
        }
      }
      if (messages[0].role !== 'user') {
        messages.unshift({
          role: 'user',
          content: `The call about ${topic.subject} is in progress.`,
        });
      }
      messages.push({
        role: 'user',
        content: 'It is your turn to speak. Reply in two or three sentences.',
      });
    }

    const response = await this.client!.beta.messages.create({
      model: this.model,
      max_tokens: 400,
      // Spoken turns are short and latency-sensitive, so keep effort low.
      output_config: { effort: 'low' },
      // If the model declines a turn on policy grounds, the API re-runs the
      // same request on a fallback model inside this call instead of leaving
      // the room silent.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages,
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Model declined to produce a turn');
    }

    return response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((block) => block.text.trim())
      .join(' ')
      .trim();
  }

  // ---------------------------------------------------------------------------
  // Offline brain
  // ---------------------------------------------------------------------------

  private thinkOffline(req: ThinkRequest): string {
    const { persona, topic, transcript, turnIndex, maxTurns, selfId } = req;

    const isOpening = transcript.length === 0;
    const isClosing = turnIndex >= maxTurns - 1;

    // Audience topics are not news briefings: use the persona's debate voice,
    // which only needs the subject and the previous speaker.
    const voice = isCustomTopicId(topic.id) ? persona.debate : persona.voice;
    const bank = isOpening ? voice.open : isClosing ? voice.close : voice.reply;

    // Agents are addressed by their full name ("Agent Two"), since the first
    // word alone is shared by everyone on the desk.
    const last = [...transcript].reverse().find((l) => l.speakerId !== selfId);
    const prevName = last ? last.speakerName : 'everyone';

    const roomKey = `${selfId}:${topic.id}:${isOpening ? 'open' : isClosing ? 'close' : 'reply'}`;
    let used = this.usedTemplates.get(roomKey);
    if (!used || used.size >= bank.length) {
      used = new Set<string>();
      this.usedTemplates.set(roomKey, used);
    }

    const available = bank.filter((t) => !used!.has(t));
    const template = available[Math.floor(Math.random() * available.length)] ?? bank[0];
    used.add(template);

    // Audience topics are typed as questions/titles; strip the trailing
    // punctuation so they sit inside a sentence.
    const subject = isCustomTopicId(topic.id) ? topic.subject.replace(/[?!.]+$/, '') : topic.subject;

    return template
      .replace(/\{subject\}/g, subject)
      .replace(/\{source\}/g, topic.source)
      .replace(/\{figure\}/g, topic.keyFigure)
      .replace(/\{question\}/g, topic.openQuestion)
      .replace(/\{prev\}/g, prevName);
  }
}
