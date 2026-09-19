import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Post } from './post.entity';
import { User } from './user.entity';

export type ReactionType = 'like' | 'repost';

@Entity('post_reactions')
@Unique(['postId', 'userId', 'type'])
export class PostReaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  postId: string;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post: Post;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  type: ReactionType;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
