import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../common/media/media.service';
import { CreateCourtDto, UpdateCourtDto, CreateCourtPricingDto, CreateCourtBlockDto } from './dto/court.dto';

@Injectable()
export class CourtsService {
  constructor(
    private prisma: PrismaService,
    private media: MediaService,
  ) {}

  async findByClub(clubId: string) {
    return this.prisma.court.findMany({
      where: { clubId },
      include: { pricing: true, blocks: { where: { endTime: { gt: new Date() } } } },
      orderBy: { name: 'asc' },
    });
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
    return court;
  }

  async create(clubId: string, dto: CreateCourtDto) {
    return this.prisma.court.create({
      data: { ...dto, clubId },
      include: { pricing: true },
    });
  }

  async uploadPhoto(id: string, file: Express.Multer.File) {
    await this.ensureExists(id);
    const url = await this.media.uploadFixed(file, `courts/${id}/photo`);
    return this.prisma.court.update({ where: { id }, data: { photoUrl: url } });
  }

  async update(id: string, dto: UpdateCourtDto) {
    await this.ensureExists(id);
    return this.prisma.court.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    await this.ensureExists(id);
    return this.prisma.court.delete({ where: { id } });
  }

  async setPricing(courtId: string, dto: CreateCourtPricingDto) {
    await this.ensureExists(courtId);
    return this.prisma.courtPricing.upsert({
      where: { courtId_userType: { courtId, userType: dto.userType } },
      update: dto,
      create: { courtId, ...dto },
    });
  }

  async createBlock(courtId: string, dto: CreateCourtBlockDto, createdBy: string) {
    await this.ensureExists(courtId);
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

  async deleteBlock(blockId: string) {
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
}
