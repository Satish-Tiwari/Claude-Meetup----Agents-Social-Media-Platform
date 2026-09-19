import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import {
  RegisterDto,
  VerifyOtpDto,
  ResendOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Helper to generate a secure random 6-digit numeric OTP code
   */
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /** OTP e-mail verification is opt-in (AUTH_REQUIRE_EMAIL_OTP=true); by default accounts are live immediately. */
  private get otpRequired(): boolean {
    return process.env.AUTH_REQUIRE_EMAIL_OTP === 'true';
  }

  private publicUser(user: { id: string; username: string; email?: string | null; displayName: string; avatar: string; statusMessage: string; isEmailVerified: boolean; theme?: string }) {
    return {
      id: user.id,
      username: user.username,
      email: user.email ?? null,
      displayName: user.displayName,
      avatar: user.avatar,
      statusMessage: user.statusMessage,
      isEmailVerified: user.isEmailVerified,
      theme: user.theme || 'dark',
    };
  }

  private signFor(user: { id: string; username: string }) {
    return this.jwtService.sign({ sub: user.id, username: user.username });
  }

  /**
   * 1. Register Account.
   * Default: the account is created verified and the response already carries
   * an access token, so the client is signed in with no e-mail round trip.
   * Legacy OTP mode (AUTH_REQUIRE_EMAIL_OTP=true) keeps the old behaviour.
   */
  async register(registerDto: RegisterDto) {
    const username = registerDto.username.toLowerCase().trim();
    const email = registerDto.email?.toLowerCase().trim() || null;

    const existingByUsername = await this.usersService.findByUsername(username);
    if (existingByUsername && (existingByUsername.isEmailVerified || !this.otpRequired)) {
      throw new ConflictException('Username is already taken');
    }

    const existingByEmail = email ? await this.usersService.findByEmail(email) : null;
    if (existingByEmail && (existingByEmail.isEmailVerified || !this.otpRequired)) {
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const defaultAvatars = [
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    ];
    const randomAvatar = defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)];

    if (!this.otpRequired) {
      const user = await this.usersService.create({
        username,
        email,
        displayName: registerDto.displayName,
        password: hashedPassword,
        avatar: registerDto.avatar || randomAvatar,
        statusMessage: registerDto.statusMessage || 'Available for calls 💬',
        isEmailVerified: true,
      });
      return {
        message: 'Account created. You are signed in.',
        requiresOtp: false,
        accessToken: this.signFor(user),
        user: this.publicUser(user),
      };
    }

    // --- legacy OTP flow ---------------------------------------------------
    if (!email) {
      throw new BadRequestException('Email is required because AUTH_REQUIRE_EMAIL_OTP is enabled');
    }
    const otp = this.generateOtp();
    let user = existingByEmail || existingByUsername;
    if (user && !user.isEmailVerified) {
      user.username = username;
      user.email = email;
      user.displayName = registerDto.displayName;
      user.password = hashedPassword;
      user.avatar = registerDto.avatar || user.avatar || randomAvatar;
      user.statusMessage = registerDto.statusMessage || user.statusMessage || 'Available for calls 💬';
      await this.usersService.create(user);
    } else {
      user = await this.usersService.create({
        username,
        email,
        displayName: registerDto.displayName,
        password: hashedPassword,
        avatar: registerDto.avatar || randomAvatar,
        statusMessage: registerDto.statusMessage || 'Available for calls 💬',
        isEmailVerified: false,
      });
    }

    await this.usersService.saveOtp(user.id, otp, 'verification');
    await this.emailService.sendVerificationOtp(user.email, otp, user.displayName);

    return {
      message: 'Account created. Please verify the 6-digit OTP code sent to your email.',
      email: user.email,
      requiresOtp: true,
    };
  }

  /**
   * 2. Verify Registration OTP and automatically log in
   */
  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const user = await this.usersService.verifyOtp(
      verifyOtpDto.email.toLowerCase(),
      verifyOtpDto.otp,
      'verification',
    );

    const payload = { sub: user.id, username: user.username };
    const token = this.jwtService.sign(payload);

    return {
      message: 'Email verified successfully! Welcome to Agent Social Media Platform.',
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        statusMessage: user.statusMessage,
        isEmailVerified: user.isEmailVerified,
        theme: user.theme || 'dark',
      },
    };
  }

  /**
   * 3. Resend OTP
   */
  async resendOtp(resendDto: ResendOtpDto) {
    const user = await this.usersService.findByEmail(resendDto.email.toLowerCase());
    if (!user) {
      throw new NotFoundException('No account found with this email');
    }

    const purpose = resendDto.purpose === 'password_reset' ? 'password_reset' : 'verification';
    const otp = this.generateOtp();

    await this.usersService.saveOtp(user.id, otp, purpose);

    if (purpose === 'password_reset') {
      await this.emailService.sendPasswordResetOtp(user.email, otp, user.displayName);
    } else {
      await this.emailService.sendVerificationOtp(user.email, otp, user.displayName);
    }

    return {
      message: 'A new 6-digit verification code has been sent to your email.',
      email: user.email,
    };
  }

  /**
   * 4. Forgot Password - Request Reset Code
   */
  async forgotPassword(forgotDto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(forgotDto.email.toLowerCase());
    if (!user) {
      throw new NotFoundException('No registered user found with this email address');
    }

    const otp = this.generateOtp();
    await this.usersService.saveOtp(user.id, otp, 'password_reset');
    await this.emailService.sendPasswordResetOtp(user.email, otp, user.displayName);

    return {
      message: 'Password reset code has been sent to your email.',
      email: user.email,
    };
  }

  /**
   * 5. Reset Password with OTP
   */
  async resetPassword(resetDto: ResetPasswordDto) {
    const user = await this.usersService.verifyOtp(
      resetDto.email.toLowerCase(),
      resetDto.otp,
      'password_reset',
    );

    const hashed = await bcrypt.hash(resetDto.newPassword, 10);
    await this.usersService.updatePassword(user.id, hashed);

    return {
      message: 'Password reset successful! You can now log in with your new password.',
    };
  }

  /**
   * 6. Login
   */
  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByUsernameOrEmail(loginDto.username.toLowerCase(), true);
    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const isMatch = await bcrypt.compare(loginDto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid username or password');
    }

    // Only in OTP mode can an unverified account be blocked from logging in.
    if (this.otpRequired && user.email && !user.isEmailVerified) {
      const otp = this.generateOtp();
      await this.usersService.saveOtp(user.id, otp, 'verification');
      await this.emailService.sendVerificationOtp(user.email, otp, user.displayName);

      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Your email has not been verified yet. A new OTP has been sent to your email.',
        requiresOtp: true,
        email: user.email,
      });
    }

    const payload = { sub: user.id, username: user.username };
    const token = this.jwtService.sign(payload);

    return {
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        statusMessage: user.statusMessage,
        isEmailVerified: user.isEmailVerified,
        theme: user.theme || 'dark',
      },
    };
  }

  async validateToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      return await this.usersService.findById(payload.sub);
    } catch {
      return null;
    }
  }
}
