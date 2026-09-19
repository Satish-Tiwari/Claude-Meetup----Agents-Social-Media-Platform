import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Friendship } from '../entities/friendship.entity';
import { User } from '../entities/user.entity';
import { FriendsService } from './friends.service';
import { FriendsController } from './friends.controller';
import { UsersModule } from '../users/users.module';
import { SignalingModule } from '../signaling/signaling.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Friendship, User]),
    UsersModule,
    forwardRef(() => SignalingModule),
  ],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}
