import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  forwardRef,
  Inject,
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
import { RosterService } from '../clubs/roster/roster.service';
import { Role } from '@prisma/client';

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private email: EmailService,
    @Inject(forwardRef(() => RosterService)) private rosterService: RosterService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const hash = await bcrypt.hash(dto.password, 12);
    const isDev = this.config.get<string>('NODE_ENV', 'production') === 'development';

    const verificationToken = isDev ? null : crypto.randomBytes(32).toString('hex');
    const verificationExpiry = isDev ? null : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const displayName = (dto.displayName?.trim())
      || `${dto.firstName.trim()} ${dto.lastName.trim()}`.trim();

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: hash,
        phone: dto.phone,
        role: Role.PLAYER,
        status: isDev ? 'ACTIVE' : 'PENDING_VERIFICATION',
        emailVerifiedAt: isDev ? new Date() : null,
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: verificationExpiry,
      },
    });

    const profile = await this.prisma.playerProfile.create({
      data: {
        userId: user.id,
        displayName,
        firstName: dto.firstName.trim(),
        lastName:  dto.lastName.trim(),
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        homeClubId:    dto.homeClubId ?? null,
      },
    });
    await this.prisma.playerStats.create({ data: { playerId: profile.id } });

    // Stage 15: if name+DOB present, find any unlinked roster entries across
    // the platform that match the brand-new player. RUT is intentionally NOT
    // used. Auto-link candidates whose match is unique per (profile, club);
    // ambiguous matches (multiple clubs with the same name+DOB) are left as
    // candidates for the player to resolve via the new club-matches endpoint.
    if (dto.dateOfBirth) {
      const matches = await this.rosterService
        .findIdentityMatches(profile.id)
        .catch(() => []);
      const byClub = new Map<string, typeof matches>();
      for (const m of matches) {
        if (!byClub.has(m.clubId)) byClub.set(m.clubId, []);
        byClub.get(m.clubId)!.push(m);
      }
      for (const [, list] of byClub) {
        if (list.length === 1) {
          await this.rosterService
            .linkProfileToRoster(list[0].rosterId, profile.id)
            .catch(() => {});
        }
      }
    }

    if (!isDev) {
      await this.email.sendVerificationEmail(user.email, verificationToken!);
    }

    return {
      message: isDev
        ? 'Registration successful. You can log in immediately.'
        : 'Registration successful. Please check your email to verify your account.',
    };
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

    // 2FA: if enabled, send OTP and return a reference token instead of JWT
    if (user.twoFactorEnabled) {
      return this.initiate2FA(user.id, user.email);
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    const { passwordHash, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, ...tokens };
  }

  // ─── 2FA ─────────────────────────────────────────────────────────────────────

  async enable2FA(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.twoFactorEnabled) throw new BadRequestException('2FA is already enabled');

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
    return { message: '2FA enabled. An OTP will be required on each login.' };
  }

  async disable2FA(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.twoFactorEnabled) throw new BadRequestException('2FA is not enabled');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Incorrect password');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorCode: null,
        twoFactorExpiry: null,
        twoFactorLoginToken: null,
      },
    });
    return { message: '2FA disabled.' };
  }

  async verify2FA(loginToken: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { twoFactorLoginToken: loginToken },
    });

    if (!user) throw new UnauthorizedException('Invalid or expired 2FA session. Please log in again.');
    if (!user.twoFactorExpiry || user.twoFactorExpiry < new Date()) {
      throw new UnauthorizedException('OTP has expired. Please log in again.');
    }
    if (user.twoFactorCode !== code) {
      throw new UnauthorizedException('Incorrect code.');
    }

    // Clear OTP fields
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorCode: null,
        twoFactorExpiry: null,
        twoFactorLoginToken: null,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    const { passwordHash, ...safe } = user;
    return { user: safe, ...tokens };
  }

  private async initiate2FA(userId: string, userEmail: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const loginToken = crypto.randomBytes(32).toString('hex');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorCode: code,
        twoFactorExpiry: expiry,
        twoFactorLoginToken: loginToken,
      },
    });

    await this.email.send2FACode(userEmail, code);

    return {
      twoFactorRequired: true,
      loginToken,
      message: `A 6-digit code was sent to ${userEmail}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    };
  }

  // ─── PASSWORD RESET ───────────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || user.status !== 'ACTIVE') {
      return { message: 'If that email exists, a password reset link was sent.' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);

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

    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    return { message: 'Password reset successfully. Please log in with your new password.' };
  }

  // ─── SESSION ─────────────────────────────────────────────────────────────────

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
      include: { playerProfile: { include: { stats: true, homeClub: { select: { id: true, name: true } } } } },
    });
    if (!user) throw new UnauthorizedException();
    const { passwordHash, twoFactorCode, ...safe } = user;
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
