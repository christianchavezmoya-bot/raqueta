import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../common/media/media.service';
import { EmailService } from '../common/email/email.service';
import { CreateClubDto, UpdateClubProfileDto, RegisterClubDto } from './dto/create-club.dto';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';
import { Role } from '@prisma/client';

const TRIAL_DAYS = 14;

@Injectable()
export class ClubsService {
  constructor(
    private prisma: PrismaService,
    private media: MediaService,
    private email: EmailService,
  ) {}

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [clubs, total] = await Promise.all([
      this.prisma.club.findMany({
        skip,
        take: limit,
        where: { status: { in: ['ACTIVE', 'TRIAL'] } },
        include: { profile: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.club.count({ where: { status: { in: ['ACTIVE', 'TRIAL'] } } }),
    ]);
    return { data: clubs, total, page, limit };
  }

  async findOne(id: string) {
    const club = await this.prisma.club.findUnique({
      where: { id },
      include: {
        profile: true,
        photos: { orderBy: { displayOrder: 'asc' } },
        openingHours: { orderBy: { dayOfWeek: 'asc' } },
        courts: { where: { active: true }, include: { pricing: true } },
        instructors: { where: { active: true } },
        membershipPlans: { where: { active: true } },
      },
    });
    if (!club) throw new NotFoundException('Club not found');
    return { ...club, trialStatus: this.computeTrialStatus(club) };
  }

  async findBySlug(slug: string) {
    const club = await this.prisma.club.findUnique({
      where: { slug },
      include: {
        profile: true,
        photos: { orderBy: { displayOrder: 'asc' } },
        openingHours: { orderBy: { dayOfWeek: 'asc' } },
        courts: { where: { active: true }, include: { pricing: true } },
        instructors: { where: { active: true } },
      },
    });
    if (!club) throw new NotFoundException('Club not found');
    return { ...club, trialStatus: this.computeTrialStatus(club) };
  }

  async create(dto: CreateClubDto, ownerUserId: string) {
    const slug = dto.slug || this.slugify(dto.name);
    const existing = await this.prisma.club.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Club slug already exists');

    return this.prisma.club.create({
      data: {
        name: dto.name,
        slug,
        ownerUserId,
        profile: { create: {} },
      },
      include: { profile: true },
    });
  }

  /**
   * Public self-service registration: creates a CLUB_ADMIN user + Club in a
   * single transaction, starts a 14-day trial (status=TRIAL), and sends email
   * verification via the existing flow.
   */
  async register(dto: RegisterClubDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) throw new ConflictException('Email already registered');

    const slug = this.slugify(dto.clubName);
    const existingSlug = await this.prisma.club.findUnique({ where: { slug } });
    if (existingSlug) {
      throw new ConflictException('A club with a similar name already exists. Try a different name.');
    }

    const hash = await bcrypt.hash(dto.password, 12);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const result = await this.prisma.$transaction(async tx => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash: hash,
          phone: dto.phone,
          role: Role.CLUB_ADMIN,
          status: 'PENDING_VERIFICATION',
          emailVerificationToken: verificationToken,
          emailVerificationExpiry: verificationExpiry,
        },
      });

      const club = await tx.club.create({
        data: {
          name: dto.clubName,
          slug,
          ownerUserId: user.id,
          status: 'TRIAL',
          trialEndsAt,
          profile: { create: { city: dto.city } },
        },
        include: { profile: true },
      });

      // Link staff to the new club so assertClubScope works immediately after verification
      await tx.user.update({
        where: { id: user.id },
        data: { staffClubId: club.id },
      });

      // Create player profile so the dashboard doesn't break
      await tx.playerProfile.create({
        data: { userId: user.id, displayName: dto.displayName },
      });

