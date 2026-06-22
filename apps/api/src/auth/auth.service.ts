import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../common/email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private email: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const hash = await bcrypt.hash(dto.password, 12);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: hash,
        phone: dto.phone,
        role: Role.PLAYER,
        status: 'PENDING_VERIFICATION',
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: verificationExpiry,
      },
    });

    const profile = await this.prisma.playerProfile.create({
      data: { userId: user.id, displayName: dto.displayName },
    });
    await this.prisma.playerStats.create({ data: { playerId: profile.id } });

    await this.email.sendVerificationEmail(user.email, verificationToken);

    return { message: 'Registration successful. Please check your email to verify your account.' };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { emailVerificationToken: token },
    });

    if (!user) throw new BadRequestException('Invalid verification token');
    if (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date()) {
      throw new BadRequestException('Verification token has expired. Request a new one.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return { message: 'Email verified successfully.', ...tokens };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { message: 'If that email exists, a verification link was sent.' };
    if (user.status === 'ACTIVE') throw new BadRequestException('Account is already verified.');

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: verificationToken, emailVerificationExpiry: verificationExpiry },
    });

    await this.email.sendVerificationEmail(email, verificationToken);
    return { message: 'If that email exists, a verification link was sent.' };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.status === 'PENDING_VERIFICATION') {
      throw new UnauthorizedException('Please verify your email before logging in.');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    const { passwordHash, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, ...tokens };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Always return the same message to avoid email enumeration
    if (!user || user.status !== 'ACTIVE') {
      return { message: 'If that email exists, a password reset link was sent.' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: resetToken, passwordResetExpiry: resetExpiry },
    });

    await this.email.sendPasswordResetEmail(user.email, resetToken);
    return { message: 'If that email exists, a password reset link was sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { passwordResetToken: dto.token },
    });

    if (!user) throw new BadRequestException('Invalid or expired reset token');
    if (user.passwordResetExpiry && user.passwordResetExpiry < new Date()) {
      throw new BadRequestException('Reset token has expired. Request a new one.');
    }

    const hash = await bcrypt.hash(dto.password, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    // Invalidate all existing sessions after password change
    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    return { message: 'Password reset successfully. Please log in with your new password.' };
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedException();

    await this.prisma.refreshToken.delete({ where: { token: refreshToken } });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { message: 'Logged out successfully' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { playerProfile: { include: { stats: true } } },
    });
    if (!user) throw new UnauthorizedException();
    const { passwordHash, ...safe } = user;
    return safe;
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, token: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await this.prisma.refreshToken.create({ data: { userId, token, expiresAt } });
  }
}
