import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../common/media/media.service';
import { ActingUser, assertClubScope } from '../common/utils/club-scope';

@Injectable()
export class InstructorsService {
  constructor(
    private prisma: PrismaService,
    private media: MediaService,
  ) {}

  async findByClub(clubId: string) {
    return this.prisma.instructor.findMany({
      where: { clubId, active: true },
      include: { availability: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const instructor = await this.prisma.instructor.findUnique({
      where: { id },
      include: { availability: true, club: { include: { profile: true } } },
    });
    if (!instructor) throw new NotFoundException('Instructor not found');
    return instructor;
  }

  async create(clubId: string, data: any) {
    return this.prisma.instructor.create({
      data: { ...data, clubId },
      include: { availability: true },
    });
  }

  async uploadPhoto(id: string, file: Express.Multer.File, actor: ActingUser) {
    const instructor = await this.ensureExists(id);
    await assertClubScope(actor, instructor.clubId, this.prisma);
    const url = await this.media.uploadFixed(file, `instructors/${id}/photo`);
    return this.prisma.instructor.update({ where: { id }, data: { photoUrl: url } });
  }

  async update(id: string, data: any) {
    await this.ensureExists(id);
    return this.prisma.instructor.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.ensureExists(id);
    return this.prisma.instructor.update({ where: { id }, data: { active: false } });
  }

  async setAvailability(instructorId: string, slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>) {
    await this.ensureExists(instructorId);
    await this.prisma.instructorAvailability.deleteMany({ where: { instructorId } });
    return this.prisma.instructorAvailability.createMany({
      data: slots.map(s => ({ ...s, instructorId })),
    });
  }

  private async ensureExists(id: string) {
    const inst = await this.prisma.instructor.findUnique({ where: { id } });
    if (!inst) throw new NotFoundException('Instructor not found');
    return inst;
  }
}
