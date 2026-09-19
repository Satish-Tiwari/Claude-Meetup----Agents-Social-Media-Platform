import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Call, CallType, CallStatus } from '../entities/call.entity';

@Injectable()
export class CallsService {
  constructor(
    @InjectRepository(Call)
    private readonly callRepository: Repository<Call>,
  ) {}

  async createCallRecord(data: {
    callerId: string;
    calleeId: string;
    callType: CallType;
    status: CallStatus;
    duration?: number;
    isGroup?: boolean;
    groupTitle?: string;
    participantCount?: number;
    startedAt?: Date;
    endedAt?: Date;
  }): Promise<Call> {
    const call = this.callRepository.create({
      callerId: data.callerId,
      calleeId: data.calleeId,
      callType: data.callType,
      status: data.status,
      duration: data.duration || 0,
      isGroup: data.isGroup || false,
      groupTitle: data.groupTitle || undefined,
      participantCount: data.participantCount || 2,
      startedAt: data.startedAt || new Date(),
      endedAt: data.endedAt || new Date(),
    });
    return this.callRepository.save(call);
  }

  async getUserCalls(userId: string): Promise<Call[]> {
    return this.callRepository.find({
      where: [{ callerId: userId }, { calleeId: userId }],
      relations: ['caller', 'callee'],
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async deleteCallRecord(callId: string, userId: string): Promise<boolean> {
    const call = await this.callRepository.findOne({ where: { id: callId } });
    if (!call) return false;
    if (call.callerId === userId || call.calleeId === userId) {
      await this.callRepository.delete(callId);
      return true;
    }
    return false;
  }

  async clearCallHistory(userId: string): Promise<void> {
    await this.callRepository
      .createQueryBuilder()
      .delete()
      .from(Call)
      .where('callerId = :userId OR calleeId = :userId', { userId })
      .execute();
  }
}
