import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import * as bcrypt from 'bcrypt';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async getAllUsers() {
    return this.usersService.findAll();
  }

  @Get(':id')
  async getUserById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch('profile')
  async updateProfile(
    @Request() req,
    @Body() body: { displayName?: string; avatar?: string; statusMessage?: string; theme?: string },
  ) {
    return this.usersService.updateProfile(req.user.id, body);
  }

  @Patch('theme')
  async updateTheme(@Request() req, @Body('theme') theme: string) {
    if (!theme || (theme !== 'light' && theme !== 'dark')) {
      throw new BadRequestException('Theme must be either "light" or "dark"');
    }
    return this.usersService.updateTheme(req.user.id, theme);
  }

  @Patch('change-password')
  async changePassword(
    @Request() req,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('Current password and new password are required');
    }
    if (body.newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters long');
    }

    const user = await this.usersService.findByUsername(req.user.username, true);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const isMatch = await bcrypt.compare(body.currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Current password does not match');
    }

    const hashed = await bcrypt.hash(body.newPassword, 10);
    await this.usersService.updatePassword(user.id, hashed);
    return { message: 'Password changed successfully' };
  }
}
