import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../common/media/media.service';
import { CreateClubDto, UpdateClubProfileDto } from './dto/create-club.dto';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';

@Injectable()
export class ClubsService {
  constructor(
    private prisma: PrismaService,
    private media: MediaService,
  ) {}

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [clubs, total] = await Promise.all([
      this.prisma.club.findMany({
        skip,
        take: limit,
        where: { status: 'ACTIVE' },
        include: { profile: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.club.count({ where: { status: 'ACTIVE' } }),
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
    return club;
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
    return club;
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
