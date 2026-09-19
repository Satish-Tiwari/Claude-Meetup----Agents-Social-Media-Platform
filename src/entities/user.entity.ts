import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Call } from './call.entity';
import { Message } from './message.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  displayName: string;

  @Column({ select: false })
  password: string;

  @Column({ default: '' })
  avatar: string;

  @Column({ unique: true, nullable: true })
  email: string;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true, select: false })
  otpCode: string;

  @Column({ type: 'timestamp', nullable: true, select: false })
  otpExpiresAt: Date;

  @Column({ nullable: true, select: false })
  otpPurpose: string;

  @Column({ default: 'Available for calls 💬' })
  statusMessage: string;

  @Column({ default: 'dark' })
  theme: string;

  // ---------------------------------------------------------------------------
  // AI agent identity
  // A participant is either a human account or an autonomous agent. Agents reuse
  // the whole user surface (auth, friendships, rooms, call logs) so that the
  // platform does not need a parallel notion of "who is on a call".
  // ---------------------------------------------------------------------------

  @Column({ default: false })
  isAgent: boolean;

  /** Short role label, e.g. "Security Analyst" */
  @Column({ default: '' })
  role: string;

  /** System prompt / character sheet driving the agent's speech */
  @Column({ type: 'text', default: '' })
  persona: string;

  /** Hex colour used for this agent's node in the Observatory graph */
  @Column({ default: '#6366f1' })
  accentColor: string;

  /** Which brain produced this agent's turns: 'claude' or 'simulated' */
  @Column({ default: 'simulated' })
  brain: string;

  @Column({ type: 'varchar', nullable: true })
  model: string;

  /** 'persona' = talks on calls/threads, 'feed' = polls an external API, 'summarizer' = digests. */
  @Column({ default: 'persona' })
  agentKind: 'persona' | 'feed' | 'summarizer';

  /** Advertised capability tags, e.g. ["news", "current-events"]. */
  @Column({ type: 'simple-array', default: '' })
  capabilities: string[];

  /** Last heartbeat from an out-of-process agent; null for in-process personas. */
  @Column({ type: 'timestamptz', nullable: true })
  lastHeartbeatAt: Date | null;

  /**
   * Who owns this agent's lifecycle: 'orchestrator' = seeded from agent-personas.ts
   * (retired when removed from code), 'api' = registered by an external system
   * (never swept automatically).
   */
  @Column({ default: 'api' })
  managedBy: 'orchestrator' | 'api';

  /** sha256 of the per-agent bearer token issued by /api/agents/v1/register. Never returned. */
  @Column({ type: 'varchar', nullable: true, select: false })
  agentTokenHash: string | null;

  @OneToMany(() => Call, (call) => call.caller)
  outgoingCalls: Call[];

  @OneToMany(() => Call, (call) => call.callee)
  incomingCalls: Call[];

  @OneToMany(() => Message, (message) => message.sender)
  sentMessages: Message[];

  @OneToMany(() => Message, (message) => message.receiver)
  receivedMessages: Message[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
