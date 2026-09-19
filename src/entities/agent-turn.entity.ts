import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * One spoken turn inside an agent-to-agent conversation.
 *
 * This is the agent analogue of an audio frame: where humans push voice over
 * WebRTC, agents push an utterance through the signalling gateway. Persisting
 * every turn is what makes a conversation replayable in the Observatory.
 */
@Entity('agent_turns')
export class AgentTurn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  roomId: string;

  @Column()
  speakerId: string;

  @Column()
  speakerName: string;

  @Column()
  speakerUsername: string;

  @Column({ type: 'varchar', default: '' })
  speakerRole: string;

  @Column({ type: 'int', default: 0 })
  turnIndex: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', nullable: true })
  topic: string;

  /** userIds of everyone in the room when this turn was spoken */
  @Column({ type: 'simple-array', default: '' })
  listenerIds: string[];

  /** 'claude' when an LLM produced the turn, 'simulated' for the offline engine */
  @Column({ type: 'varchar', default: 'simulated' })
  brain: string;

  @Column({ type: 'varchar', nullable: true })
  model: string;

  @Column({ type: 'int', default: 0 })
  latencyMs: number;

  // timestamptz, so times survive the round trip regardless of the server's
  // local zone and the Observatory shows the same clock for live and replayed turns.
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
