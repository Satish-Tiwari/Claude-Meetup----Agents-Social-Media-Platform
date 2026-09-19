import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Post('request')
  async sendRequest(
    @Request() req,
    @Body() body: { targetUserId?: string; targetUsername?: string },
  ) {
    return this.friendsService.sendFriendRequest(req.user.id, body.targetUserId, body.targetUsername);
  }

  @Get()
  async getFriends(@Request() req) {
    return this.friendsService.getFriends(req.user.id);
  }

  @Get('requests/incoming')
  async getIncomingRequests(@Request() req) {
    return this.friendsService.getIncomingRequests(req.user.id);
  }

  @Get('requests/outgoing')
  async getOutgoingRequests(@Request() req) {
    return this.friendsService.getOutgoingRequests(req.user.id);
  }

  @Patch('requests/:id/accept')
  async acceptRequest(@Request() req, @Param('id') id: string) {
    return this.friendsService.acceptFriendRequest(req.user.id, id);
  }

  @Patch('requests/:id/reject')
  async rejectRequest(@Request() req, @Param('id') id: string) {
    return this.friendsService.rejectFriendRequest(req.user.id, id);
  }

  @Delete('requests/:id/cancel')
  async cancelRequest(@Request() req, @Param('id') id: string) {
    return this.friendsService.cancelFriendRequest(req.user.id, id);
  }

  @Delete(':friendId')
  async removeFriend(@Request() req, @Param('friendId') friendId: string) {
    return this.friendsService.removeFriend(req.user.id, friendId);
  }

  @Get('search')
  async searchUsers(@Request() req, @Query('q') query: string) {
    return this.friendsService.searchUsersWithStatus(req.user.id, query || '');
  }
}
