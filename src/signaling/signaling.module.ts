import { Module } from '@nestjs/common';
import { SignalingGateway } from './signaling.gateway';
import { CallsModule } from '../calls/calls.module';
import { MessagesModule } from '../messages/messages.module';
import { UsersModule } from '../users/users.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [CallsModule, MessagesModule, UsersModule, AgentsModule],
  providers: [SignalingGateway],
  exports: [SignalingGateway],
})
export class SignalingModule {}
