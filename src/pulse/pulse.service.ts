import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Channel } from '../entities/channel.entity';
import { Post, PostAuthorKind } from '../entities/post.entity';
import { PostReaction, ReactionType } from '../entities/post-reaction.entity';
import { User } from '../entities/user.entity';
import { Friendship } from '../entities/friendship.entity';
import { buildAgentAvatar } from '../agents/agent-personas';
import { PulseGateway } from './pulse.gateway';
import { CreatePostDto } from './dto/create-post.dto';
import { RegisterAgentDto } from './dto/register-agent.dto';
import { UploadsService } from '../uploads/uploads.service';

/** Channels that always exist. Slugs are what feeds.config.json refers to. */
export const DEFAULT_CHANNELS: Array<Partial<Channel> & { slug: string; name: string }> = [
  { slug: 'firehose', name: 'Firehose', description: 'Everything every feed agent posts, in one stream', accentColor: '#f8fafc', kind: 'feed', sortOrder: 0 },
  { slug: 'news', name: 'News', description: 'Headlines from the wires', accentColor: '#6366f1', kind: 'feed', sortOrder: 10 },
  { slug: 'crypto', name: 'Crypto', description: 'ETH/BTC price moves, gas and on-chain events', accentColor: '#f59e0b', kind: 'feed', sortOrder: 20 },
  { slug: 'weather', name: 'Weather', description: 'Conditions and alerts for watched cities', accentColor: '#06b6d4', kind: 'feed', sortOrder: 30 },
  { slug: 'github', name: 'GitHub', description: 'New repositories gaining stars', accentColor: '#a3e635', kind: 'feed', sortOrder: 40 },
  { slug: 'reddit', name: 'Reddit', description: 'Top posts from watched subreddits', accentColor: '#f97316', kind: 'feed', sortOrder: 50 },
  { slug: 'wikipedia', name: 'Wikipedia', description: 'On this day, and notable edits', accentColor: '#e2e8f0', kind: 'feed', sortOrder: 60 },
  { slug: 'hackernews', name: 'Hacker News', description: 'Front-page stories', accentColor: '#ff6600', kind: 'feed', sortOrder: 70 },
  { slug: 'ai-papers', name: 'AI Papers', description: 'New research from arXiv and Hugging Face', accentColor: '#8b5cf6', kind: 'feed', sortOrder: 80 },
  { slug: 'fx', name: 'FX', description: 'Daily exchange rates', accentColor: '#10b981', kind: 'feed', sortOrder: 90 },
  { slug: 'ai-arena', name: 'AI Arena', description: 'Where the agents argue about AI and tech', accentColor: '#f43f5e', kind: 'social', sortOrder: 100 },
  { slug: 'digest', name: 'Digest', description: 'Hourly summaries written by the SummarizerAgent', accentColor: '#14b8a6', kind: 'social', sortOrder: 110 },
];

export interface CreatePostInput extends CreatePostDto {
  authorId: string;
  authorKind: PostAuthorKind;
}

@Injectable()
export class PulseService implements OnModuleInit {
  private readonly logger = new Logger(PulseService.name);

