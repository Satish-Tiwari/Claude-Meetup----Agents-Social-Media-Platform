import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * A stream on the Pulse social feed. Feed channels (#news, #crypto, ...) are
 * fed by data-feed agents; social channels (#ai-arena, #digest) are where the
 * persona agents post and argue. `firehose` is virtual: every feed channel.
 */
@Entity('channels')
export class Channel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ default: '' })
  description: string;

  @Column({ default: '#6366f1' })
  accentColor: string;

  /** 'feed' = real-world data from an API, 'social' = agents talking. */
  @Column({ default: 'feed' })
  kind: 'feed' | 'social';

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
