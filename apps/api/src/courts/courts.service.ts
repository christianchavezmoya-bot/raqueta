import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../common/media/media.service';
import { CreateCourtDto, UpdateCourtDto, CreateCourtPricingDto, CreateCourtBlockDto } from './dto/court.dto';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';

@Injectable()
export class CourtsService {
  constructor(
    private prisma: PrismaService,
    private media: MediaService,
  ) {}

  async findByClub(clubId: string) {
    const courts = await this.prisma.court.findMany({
      where: { clubId },
      include: {
        pricing: true,
        blocks: { where: { endTime: { gt: new Date() } }, orderBy: { startTime: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    return courts.map(court => this.decorateCourt(court));
  }

  async findOne(id: string) {
    const court = await this.prisma.court.findUnique({
      where: { id },
      include: {
        pricing: true,
        blocks: { where: { endTime: { gt: new Date() } }, orderBy: { startTime: 'asc' } },
        club: { include: { profile: true } },
      },
    });
    if (!court) throw new NotFoundException('Court not found');
    return this.decorateCourt(court);
  }

  async create(clubId: string, dto: CreateCourtDto, actor: ActingUser) {
    await assertClubScope(actor, clubId, this.prisma);
    const court = await this.prisma.court.create({
      data: { ...dto, clubId },
      include: { pricing: true },
    });
    return this.decorateCourt(court);
  }

  async uploadPhoto(id: string, file: Express.Multer.File, actor: ActingUser) {
    const court = await this.ensureExists(id);
    await assertClubScope(actor, court.clubId, this.prisma);
    const url = await this.media.uploadFixed(file, `courts/${id}/photo`);
    const updated = await this.prisma.court.update({ where: { id }, data: { photoUrl: url } });
    return this.decorateCourt(updated);
  }

  async update(id: string, dto: UpdateCourtDto, actor: ActingUser) {
    const court = await this.ensureExists(id);
    await assertClubScope(actor, court.clubId, this.prisma);
    const updated = await this.prisma.court.update({ where: { id }, data: dto, include: { pricing: true, blocks: true } });
    return this.decorateCourt(updated);
  }

  async delete(id: string, actor: ActingUser) {
    const court = await this.ensureExists(id);
    await assertClubScope(actor, court.clubId, this.prisma);
    return this.prisma.court.delete({ where: { id } });
  }

  async setPricing(courtId: string, dto: CreateCourtPricingDto, actor: ActingUser) {
    const court = await this.ensureExists(courtId);
    await assertClubScope(actor, court.clubId, this.prisma);
    return this.prisma.courtPricing.upsert({
      where: { courtId_userType: { courtId, userType: dto.userType } },
      update: dto,
      create: { courtId, ...dto },
    });
  }

  async deletePricing(courtId: string, userType: string, actor: ActingUser) {
    const court = await this.ensureExists(courtId);
    await assertClubScope(actor, court.clubId, this.prisma);
    return this.prisma.courtPricing.delete({
      where: { courtId_userType: { courtId, userType } },
    });
  }

  async createBlock(courtId: string, dto: CreateCourtBlockDto, createdBy: string, actor: ActingUser) {
    const court = await this.ensureExists(courtId);
    await assertClubScope(actor, court.clubId, this.prisma);
    return this.prisma.courtBlock.create({
      data: {
        courtId,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        reason: dto.reason,
        blockType: dto.blockType ?? 'MAINTENANCE',
        createdBy,
      },
    });
  }

  async deleteBlock(blockId: string, actor: ActingUser) {
    const block = await this.prisma.courtBlock.findUnique({
      where: { id: blockId },
      include: { court: { select: { clubId: true } } },
    });
    if (!block) throw new NotFoundException('Court block not found');
    await assertClubScope(actor, block.court.clubId, this.prisma);
    return this.prisma.courtBlock.delete({ where: { id: blockId } });
  }

  async isBlocked(courtId: string, start: Date, end: Date): Promise<boolean> {
    const block = await this.prisma.courtBlock.findFirst({
      where: {
        courtId,
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });
    return !!block;
  }

  private async ensureExists(id: string) {
    const court = await this.prisma.court.findUnique({ where: { id } });
    if (!court) throw new NotFoundException('Court not found');
    return court;
  }

  private decorateCourt<T extends { photoUrl?: string | null; updatedAt?: Date | null }>(court: T): T {
    if (!court.photoUrl || !court.updatedAt) return court;
    const joiner = court.photoUrl.includes('?') ? '&' : '?';
    return {
      ...court,
      photoUrl: `${court.photoUrl}${joiner}v=${court.updatedAt.getTime()}`,
    };
  }
}
