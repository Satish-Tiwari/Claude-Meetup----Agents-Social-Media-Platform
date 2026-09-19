import { Injectable, OnModuleInit, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Not } from 'typeorm';
import { User } from '../entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    await this.seedInitialUsers();
  }

  async seedInitialUsers() {
    const count = await this.userRepository.count();
    const hashedPassword = await bcrypt.hash('password123', 10);

    const demoUsers = [
      {
        username: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice Johnson',
        password: hashedPassword,
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        statusMessage: 'Available for video calls 📹',
        isEmailVerified: true,
      },
      {
        username: 'bob',
        email: 'bob@example.com',
        displayName: 'Bob Smith',
        password: hashedPassword,
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        statusMessage: 'At work, audio calls preferred 🎧',
        isEmailVerified: true,
      },
      {
        username: 'charlie',
        email: 'charlie@example.com',
        displayName: 'Charlie Brown',
        password: hashedPassword,
        avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
        statusMessage: 'Living the dream ✨',
        isEmailVerified: true,
      },
    ];

    if (count === 0) {
      this.logger.log('Seeding initial demo users for Agent Social Media Platform...');
      for (const u of demoUsers) {
        await this.userRepository.save(this.userRepository.create(u));
      }
      this.logger.log('Demo users seeded: alice, bob, charlie (password: password123)');
    } else {
      // Ensure existing demo users have their emails and verification status set
      for (const u of demoUsers) {
        const existing = await this.userRepository.findOne({ where: { username: u.username } });
        if (existing && (!existing.email || !existing.isEmailVerified)) {
          existing.email = u.email;
          existing.isEmailVerified = true;
          await this.userRepository.save(existing);
        }
      }
    }
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      order: { displayName: 'ASC' },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findByUsername(username: string, includePassword = false): Promise<User | null> {
    if (includePassword) {
      return this.userRepository
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('LOWER(user.username) = LOWER(:username)', { username })
        .getOne();
    }
    return this.userRepository.findOne({ where: { username: username.toLowerCase() } });
  }

  async findByEmail(email: string, includeSecrets = false): Promise<User | null> {
    const query = this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email });

    if (includeSecrets) {
      query
        .addSelect('user.password')
        .addSelect('user.otpCode')
        .addSelect('user.otpExpiresAt')
        .addSelect('user.otpPurpose');
    }

    return query.getOne();
  }

  async findByUsernameOrEmail(identifier: string, includePassword = false): Promise<User | null> {
    const query = this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:id) OR LOWER(user.email) = LOWER(:id)', { id: identifier });

    if (includePassword) {
      query.addSelect('user.password');
    }

    return query.getOne();
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  async saveOtp(userId: string, otpCode: string, otpPurpose: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    await this.userRepository.update(userId, {
      otpCode,
      otpExpiresAt: expiresAt,
      otpPurpose,
    });
  }

  async verifyOtp(email: string, otp: string, expectedPurpose: string): Promise<User> {
    const user = await this.findByEmail(email, true);
    if (!user) {
      throw new BadRequestException('User with this email does not exist');
    }

    if (!user.otpCode || !user.otpExpiresAt) {
      throw new BadRequestException('No active OTP found. Please request a new code.');
    }

    if (user.otpPurpose !== expectedPurpose) {
      throw new BadRequestException('Invalid OTP purpose');
    }

    if (new Date() > new Date(user.otpExpiresAt)) {
      throw new BadRequestException('OTP code has expired. Please request a new one.');
    }

    if (user.otpCode.trim() !== otp.trim()) {
      throw new BadRequestException('Incorrect OTP code');
    }

    // Clear OTP fields upon successful verification
    await this.userRepository.update(user.id, {
      otpCode: null as any,
      otpExpiresAt: null as any,
      otpPurpose: null as any,
      isEmailVerified: true,
    });

    return this.findById(user.id) as Promise<User>;
  }

  async updatePassword(userId: string, newHashedPassword: string): Promise<void> {
    await this.userRepository.update(userId, {
      password: newHashedPassword,
      otpCode: null as any,
      otpExpiresAt: null as any,
      otpPurpose: null as any,
    });
  }

  async updateProfile(
    id: string,
    updateData: { displayName?: string; avatar?: string; statusMessage?: string; theme?: string },
  ): Promise<User> {
    await this.userRepository.update(id, updateData);
    return (await this.findById(id))!;
  }

  async updateTheme(id: string, theme: string): Promise<User> {
    const validTheme = theme === 'light' ? 'light' : 'dark';
    await this.userRepository.update(id, { theme: validTheme });
    return (await this.findById(id))!;
  }

  async searchUsers(query: string, currentUserId: string): Promise<User[]> {
    if (!query || query.trim().length === 0) return [];
    const trimmed = query.trim().toLowerCase();

    return this.userRepository
      .createQueryBuilder('user')
      .where('user.id != :currentUserId', { currentUserId })
      .andWhere(
        '(LOWER(user.username) LIKE :term OR LOWER(user.displayName) LIKE :term OR LOWER(user.email) LIKE :term)',
        { term: `%${trimmed}%` },
      )
      .limit(20)
      .getMany();
  }
}
