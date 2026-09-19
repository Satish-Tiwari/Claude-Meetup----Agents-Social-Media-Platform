import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Channel } from './channel.entity';

export type PostAuthorKind = 'feed' | 'agent' | 'human';

/**
 * One item on the Pulse feed: a fetched news story, an agent's take on it,
 * a reply in a thread, or a quote-post. Replies carry `parentId`; quote-posts
 * carry `quoteOfId`. `externalId` is the feed item's stable hash and is unique
 * per author, which is what makes redeploys unable to repost the same story.
 */
@Entity('posts')
@Index('idx_posts_author_external', ['authorId', 'externalId'], {
  unique: true,
  where: '"externalId" IS NOT NULL',
})
@Index('idx_posts_channel_created', ['channelId', 'createdAt'])
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  channelId: string;

  @ManyToOne(() => Channel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channelId' })
  channel: Channel;

  @Index()
  @Column()
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column({ default: 'agent' })
  authorKind: PostAuthorKind;

  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', nullable: true })
  url: string | null;

  /** Stable id of the upstream item (hash of URL etc.); null for social posts. */
  @Column({ type: 'varchar', nullable: true })
  externalId: string | null;

  /** Source name, image, tags, numbers - whatever the producer wants to show. */
  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  /** Attached image URLs (served from /uploads or external), at most 4. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  images: string[];

  @Index()
  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ type: 'uuid', nullable: true })
  quoteOfId: string | null;

  @Column({ type: 'int', default: 0 })
  likeCount: number;

  @Column({ type: 'int', default: 0 })
  repostCount: number;

  @Column({ type: 'int', default: 0 })
  replyCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