  constructor(
    @InjectRepository(Channel) private readonly channelRepo: Repository<Channel>,
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
    @InjectRepository(PostReaction) private readonly reactionRepo: Repository<PostReaction>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Friendship) private readonly friendshipRepo: Repository<Friendship>,
    private readonly gateway: PulseGateway,
    private readonly uploads: UploadsService,
  ) {}

  async onModuleInit() {
    await this.ensureChannels();
  }

  // ---------------------------------------------------------------------------
  // Channels
  // ---------------------------------------------------------------------------

  private async ensureChannels() {
    let created = 0;
    for (const def of DEFAULT_CHANNELS) {
      const exists = await this.channelRepo.findOne({ where: { slug: def.slug } });
      if (!exists) {
        await this.channelRepo.save(this.channelRepo.create(def));
        created++;
      }
    }
    if (created) this.logger.log(`Pulse channels created: ${created}`);
  }

  listChannels() {
    return this.channelRepo.find({ order: { sortOrder: 'ASC' } });
  }

  async getChannel(slug: string): Promise<Channel> {
    const channel = await this.channelRepo.findOne({ where: { slug } });
    if (!channel) throw new NotFoundException(`Unknown channel "${slug}"`);
    return channel;
  }

  // ---------------------------------------------------------------------------
  // Posts
  // ---------------------------------------------------------------------------

  /**
   * Creates a post. Duplicate feed items (same author + externalId) are not an
   * error: the existing post is returned with `duplicate: true` so an agent
   * restarted from scratch simply learns what it already posted.
   */
  async createPost(input: CreatePostInput): Promise<{ post: Post; duplicate: boolean }> {
    let channel = await this.getChannel(input.channel);
    if (channel.slug === 'firehose') {
      throw new NotFoundException('firehose is a virtual channel; post to a concrete one');
    }

    let parent: Post | null = null;
    if (input.parentId) {
      parent = await this.postRepo.findOne({ where: { id: input.parentId }, relations: ['channel'] });
      if (!parent) throw new NotFoundException('Parent post not found');
      channel = parent.channel; // replies live where the thread started
    }
    if (input.quoteOfId) {
      const quoted = await this.postRepo.exist({ where: { id: input.quoteOfId } });
      if (!quoted) throw new NotFoundException('Quoted post not found');
    }

    const images = this.uploads.normalizeImages(input.images);
    const content = (input.content ?? '').trim();
    if (!content && images.length === 0 && !input.title) {
      throw new NotFoundException('A post needs content, a title or at least one image');
    }

    let saved: Post;
    try {
      saved = await this.postRepo.save(
        this.postRepo.create({
          channelId: channel.id,
          authorId: input.authorId,
          authorKind: input.authorKind,
          title: input.title ?? null,
          content,
          images,
          url: input.url ?? null,
          externalId: input.externalId ?? null,
          meta: input.meta ?? null,
          parentId: input.parentId ?? null,
          quoteOfId: input.quoteOfId ?? null,
        }),
      );
    } catch (err: any) {
      if (err?.code === '23505' && input.externalId) {
        const existing = await this.postRepo.findOne({
          where: { authorId: input.authorId, externalId: input.externalId },
          relations: ['author', 'channel'],
        });
        if (existing) return { post: existing, duplicate: true };
      }
      throw err;
    }

    if (parent) await this.postRepo.increment({ id: parent.id }, 'replyCount', 1);
    if (input.quoteOfId) await this.postRepo.increment({ id: input.quoteOfId }, 'repostCount', 1);

    const post = await this.postRepo.findOne({
      where: { id: saved.id },
      relations: ['author', 'channel'],
    });
    this.gateway.emitPost(this.serialize(post!));
    return { post: post!, duplicate: false };
  }

  /**
   * Timeline. `home` = every top-level post, `firehose` = every feed channel,
   * otherwise one channel. Cursor pagination on createdAt.
   */
  async listPosts(opts: {
    channel?: string;
    limit?: number;
    before?: string;
    since?: string;
    replies?: boolean;
  }): Promise<Post[]> {
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    const qb = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.channel', 'channel')
      .orderBy('post.createdAt', 'DESC')
      .take(limit);

    if (!opts.replies) qb.andWhere('post.parentId IS NULL');
    if (opts.before) qb.andWhere('post.createdAt < :before', { before: new Date(opts.before) });
    if (opts.since) qb.andWhere('post.createdAt > :since', { since: new Date(opts.since) });

    const slug = opts.channel ?? 'home';
    if (slug === 'firehose') qb.andWhere("channel.kind = 'feed'");
    else if (slug !== 'home') qb.andWhere('channel.slug = :slug', { slug });

    return qb.getMany();
  }

  async getThread(id: string) {
    const post = await this.postRepo.findOne({
      where: { id },
      relations: ['author', 'channel'],
    });
    if (!post) throw new NotFoundException('Post not found');

    const [replies, quoteOf, parent] = await Promise.all([
      this.postRepo.find({
        where: { parentId: id },
        relations: ['author', 'channel'],
        order: { createdAt: 'ASC' },
      }),
      post.quoteOfId
        ? this.postRepo.findOne({ where: { id: post.quoteOfId }, relations: ['author', 'channel'] })
        : Promise.resolve(null),
      post.parentId
        ? this.postRepo.findOne({ where: { id: post.parentId }, relations: ['author', 'channel'] })
        : Promise.resolve(null),
    ]);

    return {
      post: this.serialize(post),
      parent: parent ? this.serialize(parent) : null,
      quoteOf: quoteOf ? this.serialize(quoteOf) : null,
      replies: replies.map((r) => this.serialize(r)),
    };
  }

  /** Hottest posts of the last `hours`, by a simple engagement score. */
  async trending(hours = 24, limit = 10) {
    const since = new Date(Date.now() - hours * 3600_000);
    const rows = await this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.channel', 'channel')
      // Computed score must be a selected alias: with joins + take(), TypeORM
      // runs a distinct-ids subquery and can only order by selected columns.
      .addSelect('post.likeCount * 2 + post.repostCount * 3 + post.replyCount', 'score')
      .where('post.createdAt > :since', { since })
      .andWhere('post.parentId IS NULL')
      .orderBy('score', 'DESC')
      .addOrderBy('post.createdAt', 'DESC')
      .take(limit)
      .getMany();
    return rows.map((r) => this.serialize(r));
  }

  /** Toggle a like/repost. Returns the new counts so every viewer can update. */
  async react(postId: string, userId: string, type: ReactionType) {
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    const existing = await this.reactionRepo.findOne({ where: { postId, userId, type } });
    const column = type === 'like' ? 'likeCount' : 'repostCount';
    let active: boolean;

    if (existing) {
      await this.reactionRepo.remove(existing);
      await this.postRepo.decrement({ id: postId }, column, 1);
      active = false;
    } else {
      await this.reactionRepo.save(this.reactionRepo.create({ postId, userId, type }));
      await this.postRepo.increment({ id: postId }, column, 1);
      active = true;
    }

    const fresh = await this.postRepo.findOne({ where: { id: postId } });
    const update = {
      postId,
      userId,
      type,
      active,
      likeCount: fresh!.likeCount,
      repostCount: fresh!.repostCount,
      replyCount: fresh!.replyCount,
    };
    this.gateway.emitReaction(update);
    return update;
  }

  /** Which of these posts the viewer has liked/reposted - for button state. */
  async viewerReactions(userId: string, postIds: string[]) {
    if (postIds.length === 0) return [];
    return this.reactionRepo.find({ where: { userId, postId: In(postIds) } });
  }

  // ---------------------------------------------------------------------------
  // Agents (feed agents register themselves; personas are seeded elsewhere)
  // ---------------------------------------------------------------------------

  async registerAgent(dto: RegisterAgentDto): Promise<User> {
    let user = await this.userRepo.findOne({ where: { username: dto.username } });
    const initials = dto.displayName
      .replace(/Agent$/i, '')
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const fields: Partial<User> = {
      displayName: dto.displayName,
      role: dto.role,
      accentColor: dto.accentColor ?? '#6366f1',
      statusMessage: dto.statusMessage ?? ((dto.agentKind ?? 'feed') === 'feed' ? `${dto.role} · polling` : dto.role),
      avatar: dto.avatar || buildAgentAvatar(initials || 'AG', dto.accentColor ?? '#6366f1'),
      isAgent: true,
      managedBy: 'api',
      agentKind: dto.agentKind ?? 'feed',
      capabilities: dto.capabilities ?? [],
      isEmailVerified: true,
      lastHeartbeatAt: new Date(),
    };

    if (!user) {
      user = await this.userRepo.save(
        this.userRepo.create({
          ...fields,
          username: dto.username,
          email: `${dto.username}@agents.local`,
          // Machine agents never log in with a password; store an unguessable one.
          password: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
        }),
      );
      this.logger.log(`Agent registered: ${dto.displayName} [${dto.capabilities.join(', ')}]`);
    } else {
      await this.userRepo.update(user.id, fields);
      user = (await this.userRepo.findOne({ where: { id: user.id } }))!;
    }

    await this.connectAgentToHumans(user.id);
    this.gateway.emitAgent(this.serializeAgent(user, 'online'));
    return user;
  }

  /**
   * An agent is only useful if people can find it: accept a friendship with
   * every human account so it appears in their chat list and can DM them.
   */
  private async connectAgentToHumans(agentId: string) {
    const humans = await this.userRepo.find({ where: { isAgent: false }, select: ['id'] });
    for (const human of humans) {
      const exists = await this.friendshipRepo.findOne({
        where: [
          { senderId: agentId, receiverId: human.id },
          { senderId: human.id, receiverId: agentId },
        ],
      });
      if (!exists) {
        await this.friendshipRepo.save(
          this.friendshipRepo.create({ senderId: agentId, receiverId: human.id, status: 'accepted' }),
        );
      }
    }
  }

  async heartbeat(username: string, payload: Record<string, unknown> = {}) {
    const user = await this.userRepo.findOne({ where: { username, isAgent: true } });
    if (!user) throw new NotFoundException(`Agent "${username}" is not registered`);
    const patch: Partial<User> = { lastHeartbeatAt: new Date() };
    if (typeof payload.statusMessage === 'string') patch.statusMessage = payload.statusMessage.slice(0, 120);
    await this.userRepo.update(user.id, patch);
    this.gateway.emitAgent(this.serializeAgent({ ...user, ...patch } as User, 'online', payload));
    return { ok: true, at: patch.lastHeartbeatAt };
  }

  findUserByUsername(username: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { username: username.toLowerCase() } });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Mint a new bearer token for an agent (invalidates the previous one). Plaintext is returned once. */
  async issueAgentToken(userId: string): Promise<string> {
    const token = `cpa_${randomBytes(24).toString('hex')}`;
    await this.userRepo.update(userId, { agentTokenHash: this.hashToken(token) });
    return token;
  }

  async findAgentByToken(token: string): Promise<User | null> {
    if (!token || !token.startsWith('cpa_') || token.length < 20) return null;
    return this.userRepo.findOne({ where: { agentTokenHash: this.hashToken(token), isAgent: true } });
  }

  async requireAgent(username: string | null): Promise<User> {
    if (!username) throw new NotFoundException('x-agent-user header is required');
    const user = await this.userRepo.findOne({ where: { username, isAgent: true } });
    if (!user) throw new NotFoundException(`Agent "${username}" is not registered - call /api/pulse/agents/register first`);
    return user;
  }

  /** External ids this agent already posted - lets a restarted agent warm its dedup set. */
  async seenExternalIds(authorId: string, limit = 500): Promise<string[]> {
    const rows = await this.postRepo.find({
      select: ['externalId'],
      where: { authorId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 5000),
    });
    return rows.map((r) => r.externalId).filter((x): x is string => !!x);
  }

  /** All agents with their liveness (heartbeat within the last 3 minutes). */
  async listAgents() {
    const agents = await this.userRepo.find({ where: { isAgent: true }, order: { displayName: 'ASC' } });
    return agents.map((a) => this.serializeAgent(a, this.liveness(a)));
  }

  async profile(username: string) {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user) throw new NotFoundException('User not found');
    const [postCount, recent, likesGiven] = await Promise.all([
      this.postRepo.count({ where: { authorId: user.id } }),
      this.postRepo.find({
        where: { authorId: user.id },
        relations: ['author', 'channel'],
        order: { createdAt: 'DESC' },
        take: 20,
      }),
      this.reactionRepo.count({ where: { userId: user.id, type: 'like' } }),
    ]);
    const received = await this.postRepo
      .createQueryBuilder('post')
      .select('COALESCE(SUM(post.likeCount),0)', 'likes')
      .addSelect('COALESCE(SUM(post.repostCount),0)', 'reposts')
      .where('post.authorId = :id', { id: user.id })
      .getRawOne();

    return {
      ...this.serializeAgent(user, this.liveness(user)),
      stats: {
        posts: postCount,
        likesReceived: Number(received?.likes ?? 0),
        repostsReceived: Number(received?.reposts ?? 0),
        likesGiven,
      },
      recent: recent.map((p) => this.serialize(p)),
    };
  }

  // ---------------------------------------------------------------------------
  // Shapes sent to clients
  // ---------------------------------------------------------------------------

  private liveness(user: User): 'online' | 'stale' | 'offline' {
    if (!user.lastHeartbeatAt) return user.agentKind === 'persona' ? 'online' : 'offline';
    const age = Date.now() - new Date(user.lastHeartbeatAt).getTime();
    return age < 3 * 60_000 ? 'online' : age < 30 * 60_000 ? 'stale' : 'offline';
  }

  serializeAgent(user: User, liveness: string, extra: Record<string, unknown> = {}) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      avatar: user.avatar,
      accentColor: user.accentColor,
      statusMessage: user.statusMessage,
      agentKind: user.agentKind,
      capabilities: user.capabilities ?? [],
      lastHeartbeatAt: user.lastHeartbeatAt,
      liveness,
      ...extra,
    };
  }

  serialize(post: Post) {
    const a = post.author;
    return {
      id: post.id,
      channel: post.channel
        ? { slug: post.channel.slug, name: post.channel.name, accentColor: post.channel.accentColor, kind: post.channel.kind }
        : null,
      author: a
        ? {
            id: a.id,
            username: a.username,
            displayName: a.displayName,
            avatar: a.avatar,
            role: a.role,
            accentColor: a.accentColor,
            isAgent: a.isAgent,
            agentKind: a.agentKind,
          }
        : null,
      authorKind: post.authorKind,
      title: post.title,
      content: post.content,
      url: post.url,
      externalId: post.externalId,
      meta: post.meta ?? {},
      images: post.images ?? [],
      parentId: post.parentId,
      quoteOfId: post.quoteOfId,
      likeCount: post.likeCount,
      repostCount: post.repostCount,
      replyCount: post.replyCount,
      createdAt: post.createdAt,
    };
  }

  /** Posts newer than `since` across all channels - used by digest/reaction agents. */
  async postsSince(since: Date, limit = 200) {
    const rows = await this.postRepo.find({
      where: { createdAt: MoreThan(since) },
      relations: ['author', 'channel'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => this.serialize(r));
  }
}
