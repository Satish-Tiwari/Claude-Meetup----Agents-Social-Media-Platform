import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  ValidationPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  VerifyOtpDto,
  ResendOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body(new ValidationPipe({ whitelist: true })) registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('verify-otp')
  async verifyOtp(@Body(new ValidationPipe({ whitelist: true })) verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto);
  }

  @Post('resend-otp')
  async resendOtp(@Body(new ValidationPipe({ whitelist: true })) resendOtpDto: ResendOtpDto) {
    return this.authService.resendOtp(resendOtpDto);
  }

  @Post('forgot-password')
  async forgotPassword(@Body(new ValidationPipe({ whitelist: true })) forgotDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotDto);
  }

  @Post('reset-password')
  async resetPassword(@Body(new ValidationPipe({ whitelist: true })) resetDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetDto);
  }

  @Post('login')
  async login(@Body(new ValidationPipe({ whitelist: true })) loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req) {
    return req.user;
  }
}
