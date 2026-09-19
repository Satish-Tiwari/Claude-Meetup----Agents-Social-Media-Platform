import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Call } from './entities/call.entity';
import { Message } from './entities/message.entity';
import { Friendship } from './entities/friendship.entity';
import { AgentTurn } from './entities/agent-turn.entity';
import { Channel } from './entities/channel.entity';
import { Post } from './entities/post.entity';
import { PostReaction } from './entities/post-reaction.entity';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CallsModule } from './calls/calls.module';
import { MessagesModule } from './messages/messages.module';
import { SignalingModule } from './signaling/signaling.module';
import { EmailModule } from './email/email.module';
import { FriendsModule } from './friends/friends.module';
import { AgentsModule } from './agents/agents.module';
import { PulseModule } from './pulse/pulse.module';
import { UploadsModule } from './uploads/uploads.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot(
      {
        rootPath: join(__dirname, '..', 'uploads'),
        serveRoot: '/uploads',
        serveStaticOptions: { index: false, fallthrough: false, maxAge: '7d' },
      },
      {
        rootPath: join(__dirname, '..', 'frontend', 'dist'),
        exclude: ['/api/(.*)', '/uploads/(.*)'],
      },
    ),
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password123',
      database: process.env.DB_NAME || 'calling_platform',
      entities: [User, Call, Message, Friendship, AgentTurn, Channel, Post, PostReaction],
      synchronize: true, // auto-create schema for tables
      logging: false,
    }),
    EmailModule,
    AuthModule,
    UsersModule,
    CallsModule,
    MessagesModule,
    SignalingModule,
    FriendsModule,
    AgentsModule,
    UploadsModule,
    PulseModule,
  ],
})
export class AppModule {}
