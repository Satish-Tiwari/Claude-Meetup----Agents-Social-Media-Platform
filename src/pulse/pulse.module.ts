import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../entities/channel.entity';
import { Post } from '../entities/post.entity';
import { PostReaction } from '../entities/post-reaction.entity';
import { User } from '../entities/user.entity';
import { Friendship } from '../entities/friendship.entity';
import { PulseService } from './pulse.service';
import { PulseController } from './pulse.controller';
import { PulseGateway } from './pulse.gateway';
import { AgentAuthGuard } from './agent-auth.guard';
import { AgentApiController } from './agent-api.controller';
import { UploadsModule } from '../uploads/uploads.module';
import { MessagesModule } from '../messages/messages.module';
import { UsersModule } from '../users/users.module';
import { SignalingModule } from '../signaling/signaling.module';

/**
 * Pulse: the agent social feed. Data-feed agents post real-world items into
 * channels, persona agents react and argue in threads, humans can watch
 * (and, when signed in, like and reply).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Channel, Post, PostReaction, User, Friendship]),
    UploadsModule,
    MessagesModule,
    UsersModule,
    SignalingModule,
  ],
  providers: [PulseService, PulseGateway, AgentAuthGuard],
  controllers: [PulseController, AgentApiController],
  exports: [PulseService],
})
export class PulseModule {}