      return { user, club };
    });

    await this.email.sendVerificationEmail(result.user.email, verificationToken);

    return {
      message: 'Club registered! Please verify your email to activate your 14-day free trial.',
      clubId: result.club.id,
      trialEndsAt,
    };
  }

  /** SUPER_ADMIN only: extend or unlock a club trial */
  async extendTrial(clubId: string, extraDays?: number) {
    const club = await this.ensureExists(clubId);
    const base = club.trialEndsAt && club.trialEndsAt > new Date() ? club.trialEndsAt : new Date();
    const days = extraDays ?? TRIAL_DAYS;
    const trialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    return this.prisma.club.update({
      where: { id: clubId },
      data: { status: 'TRIAL', trialEndsAt },
      select: { id: true, name: true, status: true, trialEndsAt: true },
    });
  }

  /** SUPER_ADMIN only: promote club to full ACTIVE (manual upgrade) */
  async unlock(clubId: string) {
    await this.ensureExists(clubId);
    return this.prisma.club.update({
      where: { id: clubId },
      data: { status: 'ACTIVE', trialEndsAt: null },
      select: { id: true, name: true, status: true },
    });
  }

  async updateProfile(clubId: string, dto: UpdateClubProfileDto, actor: ActingUser) {
    await this.ensureExists(clubId);
    await assertClubScope(actor, clubId, this.prisma);
    return this.prisma.clubProfile.upsert({
      where: { clubId },
      update: dto,
      create: { clubId, ...dto },
    });
  }

  async uploadLogo(clubId: string, file: Express.Multer.File, actor: ActingUser) {
    await this.ensureExists(clubId);
    await assertClubScope(actor, clubId, this.prisma);
    const url = await this.media.uploadFixed(file, `clubs/${clubId}/logo`);
    return this.prisma.clubProfile.upsert({
      where: { clubId },
      update: { logoUrl: url },
      create: { clubId, logoUrl: url },
    });
  }

  async uploadBanner(clubId: string, file: Express.Multer.File, actor: ActingUser) {
    await this.ensureExists(clubId);
    await assertClubScope(actor, clubId, this.prisma);
    const url = await this.media.uploadFixed(file, `clubs/${clubId}/banner`);
    return this.prisma.clubProfile.upsert({
      where: { clubId },
      update: { bannerUrl: url },
      create: { clubId, bannerUrl: url },
    });
  }

  async uploadPhoto(clubId: string, file: Express.Multer.File, actor: ActingUser, caption?: string) {
    await this.ensureExists(clubId);
    await assertClubScope(actor, clubId, this.prisma);
    const { url } = await this.media.uploadUnique(file, `clubs/${clubId}/photos`);
    const count = await this.prisma.clubPhoto.count({ where: { clubId } });
    return this.prisma.clubPhoto.create({
      data: { clubId, photoUrl: url, caption, displayOrder: count },
    });
  }

  async addPhoto(clubId: string, photoUrl: string, caption?: string) {
    await this.ensureExists(clubId);
    const count = await this.prisma.clubPhoto.count({ where: { clubId } });
    return this.prisma.clubPhoto.create({
      data: { clubId, photoUrl, caption, displayOrder: count },
    });
  }

  async deletePhoto(photoId: string, actor: ActingUser) {
    const photo = await this.prisma.clubPhoto.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('Photo not found');
    await assertClubScope(actor, photo.clubId, this.prisma);
    const storagePath = this.media.extractPath(photo.photoUrl);
    if (storagePath) await this.media.deleteByPath(storagePath);
    return this.prisma.clubPhoto.delete({ where: { id: photoId } });
  }

  async setOpeningHours(
    clubId: string,
    hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isClosed?: boolean }>,
    actor: ActingUser,
  ) {
    await this.ensureExists(clubId);
    await assertClubScope(actor, clubId, this.prisma);
    await this.prisma.clubOpeningHour.deleteMany({ where: { clubId } });
    return this.prisma.clubOpeningHour.createMany({
      data: hours.map(h => ({ ...h, clubId })),
    });
  }

  async addSpecialHour(
    clubId: string,
    data: { date: Date; openTime?: string; closeTime?: string; isClosed: boolean; reason?: string },
    actor: ActingUser,
  ) {
    await this.ensureExists(clubId);
    await assertClubScope(actor, clubId, this.prisma);
    return this.prisma.clubSpecialHour.create({ data: { clubId, ...data } });
  }

  async deleteSpecialHour(id: string, actor: ActingUser) {
    const hour = await this.prisma.clubSpecialHour.findUnique({ where: { id }, select: { clubId: true } });
    if (!hour) throw new NotFoundException('Special hour not found');
    await assertClubScope(actor, hour.clubId, this.prisma);
    return this.prisma.clubSpecialHour.delete({ where: { id } });
  }

  async isOpenAt(clubId: string, dateTime: Date): Promise<boolean> {
    const dayOfWeek = dateTime.getDay();
    const timeStr = `${dateTime.getHours().toString().padStart(2, '0')}:${dateTime.getMinutes().toString().padStart(2, '0')}`;
    const dateOnly = new Date(dateTime.getFullYear(), dateTime.getMonth(), dateTime.getDate());

    const special = await this.prisma.clubSpecialHour.findFirst({
      where: { clubId, date: dateOnly },
    });
    if (special) {
      if (special.isClosed) return false;
      return timeStr >= special.openTime && timeStr < special.closeTime;
    }

    const regular = await this.prisma.clubOpeningHour.findUnique({
      where: { clubId_dayOfWeek: { clubId, dayOfWeek } },
    });
    if (!regular || regular.isClosed) return false;
    return timeStr >= regular.openTime && timeStr < regular.closeTime;
  }

  private computeTrialStatus(club: { status: string; trialEndsAt: Date | null }) {
    if (club.status !== 'TRIAL') return null;
    const now = new Date();
    if (!club.trialEndsAt) return { expired: false, daysRemaining: null };
    const ms = club.trialEndsAt.getTime() - now.getTime();
    const daysRemaining = Math.ceil(ms / (1000 * 60 * 60 * 24));
    return { expired: daysRemaining <= 0, daysRemaining: Math.max(0, daysRemaining), endsAt: club.trialEndsAt };
  }

  private async ensureExists(id: string) {
    const club = await this.prisma.club.findUnique({ where: { id } });
    if (!club) throw new NotFoundException('Club not found');
    return club;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
}
