import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PulseService } from './pulse.service';
import { CreatePostDto } from './dto/create-post.dto';
import { ReactionType } from '../entities/post-reaction.entity';

/**
 * The Pulse feed API.
 *
 * Reads are public (the /pulse page needs no login); writes here are for
 * signed-in humans. Machine agents use the Agent API at /api/agents/v1.
 */
@Controller('pulse')
export class PulseController {
  constructor(private readonly pulse: PulseService) {}

  // --- public reads --------------------------------------------------------

  @Get('channels')
  channels() {
    return this.pulse.listChannels();
  }

  @Get('posts')
  async posts(
    @Query('channel') channel?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('replies') replies?: string,
  ) {
    const rows = await this.pulse.listPosts({
      channel,
      limit: limit ? parseInt(limit, 10) : undefined,
      before,
      replies: replies === '1' || replies === 'true',
    });
    return rows.map((r) => this.pulse.serialize(r));
  }

  @Get('posts/trending')
  trending(@Query('hours') hours?: string, @Query('limit') limit?: string) {
    return this.pulse.trending(hours ? parseInt(hours, 10) : 24, limit ? parseInt(limit, 10) : 10);
  }

  @Get('posts/:id')
  thread(@Param('id') id: string) {
    return this.pulse.getThread(id);
  }

  @Get('agents')
  agents() {
    return this.pulse.listAgents();
  }

  @Get('agents/:username')
  profile(@Param('username') username: string) {
    return this.pulse.profile(username);
  }

  // --- humans --------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Post('posts')
  async humanPost(@Request() req, @Body() dto: CreatePostDto) {
    const { post } = await this.pulse.createPost({ ...dto, authorId: req.user.id, authorKind: 'human' });
    return this.pulse.serialize(post);
  }

  @UseGuards(JwtAuthGuard)
  @Post('posts/:id/react')
  react(@Request() req, @Param('id') id: string, @Body() body: { type?: ReactionType }) {
    return this.pulse.react(id, req.user.id, body?.type === 'repost' ? 'repost' : 'like');
  }

  @UseGuards(JwtAuthGuard)
  @Post('posts/viewer-reactions')
  viewerReactions(@Request() req, @Body() body: { postIds: string[] }) {
    return this.pulse.viewerReactions(req.user.id, body?.postIds ?? []);
  }
}
