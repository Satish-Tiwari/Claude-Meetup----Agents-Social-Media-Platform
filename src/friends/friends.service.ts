import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Friendship } from '../entities/friendship.entity';
import { User } from '../entities/user.entity';
import { UsersService } from '../users/users.service';
import { SignalingGateway } from '../signaling/signaling.gateway';

@Injectable()
export class FriendsService implements OnModuleInit {
  private readonly logger = new Logger(FriendsService.name);

  constructor(
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => SignalingGateway))
    private readonly signalingGateway: SignalingGateway,
  ) {}

  async onModuleInit() {
    await this.seedInitialFriendships();
  }

  /**
   * Seed mutual friendships among demo users (alice, bob, charlie)
   */
  async seedInitialFriendships() {
    try {
      const alice = await this.usersService.findByUsername('alice');
      const bob = await this.usersService.findByUsername('bob');
      const charlie = await this.usersService.findByUsername('charlie');

      if (alice && bob && charlie) {
        const pairs = [
          [alice.id, bob.id],
          [alice.id, charlie.id],
          [bob.id, charlie.id],
        ];

        for (const [u1, u2] of pairs) {
          const exists = await this.friendshipRepo.findOne({
            where: [
              { senderId: u1, receiverId: u2 },
              { senderId: u2, receiverId: u1 },
            ],
          });

          if (!exists) {
            await this.friendshipRepo.save(
              this.friendshipRepo.create({
                senderId: u1,
                receiverId: u2,
                status: 'accepted',
              }),
            );
          }
        }
        this.logger.log('Initial friendships seeded among demo users');
      }
    } catch (err) {
      this.logger.warn('Could not seed initial friendships', err.message);
    }
  }

  /**
   * Send a friend request by target userId or username
   */
  async sendFriendRequest(senderId: string, targetUserId?: string, targetUsername?: string): Promise<Friendship> {
    let targetUser: User | null = null;
    if (targetUserId) {
      targetUser = await this.usersService.findById(targetUserId);
    } else if (targetUsername) {
      targetUser = await this.usersService.findByUsernameOrEmail(targetUsername);
    }

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    if (targetUser.id === senderId) {
      throw new BadRequestException('You cannot send a friend request to yourself');
    }

    // Check existing friendship in either direction
    const existing = await this.friendshipRepo.findOne({
      where: [
        { senderId, receiverId: targetUser.id },
        { senderId: targetUser.id, receiverId: senderId },
      ],
      relations: ['sender', 'receiver'],
    });

    if (existing) {
      if (existing.status === 'accepted') {
        throw new ConflictException('You are already friends with this user');
      }
      if (existing.status === 'pending') {
        if (existing.senderId === senderId) {
          throw new ConflictException('Friend request already sent');
        } else {
          // If the other person already sent a request, auto-accept!
          existing.status = 'accepted';
          const saved = await this.friendshipRepo.save(existing);
          this.notifyFriendshipAccepted(saved);
          return saved;
        }
      }
      // If rejected, re-open as pending
      existing.senderId = senderId;
      existing.receiverId = targetUser.id;
      existing.status = 'pending';
      const saved = await this.friendshipRepo.save(existing);
      this.notifyFriendRequest(saved);
      return saved;
    }

    const request = this.friendshipRepo.create({
      senderId,
      receiverId: targetUser.id,
      status: 'pending',
    });

    const saved = await this.friendshipRepo.save(request);
    this.notifyFriendRequest(saved);
    return saved;
  }

  /**
   * Accept an incoming friend request
   */
  async acceptFriendRequest(currentUserId: string, requestId: string): Promise<Friendship> {
    const request = await this.friendshipRepo.findOne({
      where: { id: requestId },
      relations: ['sender', 'receiver'],
    });

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.receiverId !== currentUserId) {
      throw new BadRequestException('You are not authorized to accept this request');
    }

    request.status = 'accepted';
    const saved = await this.friendshipRepo.save(request);
    this.notifyFriendshipAccepted(saved);
    return saved;
  }

  /**
   * Reject an incoming friend request
   */
  async rejectFriendRequest(currentUserId: string, requestId: string): Promise<{ message: string }> {
    const request = await this.friendshipRepo.findOne({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.receiverId !== currentUserId) {
      throw new BadRequestException('You are not authorized to reject this request');
    }

    request.status = 'rejected';
    await this.friendshipRepo.save(request);
    return { message: 'Friend request declined' };
  }

  /**
   * Cancel an outgoing friend request
   */
  async cancelFriendRequest(currentUserId: string, requestId: string): Promise<{ message: string }> {
    const request = await this.friendshipRepo.findOne({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.senderId !== currentUserId) {
      throw new BadRequestException('You are not authorized to cancel this request');
    }

    await this.friendshipRepo.remove(request);
    return { message: 'Friend request cancelled' };
  }

  /**
   * Remove / Unfriend
   */
  async removeFriend(currentUserId: string, friendId: string): Promise<{ message: string }> {
    const friendship = await this.friendshipRepo.findOne({
      where: [
        { senderId: currentUserId, receiverId: friendId, status: 'accepted' },
        { senderId: friendId, receiverId: currentUserId, status: 'accepted' },
      ],
    });

    if (!friendship) {
      throw new NotFoundException('Friendship not found');
    }

    await this.friendshipRepo.remove(friendship);
    return { message: 'Friend removed successfully' };
  }

  /**
   * Get all accepted friends for a user
   */
  async getFriends(currentUserId: string): Promise<User[]> {
    const friendships = await this.friendshipRepo.find({
      where: [
        { senderId: currentUserId, status: 'accepted' },
        { receiverId: currentUserId, status: 'accepted' },
      ],
      relations: ['sender', 'receiver'],
      order: { updatedAt: 'DESC' },
    });

    const friends: User[] = [];
    for (const f of friendships) {
      if (f.senderId === currentUserId && f.receiver) {
        friends.push(f.receiver);
      } else if (f.receiverId === currentUserId && f.sender) {
        friends.push(f.sender);
      }
    }

    return friends;
  }

  /**
   * Get incoming pending requests
   */
  async getIncomingRequests(currentUserId: string): Promise<Friendship[]> {
    return this.friendshipRepo.find({
      where: { receiverId: currentUserId, status: 'pending' },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get outgoing pending requests
   */
  async getOutgoingRequests(currentUserId: string): Promise<Friendship[]> {
    return this.friendshipRepo.find({
      where: { senderId: currentUserId, status: 'pending' },
      relations: ['receiver'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Search users and annotate their friendship status with the current user
   */
  async searchUsersWithStatus(currentUserId: string, query: string) {
    const matchedUsers = await this.usersService.searchUsers(query, currentUserId);
    if (matchedUsers.length === 0) return [];

    const userIds = matchedUsers.map((u) => u.id);

    const existingFriendships = await this.friendshipRepo
      .createQueryBuilder('f')
      .where(
        '((f.senderId = :currentUserId AND f.receiverId IN (:...userIds)) OR (f.receiverId = :currentUserId AND f.senderId IN (:...userIds)))',
        { currentUserId, userIds },
      )
      .getMany();

    const friendshipMap = new Map<string, Friendship>();
    for (const f of existingFriendships) {
      const otherId = f.senderId === currentUserId ? f.receiverId : f.senderId;
      friendshipMap.set(otherId, f);
    }

    return matchedUsers.map((u) => {
      const f = friendshipMap.get(u.id);
      let relationship: 'none' | 'friends' | 'pending_sent' | 'pending_received' = 'none';
      let requestId: string | null = null;

      if (f) {
        requestId = f.id;
        if (f.status === 'accepted') {
          relationship = 'friends';
        } else if (f.status === 'pending') {
          relationship = f.senderId === currentUserId ? 'pending_sent' : 'pending_received';
        }
      }

      return {
        user: {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatar: u.avatar,
          statusMessage: u.statusMessage,
        },
        relationship,
        requestId,
      };
    });
  }

  private async notifyFriendRequest(friendship: Friendship) {
    try {
      const sender = await this.usersService.findById(friendship.senderId);
      this.signalingGateway?.emitToUser(friendship.receiverId, 'friend-request-received', {
        requestId: friendship.id,
        sender,
        createdAt: friendship.createdAt,
      });
    } catch (e) {
      this.logger.warn('Could not emit friend-request-received', e);
    }
  }

  private async notifyFriendshipAccepted(friendship: Friendship) {
    try {
      const [sender, receiver] = await Promise.all([
        this.usersService.findById(friendship.senderId),
        this.usersService.findById(friendship.receiverId),
      ]);
      this.signalingGateway?.emitToUser(friendship.senderId, 'friend-request-accepted', {
        friendshipId: friendship.id,
        friend: receiver,
      });
      this.signalingGateway?.emitToUser(friendship.receiverId, 'friend-request-accepted', {
        friendshipId: friendship.id,
        friend: sender,
      });
    } catch (e) {
      this.logger.warn('Could not emit friend-request-accepted', e);
    }
  }
}
