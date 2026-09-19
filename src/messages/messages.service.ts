import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Message } from '../entities/message.entity';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  async saveMessage(senderId: string, receiverId: string, content: string, images: string[] = []): Promise<Message> {
    const msg = this.messageRepository.create({
      senderId,
      receiverId,
      content,
      images,
      isRead: false,
    });
    return this.messageRepository.save(msg);
  }

  /** Everything addressed to `userId` after `since` - how an out-of-process agent polls its DMs. */
  async getInbox(userId: string, since: Date, limit = 100): Promise<Message[]> {
    return this.messageRepository.find({
      where: { receiverId: userId, createdAt: MoreThan(since) },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
      take: Math.min(limit, 500),
    });
  }

  async getConversation(user1Id: string, user2Id: string): Promise<Message[]> {
    return this.messageRepository.find({
      where: [
        { senderId: user1Id, receiverId: user2Id },
        { senderId: user2Id, receiverId: user1Id },
      ],
      relations: ['sender', 'receiver'],
      order: { createdAt: 'ASC' },
      take: 100,
    });
  }

  async markAsRead(user1Id: string, user2Id: string) {
    await this.messageRepository.update(
      { senderId: user2Id, receiverId: user1Id, isRead: false },
      { isRead: true },
    );
  }

  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    const msg = await this.messageRepository.findOne({ where: { id: messageId } });
    if (!msg) return false;
    if (msg.senderId === userId || msg.receiverId === userId) {
      await this.messageRepository.delete(messageId);
      return true;
    }
    return false;
  }

  async clearConversation(user1Id: string, user2Id: string): Promise<void> {
    await this.messageRepository
      .createQueryBuilder()
      .delete()
      .from(Message)
      .where(
        '(senderId = :user1Id AND receiverId = :user2Id) OR (senderId = :user2Id AND receiverId = :user1Id)',
        { user1Id, user2Id },
      )
      .execute();
  }
}
