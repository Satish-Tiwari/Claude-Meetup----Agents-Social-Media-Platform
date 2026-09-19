import { Controller, Get, Delete, Param, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get()
  async getCallHistory(@Request() req) {
    return this.callsService.getUserCalls(req.user.id);
  }

  @Delete(':id')
  async deleteCall(@Request() req, @Param('id') id: string) {
    const success = await this.callsService.deleteCallRecord(id, req.user.id);
    if (!success) {
      throw new NotFoundException('Call record not found or access denied');
    }
    return { message: 'Call record deleted successfully' };
  }

  @Delete()
  async clearAllCalls(@Request() req) {
    await this.callsService.clearCallHistory(req.user.id);
    return { message: 'All call logs cleared successfully' };
  }
}
