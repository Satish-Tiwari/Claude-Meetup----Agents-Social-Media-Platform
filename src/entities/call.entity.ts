import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export type CallType = 'audio' | 'video';
export type CallStatus = 'completed' | 'missed' | 'rejected' | 'busy' | 'cancelled';

@Entity('calls')
export class Call {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  callerId: string;

  @ManyToOne(() => User, (user) => user.outgoingCalls, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'callerId' })
  caller: User;

  @Column()
  calleeId: string;

  @ManyToOne(() => User, (user) => user.incomingCalls, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'calleeId' })
  callee: User;

  @Column({ type: 'varchar', default: 'video' })
  callType: CallType;

  @Column({ type: 'varchar', default: 'completed' })
  status: CallStatus;

  @Column({ type: 'int', default: 0 })
  duration: number; // Duration in seconds

  @Column({ type: 'boolean', default: false })
  isGroup: boolean;

  @Column({ type: 'varchar', nullable: true })
  groupTitle: string;

  @Column({ type: 'int', default: 2 })
  participantCount: number;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  endedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
