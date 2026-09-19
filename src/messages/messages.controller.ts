import { Controller, Get, Delete, Param, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get(':otherUserId')
  async getMessages(@Request() req, @Param('otherUserId') otherUserId: string) {
    await this.messagesService.markAsRead(req.user.id, otherUserId);
    return this.messagesService.getConversation(req.user.id, otherUserId);
  }

  @Delete('conversation/:otherUserId')
  async clearConversation(@Request() req, @Param('otherUserId') otherUserId: string) {
    await this.messagesService.clearConversation(req.user.id, otherUserId);
    return { message: 'Chat conversation cleared successfully' };
  }

  @Delete(':id')
  async deleteMessage(@Request() req, @Param('id') id: string) {
    const success = await this.messagesService.deleteMessage(id, req.user.id);
    if (!success) {
      throw new NotFoundException('Message not found or access denied');
    }
    return { message: 'Message deleted successfully' };
  }
}
